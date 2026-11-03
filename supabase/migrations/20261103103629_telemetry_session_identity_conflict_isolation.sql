-- Session collisions no longer discard valid application events.
-- The currently deployed function was verified with a transactional live-data test.
CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(p_events jsonb, p_installations jsonb, p_sessions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_events_inserted bigint := 0;
  v_written_events jsonb := '[]'::jsonb;
  v_written_event record;
  v_events jsonb := p_events;
  v_sessions jsonb := p_sessions;
  v_conflicting_session_ids text[] := ARRAY[]::text[];
  v_race_conflicting_session_ids text[] := ARRAY[]::text[];
  v_sessions_detached bigint := 0;
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

  -- Session IDs are browser-local hints, not the canonical identity of a consultation.
  -- A collision must not discard otherwise valid application events.
  WITH event_rows AS (
    SELECT
      NULLIF(item->>'session_id','') AS session_id,
      NULLIF(item->>'installation_id','') AS installation_id
    FROM jsonb_array_elements(p_events) AS item
  ),
  session_rows AS (
    SELECT
      NULLIF(item->>'session_id','') AS session_id,
      NULLIF(item->>'installation_id','') AS installation_id
    FROM jsonb_array_elements(p_sessions) AS item
  ),
  bad_session_ids AS (
    -- One session ID must never represent two installations in a single batch.
    SELECT session_id
    FROM event_rows
    WHERE session_id IS NOT NULL
    GROUP BY session_id
    HAVING count(DISTINCT installation_id) > 1

    UNION

    SELECT session_id
    FROM session_rows
    WHERE session_id IS NOT NULL
    GROUP BY session_id
    HAVING count(DISTINCT installation_id) > 1

    UNION

    -- Incoming events and their incoming session parent must agree.
    SELECT e.session_id
    FROM event_rows e
    JOIN session_rows s USING (session_id)
    WHERE e.session_id IS NOT NULL
      AND e.installation_id IS DISTINCT FROM s.installation_id

    UNION

    -- Existing session identity belongs to another installation.
    SELECT s.session_id
    FROM session_rows s
    JOIN public.verix2_sessions stored_session
      ON stored_session.session_id = s.session_id
    WHERE s.session_id IS NOT NULL
      AND stored_session.installation_id IS DISTINCT FROM s.installation_id

    UNION

    SELECT e.session_id
    FROM event_rows e
    JOIN public.verix2_sessions stored_session
      ON stored_session.session_id = e.session_id
    WHERE e.session_id IS NOT NULL
      AND stored_session.installation_id IS DISTINCT FROM e.installation_id

    UNION

    -- Do not let an event create a foreign-key reference to a missing session.
    SELECT e.session_id
    FROM event_rows e
    LEFT JOIN session_rows incoming_session
      ON incoming_session.session_id = e.session_id
     AND incoming_session.installation_id = e.installation_id
    LEFT JOIN public.verix2_sessions stored_session
      ON stored_session.session_id = e.session_id
     AND stored_session.installation_id = e.installation_id
    WHERE e.session_id IS NOT NULL
      AND incoming_session.session_id IS NULL
      AND stored_session.session_id IS NULL
  )
  SELECT COALESCE(array_agg(DISTINCT session_id), ARRAY[]::text[])
    INTO v_conflicting_session_ids
  FROM bad_session_ids
  WHERE session_id IS NOT NULL;

  IF cardinality(v_conflicting_session_ids) > 0 THEN
    SELECT count(*)
      INTO v_sessions_detached
    FROM jsonb_array_elements(v_events) AS item
    WHERE NULLIF(item->>'session_id','') = ANY(v_conflicting_session_ids);

    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN NULLIF(item->>'session_id','') = ANY(v_conflicting_session_ids)
          THEN jsonb_set(
                 jsonb_set(item, '{session_id}', 'null'::jsonb, true),
                 '{tab_id}', 'null'::jsonb, true
               )
          ELSE item
        END
        ORDER BY ordinal
      ),
      '[]'::jsonb
    )
    INTO v_events
    FROM jsonb_array_elements(v_events) WITH ORDINALITY AS rows(item, ordinal);

    SELECT COALESCE(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
      INTO v_sessions
    FROM jsonb_array_elements(v_sessions) WITH ORDINALITY AS rows(item, ordinal)
    WHERE COALESCE(item->>'session_id','') <> ALL(v_conflicting_session_ids);
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
    FROM jsonb_to_recordset(v_sessions) AS payload(
      session_id text,
      installation_id text,
      tab_id text,
      started_at timestamptz,
      last_seen timestamptz
    )
    ON CONFLICT (session_id) DO UPDATE SET
      started_at = LEAST(current_session.started_at, EXCLUDED.started_at),
      tab_id = COALESCE(EXCLUDED.tab_id, current_session.tab_id)
    WHERE current_session.installation_id = EXCLUDED.installation_id;

    -- Re-check after the upsert: a concurrent transaction may have claimed a
    -- session ID after the initial check. Keep the event, but detach that identity.
    WITH event_rows AS (
      SELECT
        NULLIF(item->>'session_id','') AS session_id,
        NULLIF(item->>'installation_id','') AS installation_id
      FROM jsonb_array_elements(v_events) AS item
    ),
    session_rows AS (
      SELECT
        NULLIF(item->>'session_id','') AS session_id,
        NULLIF(item->>'installation_id','') AS installation_id
      FROM jsonb_array_elements(v_sessions) AS item
    ),
    bad_session_ids AS (
      SELECT s.session_id
      FROM session_rows s
      JOIN public.verix2_sessions stored_session
        ON stored_session.session_id = s.session_id
      WHERE s.session_id IS NOT NULL
        AND stored_session.installation_id IS DISTINCT FROM s.installation_id

      UNION

      SELECT e.session_id
      FROM event_rows e
      LEFT JOIN public.verix2_sessions stored_session
        ON stored_session.session_id = e.session_id
      WHERE e.session_id IS NOT NULL
        AND (
          stored_session.session_id IS NULL
          OR stored_session.installation_id IS DISTINCT FROM e.installation_id
        )
    )
    SELECT COALESCE(array_agg(DISTINCT session_id), ARRAY[]::text[])
      INTO v_race_conflicting_session_ids
    FROM bad_session_ids
    WHERE session_id IS NOT NULL;

    IF cardinality(v_race_conflicting_session_ids) > 0 THEN
      SELECT count(*)
        INTO v_sessions_detached
      FROM jsonb_array_elements(v_events) AS item
      WHERE NULLIF(item->>'session_id','') = ANY(v_race_conflicting_session_ids);

      SELECT COALESCE(
        jsonb_agg(
          CASE
            WHEN NULLIF(item->>'session_id','') = ANY(v_race_conflicting_session_ids)
            THEN jsonb_set(
                   jsonb_set(item, '{session_id}', 'null'::jsonb, true),
                   '{tab_id}', 'null'::jsonb, true
                 )
            ELSE item
          END
          ORDER BY ordinal
        ),
        '[]'::jsonb
      )
      INTO v_events
      FROM jsonb_array_elements(v_events) WITH ORDINALITY AS rows(item, ordinal);

      SELECT COALESCE(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
        INTO v_sessions
      FROM jsonb_array_elements(v_sessions) WITH ORDINALITY AS rows(item, ordinal)
      WHERE COALESCE(item->>'session_id','') <> ALL(v_race_conflicting_session_ids);
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
        FROM jsonb_to_recordset(v_events) AS payload(
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
      RETURN jsonb_build_object('ok', true, 'events_inserted', 0, 'sessions_detached', v_sessions_detached);
  END;

  RETURN jsonb_build_object('ok', true, 'events_inserted', v_events_inserted, 'sessions_detached', v_sessions_detached);
END;
$function$


REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb)
  TO service_role;
