CREATE OR REPLACE FUNCTION public.verix2_keep_seen_monotonic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.last_seen IS NOT NULL
     AND (NEW.last_seen IS NULL OR NEW.last_seen < OLD.last_seen) THEN
    NEW.last_seen := OLD.last_seen;
  END IF;

  -- These tables have different row shapes: installations use first_seen,
  -- while sessions use started_at. Never dereference a column that is absent
  -- from the triggering table's OLD/NEW record.
  IF TG_TABLE_NAME = 'verix2_installations' THEN
    IF OLD.first_seen IS NOT NULL
       AND (NEW.first_seen IS NULL OR NEW.first_seen > OLD.first_seen) THEN
      NEW.first_seen := OLD.first_seen;
    END IF;
  ELSIF TG_TABLE_NAME = 'verix2_sessions' THEN
    IF OLD.started_at IS NOT NULL
       AND (NEW.started_at IS NULL OR NEW.started_at > OLD.started_at) THEN
      NEW.started_at := OLD.started_at;
    END IF;
  ELSE
    RAISE EXCEPTION 'verix2_keep_seen_monotonic used on unsupported table: %', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$function$;

-- Atomic write path for VÉRIX V2 telemetry.
-- verix2_events has immediate foreign keys to verix2_installations and
-- verix2_sessions. A single RPC inserts FK parents first, writes events, and
-- advances last_seen only from rows actually inserted. Any other failure
-- aborts the whole function statement and rolls back all changes.

CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(
  p_events jsonb,
  p_installations jsonb,
  p_sessions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_events_inserted bigint := 0;
  v_written_events jsonb := '[]'::jsonb;
  v_written_event record;
BEGIN
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_installations) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_sessions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'telemetry ingestion expects JSON arrays'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_events) AS event_row(
      event_id text,
      installation_id text,
      session_id text,
      event text,
      occurred_at timestamptz
    )
    WHERE NULLIF(BTRIM(event_row.event_id), '') IS NULL
       OR NULLIF(BTRIM(event_row.installation_id), '') IS NULL
       OR NULLIF(BTRIM(event_row.event), '') IS NULL
       OR event_row.occurred_at IS NULL
  ) THEN
    RAISE EXCEPTION 'telemetry event is missing a required field'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_installations) AS installation_row(
      installation_id text,
      first_seen timestamptz,
      last_seen timestamptz
    )
    WHERE NULLIF(BTRIM(installation_row.installation_id), '') IS NULL
       OR installation_row.first_seen IS NULL
       OR installation_row.last_seen IS NULL
  ) THEN
    RAISE EXCEPTION 'telemetry installation is missing a required field'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_sessions) AS session_row(
      session_id text,
      installation_id text,
      started_at timestamptz,
      last_seen timestamptz
    )
    WHERE NULLIF(BTRIM(session_row.session_id), '') IS NULL
       OR NULLIF(BTRIM(session_row.installation_id), '') IS NULL
       OR session_row.started_at IS NULL
       OR session_row.last_seen IS NULL
  ) THEN
    RAISE EXCEPTION 'telemetry session is missing a required field'
      USING ERRCODE = '22023';
  END IF;

  -- Reject both in-batch and cross-request session identity collisions.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_events) AS event_row(
      installation_id text,
      session_id text
    )
    JOIN jsonb_to_recordset(p_sessions) AS session_row(
      session_id text,
      installation_id text
    ) ON session_row.session_id = event_row.session_id
    WHERE event_row.installation_id IS DISTINCT FROM session_row.installation_id
  ) THEN
    RAISE EXCEPTION 'telemetry session ID maps to multiple installation IDs in the batch'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_sessions) AS session_row(
      session_id text,
      installation_id text
    )
    JOIN public.verix2_sessions AS stored_session
      ON stored_session.session_id = session_row.session_id
    WHERE stored_session.installation_id IS DISTINCT FROM session_row.installation_id
  ) THEN
    RAISE EXCEPTION 'telemetry session ID conflicts with its stored installation ID'
      USING ERRCODE = '23503';
  END IF;

  -- New parent rows start outside the online windows. Existing last_seen
  -- values are left untouched until accepted event rows are known.
  -- If no event is inserted, a controlled subtransaction below rolls these
  -- writes back instead of creating presence without a canonical event.
  BEGIN
    INSERT INTO public.verix2_installations AS current_installation (
      installation_id,
      first_seen,
      last_seen,
      app_version,
      device_type,
      browser,
      os
    )
    SELECT
      payload.installation_id,
      payload.first_seen,
      LEAST(payload.last_seen, now() - interval '11 minutes'),
      payload.app_version,
      payload.device_type,
      payload.browser,
      payload.os
    FROM jsonb_to_recordset(p_installations) AS payload(
      installation_id text,
      first_seen timestamptz,
      last_seen timestamptz,
      app_version text,
      device_type text,
      browser text,
      os text
    )
    ON CONFLICT (installation_id) DO UPDATE SET
      first_seen = LEAST(current_installation.first_seen, EXCLUDED.first_seen),
      app_version = COALESCE(EXCLUDED.app_version, current_installation.app_version),
      device_type = COALESCE(EXCLUDED.device_type, current_installation.device_type),
      browser = COALESCE(EXCLUDED.browser, current_installation.browser),
      os = COALESCE(EXCLUDED.os, current_installation.os);

    INSERT INTO public.verix2_sessions AS current_session (
      session_id,
      installation_id,
      tab_id,
      started_at,
      last_seen
    )
    SELECT
      payload.session_id,
      payload.installation_id,
      payload.tab_id,
      payload.started_at,
      LEAST(payload.last_seen, now() - interval '11 minutes')
    FROM jsonb_to_recordset(p_sessions) AS payload(
      session_id text,
      installation_id text,
      tab_id text,
      started_at timestamptz,
      last_seen timestamptz
    )
    ON CONFLICT (session_id) DO UPDATE SET
      started_at = LEAST(current_session.started_at, EXCLUDED.started_at),
      tab_id = COALESCE(EXCLUDED.tab_id, current_session.tab_id);

    -- Re-check after the upsert: a concurrent transaction may have inserted
    -- this session ID after the pre-check. A mismatch aborts the full RPC.
    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_sessions) AS session_row(
        session_id text,
        installation_id text
      )
      JOIN public.verix2_sessions AS stored_session
        ON stored_session.session_id = session_row.session_id
      WHERE stored_session.installation_id IS DISTINCT FROM session_row.installation_id
    ) THEN
      RAISE EXCEPTION 'telemetry session ID conflicts with its stored installation ID after upsert'
        USING ERRCODE = '23503';
    END IF;

    -- Capture only rows accepted by every unique index, including the
    -- partial unique indexes on query_id which can race between requests.
    FOR v_written_event IN
      WITH inserted AS (
        INSERT INTO public.verix2_events (
          event_id,
          installation_id,
          session_id,
          tab_id,
          query_id,
          event,
          module,
          occurred_at,
          app_version,
          device_type,
          browser,
          metadata
        )
        SELECT
          payload.event_id,
          payload.installation_id,
          payload.session_id,
          payload.tab_id,
          payload.query_id,
          payload.event,
          payload.module,
          payload.occurred_at,
          payload.app_version,
          payload.device_type,
          payload.browser,
          COALESCE(payload.metadata, '{}'::jsonb)
        FROM jsonb_to_recordset(p_events) AS payload(
          event_id text,
          installation_id text,
          session_id text,
          tab_id text,
          query_id text,
          event text,
          module text,
          occurred_at timestamptz,
          app_version text,
          device_type text,
          browser text,
          metadata jsonb
        )
        ON CONFLICT DO NOTHING
        RETURNING installation_id, session_id, occurred_at
      )
      SELECT installation_id, session_id, occurred_at
      FROM inserted
    LOOP
      v_events_inserted := v_events_inserted + 1;
      v_written_events := v_written_events || jsonb_build_array(
        jsonb_build_object(
          'installation_id', v_written_event.installation_id,
          'session_id', v_written_event.session_id,
          'occurred_at', v_written_event.occurred_at
        )
      );
    END LOOP;

    IF v_events_inserted = 0 THEN
      -- This custom exception rolls back the parent upserts in this block,
      -- while treating an idempotent duplicate batch as a successful no-op.
      RAISE EXCEPTION 'telemetry batch inserted no new events'
        USING ERRCODE = 'PZ001';
    END IF;

    UPDATE public.verix2_installations AS current_installation
    SET last_seen = GREATEST(current_installation.last_seen, accepted.last_seen)
    FROM (
      SELECT installation_id, MAX(occurred_at) AS last_seen
      FROM jsonb_to_recordset(v_written_events) AS accepted_event(
        installation_id text,
        session_id text,
        occurred_at timestamptz
      )
      GROUP BY installation_id
    ) AS accepted
    WHERE current_installation.installation_id = accepted.installation_id;

    UPDATE public.verix2_sessions AS current_session
    SET last_seen = GREATEST(current_session.last_seen, accepted.last_seen)
    FROM (
      SELECT session_id, MAX(occurred_at) AS last_seen
      FROM jsonb_to_recordset(v_written_events) AS accepted_event(
        installation_id text,
        session_id text,
        occurred_at timestamptz
      )
      WHERE session_id IS NOT NULL
      GROUP BY session_id
    ) AS accepted
    WHERE current_session.session_id = accepted.session_id;

  EXCEPTION
    WHEN SQLSTATE 'PZ001' THEN
      RETURN jsonb_build_object('ok', true, 'events_inserted', 0);
  END;

  RETURN jsonb_build_object('ok', true, 'events_inserted', v_events_inserted);
END;
$function$;

REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb)
  TO service_role;
