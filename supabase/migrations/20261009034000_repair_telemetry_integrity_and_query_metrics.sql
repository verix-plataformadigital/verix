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


-- Corrected query lifecycle metrics: starts are vehicle_lookup events, and
-- final counts only include queries with exactly one outcome. Contradictions,
-- duplicate finals, pending, incomplete, and orphan final records stay separate.
CREATE OR REPLACE FUNCTION public.verix2_admin_analytics(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
WITH b AS (
  SELECT
    greatest(
      p_now - interval '24 hours',
      coalesce((SELECT reset_24h_at FROM public.verix2_dashboard_state WHERE singleton=true),
               '1970-01-01T00:00:00Z'::timestamptz)
    ) AS s24,
    greatest(p_now - interval '7 days', public.verix2_all_start(p_now)) AS s7,
    greatest(p_now - interval '30 days', public.verix2_all_start(p_now)) AS s30,
    p_now AS enow
),
ev AS (
  SELECT e.event_id,e.installation_id,e.session_id,e.query_id,e.event,e.module,
         e.occurred_at,e.app_version,e.device_type,e.browser,e.metadata
  FROM public.verix2_events e,b
  WHERE e.occurred_at >= b.s30 AND e.occurred_at < b.enow
),
q AS (
  -- A query starts only when vehicle_lookup is recorded. Outcome events must
  -- never inflate the number of started queries.
  SELECT query_id,min(occurred_at) AS first_at
  FROM ev WHERE event='vehicle_lookup' AND query_id IS NOT NULL
  GROUP BY query_id
),
final_counts AS (
  SELECT query_id,
         count(*) AS final_event_count,
         count(DISTINCT event) AS final_type_count,
         min(event) AS event,
         max(occurred_at) AS occurred_at,
         (array_agg(metadata ORDER BY occurred_at DESC,event_id DESC))[1] AS metadata,
         (array_agg(installation_id ORDER BY occurred_at DESC,event_id DESC))[1] AS installation_id,
         (array_agg(app_version ORDER BY occurred_at DESC,event_id DESC))[1] AS app_version,
         (array_agg(browser ORDER BY occurred_at DESC,event_id DESC))[1] AS browser,
         (array_agg(device_type ORDER BY occurred_at DESC,event_id DESC))[1] AS device_type
  FROM ev
  WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
    AND query_id IS NOT NULL
  GROUP BY query_id
),
-- A query has a valid final only if exactly one final outcome exists.
-- Contradictory or repeated finals remain visible in query_quality.
finals AS (
  SELECT query_id,event,occurred_at,metadata,installation_id,app_version,browser,device_type
  FROM final_counts
  WHERE final_event_count=1
),
query_quality AS (
  SELECT q.query_id,
         q.first_at,
         COALESCE(fc.final_event_count,0) AS final_event_count,
         COALESCE(fc.final_type_count,0) AS final_type_count,
         fc.event AS final_event,
         fc.occurred_at AS final_at,
         CASE
           WHEN fc.final_event_count=1 THEN 'valid'
           WHEN COALESCE(fc.final_event_count,0)>1 AND COALESCE(fc.final_type_count,0)>1 THEN 'contradictory'
           WHEN COALESCE(fc.final_event_count,0)>1 THEN 'duplicate_finals'
           WHEN EXISTS (
             SELECT 1 FROM ev pe
             WHERE pe.query_id=q.query_id AND pe.event='vehicle_insurance_pending'
           ) THEN 'pending'
           ELSE 'incomplete'
         END AS outcome_state
  FROM q
  LEFT JOIN final_counts fc ON fc.query_id=q.query_id
),
overview AS (
  SELECT jsonb_build_object(
    'online_now',(SELECT count(DISTINCT installation_id) FROM (
      SELECT installation_id FROM public.verix2_installations WHERE last_seen >= p_now-interval '5 minutes'
      UNION SELECT installation_id FROM public.verix2_sessions WHERE last_seen >= p_now-interval '5 minutes'
      UNION SELECT installation_id FROM ev WHERE occurred_at >= p_now-interval '5 minutes'
    ) active5),
    'active_10m',(SELECT count(DISTINCT installation_id) FROM (
      SELECT installation_id FROM public.verix2_installations WHERE last_seen >= p_now-interval '10 minutes'
      UNION SELECT installation_id FROM public.verix2_sessions WHERE last_seen >= p_now-interval '10 minutes'
      UNION SELECT installation_id FROM ev WHERE occurred_at >= p_now-interval '10 minutes'
    ) active10),
    'unique_24h',count(DISTINCT installation_id) FILTER(WHERE occurred_at >= b.s24),
    'unique_7d',count(DISTINCT installation_id) FILTER(WHERE occurred_at >= b.s7),
    'unique_30d',count(DISTINCT installation_id),
    'events_24h',count(*) FILTER(WHERE occurred_at >= b.s24),
    'events_7d',count(*) FILTER(WHERE occurred_at >= b.s7),
    'events_30d',count(*),
    'last_event_at',max(occurred_at)
  ) data
  FROM ev,b
),
ret AS (
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'unique',count(*) FILTER(WHERE last_seen>=b.s24),
      'new',count(*) FILTER(WHERE first_seen>=b.s24),
      'returning',count(*) FILTER(WHERE last_seen>=b.s24 AND first_seen<b.s24)),
    '7d',jsonb_build_object(
      'unique',count(*) FILTER(WHERE last_seen>=b.s7),
      'new',count(*) FILTER(WHERE first_seen>=b.s7),
      'returning',count(*) FILTER(WHERE last_seen>=b.s7 AND first_seen<b.s7)),
    '30d',jsonb_build_object(
      'unique',count(*) FILTER(WHERE last_seen>=b.s30),
      'new',count(*) FILTER(WHERE first_seen>=b.s30),
      'returning',count(*) FILTER(WHERE last_seen>=b.s30 AND first_seen<b.s30))
  ) data
  FROM public.verix2_installations i,b
),
insurance AS (
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'started',(SELECT count(*) FROM q WHERE first_at>=b.s24),
      'finals',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='valid'),
      'insured',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='valid' AND final_event='vehicle_insurance_yes'),
      'uninsured',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='valid' AND final_event='vehicle_insurance_no'),
      'errors',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='valid' AND final_event='vehicle_insurance_error'),
      'pending',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='pending'),
      'incomplete',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='incomplete'),
      'contradictory',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='contradictory'),
      'duplicate_finals',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='duplicate_finals'),
      'multi_final',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND final_event_count>1),
      'orphan_finals',(SELECT count(*) FROM final_counts fc WHERE fc.occurred_at>=b.s24 AND NOT EXISTS(SELECT 1 FROM public.verix2_events lookup_event WHERE lookup_event.event='vehicle_lookup' AND lookup_event.query_id=fc.query_id))
    ),
    '7d',jsonb_build_object(
      'started',(SELECT count(*) FROM q WHERE first_at>=b.s7),
      'finals',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='valid'),
      'insured',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='valid' AND final_event='vehicle_insurance_yes'),
      'uninsured',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='valid' AND final_event='vehicle_insurance_no'),
      'errors',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='valid' AND final_event='vehicle_insurance_error'),
      'pending',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='pending'),
      'incomplete',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='incomplete'),
      'contradictory',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='contradictory'),
      'duplicate_finals',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='duplicate_finals'),
      'multi_final',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND final_event_count>1),
      'orphan_finals',(SELECT count(*) FROM final_counts fc WHERE fc.occurred_at>=b.s7 AND NOT EXISTS(SELECT 1 FROM public.verix2_events lookup_event WHERE lookup_event.event='vehicle_lookup' AND lookup_event.query_id=fc.query_id))
    ),
    '30d',jsonb_build_object(
      'started',(SELECT count(*) FROM q),
      'finals',(SELECT count(*) FROM query_quality WHERE outcome_state='valid'),
      'insured',(SELECT count(*) FROM query_quality WHERE outcome_state='valid' AND final_event='vehicle_insurance_yes'),
      'uninsured',(SELECT count(*) FROM query_quality WHERE outcome_state='valid' AND final_event='vehicle_insurance_no'),
      'errors',(SELECT count(*) FROM query_quality WHERE outcome_state='valid' AND final_event='vehicle_insurance_error'),
      'pending',(SELECT count(*) FROM query_quality WHERE outcome_state='pending'),
      'incomplete',(SELECT count(*) FROM query_quality WHERE outcome_state='incomplete'),
      'contradictory',(SELECT count(*) FROM query_quality WHERE outcome_state='contradictory'),
      'duplicate_finals',(SELECT count(*) FROM query_quality WHERE outcome_state='duplicate_finals'),
      'multi_final',(SELECT count(*) FROM query_quality WHERE final_event_count>1),
      'orphan_finals',(SELECT count(*) FROM final_counts fc WHERE NOT EXISTS(SELECT 1 FROM public.verix2_events lookup_event WHERE lookup_event.event='vehicle_lookup' AND lookup_event.query_id=fc.query_id))
    )
  ) data
  FROM b
),
ins_quality AS (
  SELECT jsonb_build_object(
    'latency_p50_ms',(SELECT round((percentile_cont(.5) WITHIN GROUP(
      ORDER BY (metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
      FROM finals,b WHERE occurred_at>=b.s24 AND (metadata->'asfDiagnostic'->>'asfDurationMs')~'^[0-9]+(\\.[0-9]+)?$'),
    'latency_p95_ms',(SELECT round((percentile_cont(.95) WITHIN GROUP(
      ORDER BY (metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
      FROM finals,b WHERE occurred_at>=b.s24 AND (metadata->'asfDiagnostic'->>'asfDurationMs')~'^[0-9]+(\\.[0-9]+)?$'),
    'known_plates_24h',(SELECT count(DISTINCT upper(regexp_replace(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula',''),'[^A-Z0-9]','','g')))
      FROM finals,b WHERE occurred_at>=b.s24 AND coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')<>''),
    'known_plates_30d',(SELECT count(DISTINCT upper(regexp_replace(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula',''),'[^A-Z0-9]','','g')))
      FROM finals WHERE coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')<>'')
  ) data
),
retry AS (
  SELECT jsonb_build_object(
    'attempts_24h',count(*) FILTER(WHERE occurred_at>=b.s24 AND metadata->>'retry'='true'),
    'attempts_30d',count(*) FILTER(WHERE metadata->>'retry'='true'),
    'retry_finals_24h',count(*) FILTER(WHERE occurred_at>=b.s24 AND metadata->>'retryOf' IS NOT NULL)
  ) data
  FROM finals,b
),
err_types AS (
  SELECT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown') kind,
         count(*) qty,
         round(avg(CASE WHEN (metadata->'asfDiagnostic'->>'asfDurationMs')~'^[0-9]+(\\.[0-9]+)?$'
           THEN (metadata->'asfDiagnostic'->>'asfDurationMs')::numeric END)) avg_ms,
         count(DISTINCT metadata->'asfDiagnostic'->>'asfResponseHash') hash_qty,
         max(occurred_at) last_at
  FROM ev,b
  WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24
  GROUP BY 1 ORDER BY qty DESC,kind
),
err_bursts AS (
  SELECT date_trunc('minute',occurred_at) minute_key,count(*) qty,count(DISTINCT installation_id) installs
  FROM ev,b WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24
  GROUP BY 1 ORDER BY qty DESC,minute_key DESC LIMIT 15
),
err_installs AS (
  SELECT installation_id,count(*) qty,count(DISTINCT query_id) queries,max(occurred_at) last_at
  FROM ev,b WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24
  GROUP BY 1 ORDER BY qty DESC,last_at DESC LIMIT 15
),
err_clients AS (
  SELECT coalesce(metadata->'client'->>'browser',browser,'Unknown') browser_name,
         coalesce(metadata->'client'->>'browserVersion','Unknown') browser_version,
         coalesce(metadata->'client'->>'osPlatform','Unknown') os_platform,
         coalesce(metadata->'client'->>'osVersion','Unknown') os_version,
         coalesce(metadata->'client'->>'effectiveType','Unknown') network_type,
         count(*) finals_qty,
         count(*) FILTER(WHERE event='vehicle_insurance_error') error_qty
  FROM ev,b
  WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
    AND occurred_at>=b.s24
  GROUP BY 1,2,3,4,5
  ORDER BY error_qty DESC,finals_qty DESC LIMIT 30
),
err_signatures AS (
  SELECT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown') kind,
         coalesce(metadata->'asfDiagnostic'->>'asfResponseHash','sem-hash') response_hash,
         coalesce(NULLIF(metadata->'asfDiagnostic'->'asfGraphqlMessages'->>0,''),
                  NULLIF(metadata->'asfDiagnostic'->>'asfMessage',''),
                  NULLIF(metadata->>'asfUserMessage',''),'') message_text,
         count(*) qty,count(DISTINCT query_id) queries,count(DISTINCT installation_id) installs
  FROM ev,b
  WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24
  GROUP BY 1,2,3 ORDER BY qty DESC,kind LIMIT 20
),
err_plates AS (
  SELECT upper(regexp_replace(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula',''),'[^A-Z0-9]','','g')) plate_key,
         max(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula')) plate,
         count(*) qty,max(occurred_at) last_at,
         array_agg(DISTINCT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown')) kinds
  FROM ev,b
  WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24
    AND coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')<>''
  GROUP BY 1 ORDER BY qty DESC,last_at DESC LIMIT 20
),
speed_data AS (
  SELECT e.*,e.metadata->'cin' cin
  FROM ev e
  WHERE e.event IN('cinemometer_speed_entry','cinemometer_calculation')
    AND e.metadata ? 'cin'
),
speed_num AS (
  SELECT *,CASE WHEN cin->>'velocidade_registada'~'^[0-9]+(\\.[0-9]+)?$'
    THEN (cin->>'velocidade_registada')::numeric END speed_val
  FROM speed_data
),
speed_summary AS (
  SELECT jsonb_build_object(
    'detail_events_24h',count(*) FILTER(WHERE occurred_at>=b.s24),
    'calculations_24h',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='cinemometer_calculation'),
    'speed_entries_24h',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='cinemometer_speed_entry'),
    'distinct_24h',count(DISTINCT speed_val) FILTER(WHERE occurred_at>=b.s24),
    'min_24h',min(speed_val) FILTER(WHERE occurred_at>=b.s24),
    'max_24h',max(speed_val) FILTER(WHERE occurred_at>=b.s24),
    'avg_24h',round(avg(speed_val) FILTER(WHERE occurred_at>=b.s24),1),
    'p50_24h',round((percentile_cont(.5) WITHIN GROUP(ORDER BY speed_val) FILTER(WHERE occurred_at>=b.s24))::numeric,1),
    'detail_coverage_30d',round((100.0*count(*) FILTER(WHERE occurred_at>=b.s30)/(NULLIF((SELECT count(*) FROM ev WHERE event IN('cinemometer_speed_entry','cinemometer_calculation')),0)))::numeric,1)
  ) data FROM speed_num,b
),
speed_dist AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.bucket_start),'[]'::jsonb) data
  FROM(
    SELECT (floor(speed_val/10)*10)::int bucket_start,count(*) qty
    FROM speed_num,b WHERE occurred_at>=b.s24 AND speed_val IS NOT NULL
    GROUP BY 1
  ) x
),
speed_dims AS (
  SELECT jsonb_build_object(
    'modo',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(
      SELECT cin->>'modo' value,count(*) qty FROM speed_data,b WHERE occurred_at>=b.s30 AND cin->>'modo' IS NOT NULL GROUP BY 1 ORDER BY qty DESC LIMIT 12)x),'[]'::jsonb),
    'veiculo',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(
      SELECT cin->>'veiculo' value,count(*) qty FROM speed_data,b WHERE occurred_at>=b.s30 AND cin->>'veiculo' IS NOT NULL GROUP BY 1 ORDER BY qty DESC LIMIT 12)x),'[]'::jsonb),
    'enquadramento',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(
      SELECT cin->>'enquadramento' value,count(*) qty FROM speed_data,b WHERE occurred_at>=b.s30 AND cin->>'enquadramento' IS NOT NULL GROUP BY 1 ORDER BY qty DESC LIMIT 12)x),'[]'::jsonb),
    'limite',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(
      SELECT cin->>'limite' value,count(*) qty FROM speed_data,b WHERE occurred_at>=b.s30 AND cin->>'limite' IS NOT NULL GROUP BY 1 ORDER BY qty DESC LIMIT 12)x),'[]'::jsonb),
    'gravidade',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(
      SELECT cin->>'gravidade' value,count(*) qty FROM speed_data,b WHERE occurred_at>=b.s30 AND cin->>'gravidade' IS NOT NULL GROUP BY 1 ORDER BY qty DESC LIMIT 12)x),'[]'::jsonb),
    'codigo',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(
      SELECT cin->>'codigo' value,count(*) qty FROM speed_data,b WHERE occurred_at>=b.s30 AND cin->>'codigo' IS NOT NULL GROUP BY 1 ORDER BY qty DESC LIMIT 20)x),'[]'::jsonb)
  ) data
),
speed_operators AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data
  FROM(
    SELECT coalesce(nullif(cin->>'operador_numero',''),'—') numero,
           coalesce(nullif(cin->>'operador_nome',''),'—') nome,
           coalesce(nullif(cin->>'operador_posto',''),'—') posto,
           count(*) qty,
           count(DISTINCT coalesce(cin->>'operation_id',session_id)) operations
    FROM speed_data,b WHERE occurred_at>=b.s30
    GROUP BY 1,2,3 ORDER BY qty DESC LIMIT 25
  ) x
),
speed_apparatus AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data
  FROM(
    SELECT coalesce(nullif(cin->>'aparelho_marca',''),'—') marca,
           coalesce(nullif(cin->>'aparelho_modelo',''),'—') modelo,
           coalesce(nullif(cin->>'aparelho_serie',''),'—') serie,
           count(*) qty,
           count(DISTINCT coalesce(cin->>'operation_id',session_id)) operations
    FROM speed_data,b WHERE occurred_at>=b.s30
    GROUP BY 1,2,3 ORDER BY qty DESC LIMIT 25
  ) x
),
leg_counts AS (
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'opens',count(*) FILTER(WHERE event='legislation_category_open' AND occurred_at>=b.s24),
      'searches',count(*) FILTER(WHERE event='legislation_search' AND occurred_at>=b.s24),
      'copies',count(*) FILTER(WHERE event='legislation_copy' AND occurred_at>=b.s24),
      'favorites',count(*) FILTER(WHERE event='legislation_favorite_toggle' AND occurred_at>=b.s24)),
    '7d',jsonb_build_object(
      'opens',count(*) FILTER(WHERE event='legislation_category_open' AND occurred_at>=b.s7),
      'searches',count(*) FILTER(WHERE event='legislation_search' AND occurred_at>=b.s7),
      'copies',count(*) FILTER(WHERE event='legislation_copy' AND occurred_at>=b.s7),
      'favorites',count(*) FILTER(WHERE event='legislation_favorite_toggle' AND occurred_at>=b.s7)),
    '30d',jsonb_build_object(
      'opens',count(*) FILTER(WHERE event='legislation_category_open'),
      'searches',count(*) FILTER(WHERE event='legislation_search'),
      'copies',count(*) FILTER(WHERE event='legislation_copy'),
      'favorites',count(*) FILTER(WHERE event='legislation_favorite_toggle'))
  ) data FROM ev,b
),
leg_items AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data
  FROM(
    SELECT metadata->>'itemId' item_id,metadata->>'itemLabel' item_label,count(*) qty,
           count(*) FILTER(WHERE metadata->>'copyType'='code') code_qty,
           count(*) FILTER(WHERE metadata->>'copyType'='description') desc_qty,
           count(*) FILTER(WHERE metadata->>'copyType'='all') all_qty
    FROM ev WHERE event='legislation_copy'
    GROUP BY 1,2 ORDER BY qty DESC,item_label LIMIT 30
  ) x
),
leg_copytypes AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data
  FROM(
    SELECT coalesce(metadata->>'copyType','unknown') kind,count(*) qty
    FROM ev WHERE event='legislation_copy' GROUP BY 1
  ) x
),
modules AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data
  FROM(
    SELECT coalesce(module,'(sem módulo)') module,count(*) qty
    FROM ev WHERE event='module_open' GROUP BY 1
  ) x
),
module_activity AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data
  FROM(
    SELECT coalesce(module,'(sem módulo)') module,count(*) qty
    FROM ev GROUP BY 1
  ) x
),
sess AS (
  SELECT session_id,min(occurred_at) first_at,max(occurred_at) last_at,
         count(*) total_events,count(*) FILTER(WHERE event<>'heartbeat') actions,
         count(DISTINCT module) FILTER(WHERE module IS NOT NULL) modules
  FROM ev WHERE session_id IS NOT NULL GROUP BY 1
),
session_metrics AS (
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'sessions',count(*) FILTER(WHERE first_at>=b.s24),
      'median_minutes',round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60) FILTER(WHERE first_at>=b.s24))::numeric,1),
      'p95_minutes',round((percentile_cont(.95) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60) FILTER(WHERE first_at>=b.s24))::numeric,1),
      'avg_actions',round((avg(actions) FILTER(WHERE first_at>=b.s24))::numeric,1),
      'multi_module_pct',round((100.0*count(*) FILTER(WHERE first_at>=b.s24 AND modules>=2)/NULLIF(count(*) FILTER(WHERE first_at>=b.s24),0))::numeric,1),
      'power_sessions',count(*) FILTER(WHERE first_at>=b.s24 AND actions>=10)
    ),
    '30d',jsonb_build_object(
      'sessions',count(*),
      'median_minutes',round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60))::numeric,1),
      'p95_minutes',round((percentile_cont(.95) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60))::numeric,1),
      'avg_actions',round(avg(actions)::numeric,1),
      'multi_module_pct',round((100.0*count(*) FILTER(WHERE modules>=2)/NULLIF(count(*),0))::numeric,1),
      'power_sessions',count(*) FILTER(WHERE actions>=10)
    )
  ) data FROM sess,b
),
transitions AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data
  FROM(
    SELECT arr[i] from_module,arr[i+1] to_module,count(*) qty
    FROM(
      SELECT session_id,array_agg(module ORDER BY occurred_at) arr
      FROM ev WHERE event='module_open' AND session_id IS NOT NULL AND module IS NOT NULL
      GROUP BY 1
    ) s,generate_subscripts(arr,1) g(i)
    WHERE i<array_length(arr,1)
    GROUP BY 1,2 ORDER BY qty DESC LIMIT 20
  ) x
),
daily AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.day_key),'[]'::jsonb) data
  FROM(
    SELECT (occurred_at AT TIME ZONE 'Europe/Lisbon')::date day_key,
           count(DISTINCT installation_id) users,
           count(*) FILTER(WHERE event='app_open') opens,
           count(*) FILTER(WHERE event='vehicle_lookup') lookups,
           count(*) FILTER(WHERE event='vehicle_insurance_error') asf_errors,
           count(*) FILTER(WHERE event='cinemometer_calculation') speed_calcs,
           count(*) FILTER(WHERE event='legislation_copy') leg_copies
    FROM ev GROUP BY 1 ORDER BY 1
  ) x
),
hourly AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.hour_num),'[]'::jsonb) data
  FROM(
    SELECT extract(hour FROM occurred_at AT TIME ZONE 'Europe/Lisbon')::int hour_num,
           count(*) FILTER(WHERE event<>'heartbeat') actions,
           count(DISTINCT installation_id) users
    FROM ev,b WHERE occurred_at>=b.s24 GROUP BY 1 ORDER BY actions DESC,hour_num
  ) x
),
devices AS (
  SELECT jsonb_build_object(
    'browsers',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(
      SELECT coalesce(browser,'Unknown') value,count(DISTINCT installation_id) qty
      FROM public.verix2_installations,b WHERE last_seen>=b.s30 GROUP BY 1 ORDER BY qty DESC LIMIT 15)x),'[]'::jsonb),
    'device_types',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(
      SELECT coalesce(device_type,'Unknown') value,count(*) qty
      FROM public.verix2_installations,b WHERE last_seen>=b.s30 GROUP BY 1 ORDER BY qty DESC LIMIT 10)x),'[]'::jsonb),
    'os',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(
      SELECT coalesce(os,'Unknown') value,count(*) qty
      FROM public.verix2_installations,b WHERE last_seen>=b.s30 GROUP BY 1 ORDER BY qty DESC LIMIT 15)x),'[]'::jsonb)
  ) data
),
versions AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data
  FROM(
    SELECT coalesce(app_version,'Unknown') value,count(DISTINCT installation_id) qty
    FROM ev GROUP BY 1 ORDER BY qty DESC LIMIT 15
  ) x
),
telemetry AS (
  SELECT jsonb_build_object(
    'events_30d',count(*),
    'heartbeats_30d',count(*) FILTER(WHERE event='heartbeat'),
    'client_coverage_30d',round((100.0*count(*) FILTER(WHERE event IN('app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND metadata ? 'client')/
      NULLIF(count(*) FILTER(WHERE event IN('app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')),0))::numeric,1),
    'asf_diagnostic_coverage_30d',round((100.0*count(*) FILTER(WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND metadata ? 'asfDiagnostic')/
      NULLIF(count(*) FILTER(WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')),0))::numeric,1),
    'cin_detail_coverage_30d',round((100.0*count(*) FILTER(WHERE event IN('cinemometer_calculation','cinemometer_speed_entry') AND metadata ? 'cin')/
      NULLIF(count(*) FILTER(WHERE event IN('cinemometer_calculation','cinemometer_speed_entry')),0))::numeric,1)
  ) data FROM ev
),
top_events AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data
  FROM(SELECT event,count(*) qty FROM ev GROUP BY 1 ORDER BY qty DESC LIMIT 20)x
)
SELECT jsonb_build_object(
  'generated_at',p_now,
  'bounds',jsonb_build_object('s24',(SELECT s24 FROM b),'s7',(SELECT s7 FROM b),'s30',(SELECT s30 FROM b),'end',(SELECT enow FROM b)),
  'overview',(SELECT data FROM overview),
  'retention',(SELECT data FROM ret),
  'insurance',(SELECT data FROM insurance),
  'insurance_quality',(SELECT data FROM ins_quality),
  'retry',(SELECT data FROM retry),
  'errors',jsonb_build_object(
    'types',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM err_types x),'[]'::jsonb),
    'bursts',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM err_bursts x),'[]'::jsonb),
    'installations',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM err_installs x),'[]'::jsonb),
    'clients',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.error_qty DESC,x.finals_qty DESC) FROM err_clients x),'[]'::jsonb),
    'signatures',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM err_signatures x),'[]'::jsonb),
    'plates',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM err_plates x),'[]'::jsonb)
  ),
  'speed',jsonb_build_object(
    'summary',(SELECT data FROM speed_summary),
    'distribution_24h',(SELECT data FROM speed_dist),
    'dimensions',(SELECT data FROM speed_dims),
    'operators',(SELECT data FROM speed_operators),
    'apparatus',(SELECT data FROM speed_apparatus)
  ),
  'legislation',jsonb_build_object(
    'counts',(SELECT data FROM leg_counts),
    'items',(SELECT data FROM leg_items),
    'copy_types',(SELECT data FROM leg_copytypes)
  ),
  'usage',jsonb_build_object(
    'modules',(SELECT data FROM modules),
    'module_activity',(SELECT data FROM module_activity),
    'sessions',(SELECT data FROM session_metrics),
    'transitions',(SELECT data FROM transitions),
    'daily',(SELECT data FROM daily),
    'hourly',(SELECT data FROM hourly)
  ),
  'devices',jsonb_build_object('distribution',(SELECT data FROM devices),'versions',(SELECT data FROM versions)),
  'telemetry',(SELECT data FROM telemetry),
  'events',(SELECT data FROM top_events)
);
$function$

