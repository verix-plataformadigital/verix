-- VÉRIX telemetry rebuild.
-- Rolling periods are always rolling periods. reset_all_at is reserved for lifetime counters.
DO $window_fix$
DECLARE
  definition text;
  original text;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure) INTO definition;
  original := definition;
  definition := replace(definition,
    'greatest(p_now - interval ''7 days'', public.verix2_all_start(p_now)) AS s7',
    'p_now - interval ''7 days'' AS s7');
  definition := replace(definition,
    'greatest(p_now - interval ''30 days'', public.verix2_all_start(p_now)) AS s30',
    'p_now - interval ''30 days'' AS s30');
  IF definition = original OR position('p_now - interval ''7 days'' AS s7' in definition) = 0
     OR position('p_now - interval ''30 days'' AS s30' in definition) = 0 THEN
    RAISE EXCEPTION 'Could not safely update verix2_admin_analytics rolling-window bounds';
  END IF;
  EXECUTE definition;
END
$window_fix$;

-- One transaction for parent rows, event rows and presence timestamps.
-- This avoids the previous split-write failure mode and keeps first/last seen monotonic.
CREATE OR REPLACE FUNCTION public.verix2_ingest_events(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
AS $ingest$
DECLARE
  v_input integer;
  v_valid integer;
  v_inserted integer := 0;
BEGIN
  IF jsonb_typeof(p_events) <> 'array' THEN RAISE EXCEPTION 'p_events_must_be_array'; END IF;
  v_input := jsonb_array_length(p_events);
  IF v_input > 100 THEN RAISE EXCEPTION 'batch_too_large'; END IF;

  WITH incoming AS (
    SELECT nullif(btrim(event_id),'') event_id, nullif(btrim(installation_id),'') installation_id,
      nullif(btrim(session_id),'') session_id, nullif(btrim(tab_id),'') tab_id, nullif(btrim(query_id),'') query_id,
      nullif(btrim(event),'') event, nullif(btrim(module),'') module, occurred_at,
      nullif(btrim(app_version),'') app_version, nullif(btrim(device_type),'') device_type,
      nullif(btrim(browser),'') browser, coalesce(metadata,'{}'::jsonb) metadata
    FROM jsonb_to_recordset(p_events) AS x(
      event_id text, installation_id text, session_id text, tab_id text, query_id text,
      event text, module text, occurred_at timestamptz, app_version text,
      device_type text, browser text, metadata jsonb
    )
  )
  SELECT count(*) INTO v_valid FROM incoming
  WHERE event_id IS NOT NULL AND installation_id IS NOT NULL AND event IS NOT NULL AND occurred_at IS NOT NULL
    AND event IN(
      'app_open','heartbeat','vehicle_lookup','vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no',
      'vehicle_insurance_error','imt_loaded','module_open','history_open','history_reopen','external_tool_open',
      'alcohol_lookup','cinemometer_operation_start','cinemometer_speed_entry','cinemometer_calculation',
      'cinemometer_copy_code','cinemometer_copy_text','cinemometer_copy_location','cinemometer_profile_select',
      'cinemometer_profile_new','cinemometer_profile_duplicate','cinemometer_profile_delete','cinemometer_profile_save',
      'legislation_category_open','legislation_search','legislation_copy','legislation_favorite_toggle'
    );

  WITH incoming AS (
    SELECT nullif(btrim(event_id),'') event_id, nullif(btrim(installation_id),'') installation_id,
      nullif(btrim(session_id),'') session_id, nullif(btrim(tab_id),'') tab_id, nullif(btrim(query_id),'') query_id,
      nullif(btrim(event),'') event, nullif(btrim(module),'') module, occurred_at,
      nullif(btrim(app_version),'') app_version, nullif(btrim(device_type),'') device_type,
      nullif(btrim(browser),'') browser, coalesce(metadata,'{}'::jsonb) metadata
    FROM jsonb_to_recordset(p_events) AS x(
      event_id text, installation_id text, session_id text, tab_id text, query_id text,
      event text, module text, occurred_at timestamptz, app_version text,
      device_type text, browser text, metadata jsonb
    )
  ), valid AS (
    SELECT * FROM incoming
    WHERE event_id IS NOT NULL AND installation_id IS NOT NULL AND event IS NOT NULL AND occurred_at IS NOT NULL
      AND event IN(
        'app_open','heartbeat','vehicle_lookup','vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no',
        'vehicle_insurance_error','imt_loaded','module_open','history_open','history_reopen','external_tool_open',
        'alcohol_lookup','cinemometer_operation_start','cinemometer_speed_entry','cinemometer_calculation',
        'cinemometer_copy_code','cinemometer_copy_text','cinemometer_copy_location','cinemometer_profile_select',
        'cinemometer_profile_new','cinemometer_profile_duplicate','cinemometer_profile_delete','cinemometer_profile_save',
        'legislation_category_open','legislation_search','legislation_copy','legislation_favorite_toggle'
      )
  ), grouped AS (
    SELECT installation_id, min(occurred_at) first_seen, max(occurred_at) last_seen,
      (array_agg(app_version ORDER BY occurred_at DESC) FILTER(WHERE app_version IS NOT NULL))[1] app_version,
      (array_agg(device_type ORDER BY occurred_at DESC) FILTER(WHERE device_type IS NOT NULL))[1] device_type,
      (array_agg(browser ORDER BY occurred_at DESC) FILTER(WHERE browser IS NOT NULL))[1] browser,
      (array_agg(metadata->'client'->>'osPlatform' ORDER BY occurred_at DESC)
        FILTER(WHERE metadata->'client'->>'osPlatform' IS NOT NULL))[1] os
    FROM valid GROUP BY installation_id
  )
  INSERT INTO public.verix2_installations AS current_installation
    (installation_id,first_seen,last_seen,app_version,device_type,browser,os)
  SELECT installation_id,first_seen,last_seen,app_version,device_type,browser,os FROM grouped
  ON CONFLICT (installation_id) DO UPDATE SET
    first_seen=least(current_installation.first_seen,excluded.first_seen),
    last_seen=greatest(current_installation.last_seen,excluded.last_seen),
    app_version=CASE WHEN excluded.last_seen>=current_installation.last_seen THEN coalesce(excluded.app_version,current_installation.app_version) ELSE current_installation.app_version END,
    device_type=CASE WHEN excluded.last_seen>=current_installation.last_seen THEN coalesce(excluded.device_type,current_installation.device_type) ELSE current_installation.device_type END,
    browser=CASE WHEN excluded.last_seen>=current_installation.last_seen THEN coalesce(excluded.browser,current_installation.browser) ELSE current_installation.browser END,
    os=CASE WHEN excluded.last_seen>=current_installation.last_seen THEN coalesce(excluded.os,current_installation.os) ELSE current_installation.os END;

  WITH incoming AS (
    SELECT nullif(btrim(event_id),'') event_id, nullif(btrim(installation_id),'') installation_id,
      nullif(btrim(session_id),'') session_id, nullif(btrim(tab_id),'') tab_id, nullif(btrim(query_id),'') query_id,
      nullif(btrim(event),'') event, nullif(btrim(module),'') module, occurred_at,
      nullif(btrim(app_version),'') app_version, nullif(btrim(device_type),'') device_type,
      nullif(btrim(browser),'') browser, coalesce(metadata,'{}'::jsonb) metadata
    FROM jsonb_to_recordset(p_events) AS x(
      event_id text, installation_id text, session_id text, tab_id text, query_id text,
      event text, module text, occurred_at timestamptz, app_version text,
      device_type text, browser text, metadata jsonb
    )
  ), valid AS (
    SELECT * FROM incoming
    WHERE event_id IS NOT NULL AND installation_id IS NOT NULL AND session_id IS NOT NULL
      AND event IS NOT NULL AND occurred_at IS NOT NULL
      AND event IN(
        'app_open','heartbeat','vehicle_lookup','vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no',
        'vehicle_insurance_error','imt_loaded','module_open','history_open','history_reopen','external_tool_open',
        'alcohol_lookup','cinemometer_operation_start','cinemometer_speed_entry','cinemometer_calculation',
        'cinemometer_copy_code','cinemometer_copy_text','cinemometer_copy_location','cinemometer_profile_select',
        'cinemometer_profile_new','cinemometer_profile_duplicate','cinemometer_profile_delete','cinemometer_profile_save',
        'legislation_category_open','legislation_search','legislation_copy','legislation_favorite_toggle'
      )
  ), grouped AS (
    SELECT session_id, (array_agg(installation_id ORDER BY occurred_at DESC))[1] installation_id,
      (array_agg(tab_id ORDER BY occurred_at DESC) FILTER(WHERE tab_id IS NOT NULL))[1] tab_id,
      min(occurred_at) started_at, max(occurred_at) last_seen
    FROM valid GROUP BY session_id
  )
  INSERT INTO public.verix2_sessions AS current_session(session_id,installation_id,tab_id,started_at,last_seen)
  SELECT session_id,installation_id,tab_id,started_at,last_seen FROM grouped
  ON CONFLICT (session_id) DO UPDATE SET
    installation_id=CASE WHEN excluded.last_seen>=current_session.last_seen THEN excluded.installation_id ELSE current_session.installation_id END,
    tab_id=CASE WHEN excluded.last_seen>=current_session.last_seen THEN coalesce(excluded.tab_id,current_session.tab_id) ELSE current_session.tab_id END,
    started_at=least(current_session.started_at,excluded.started_at),
    last_seen=greatest(current_session.last_seen,excluded.last_seen);

  WITH incoming AS (
    SELECT nullif(btrim(event_id),'') event_id, nullif(btrim(installation_id),'') installation_id,
      nullif(btrim(session_id),'') session_id, nullif(btrim(tab_id),'') tab_id, nullif(btrim(query_id),'') query_id,
      nullif(btrim(event),'') event, nullif(btrim(module),'') module, occurred_at,
      nullif(btrim(app_version),'') app_version, nullif(btrim(device_type),'') device_type,
      nullif(btrim(browser),'') browser, coalesce(metadata,'{}'::jsonb) metadata
    FROM jsonb_to_recordset(p_events) AS x(
      event_id text, installation_id text, session_id text, tab_id text, query_id text,
      event text, module text, occurred_at timestamptz, app_version text,
      device_type text, browser text, metadata jsonb
    )
  )
  INSERT INTO public.verix2_events
    (event_id,installation_id,session_id,tab_id,query_id,event,module,occurred_at,app_version,device_type,browser,metadata)
  SELECT event_id,installation_id,session_id,tab_id,query_id,event,module,occurred_at,app_version,device_type,browser,metadata
  FROM incoming
  WHERE event_id IS NOT NULL AND installation_id IS NOT NULL AND event IS NOT NULL AND occurred_at IS NOT NULL
    AND event IN(
      'app_open','heartbeat','vehicle_lookup','vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no',
      'vehicle_insurance_error','imt_loaded','module_open','history_open','history_reopen','external_tool_open',
      'alcohol_lookup','cinemometer_operation_start','cinemometer_speed_entry','cinemometer_calculation',
      'cinemometer_copy_code','cinemometer_copy_text','cinemometer_copy_location','cinemometer_profile_select',
      'cinemometer_profile_new','cinemometer_profile_duplicate','cinemometer_profile_delete','cinemometer_profile_save',
      'legislation_category_open','legislation_search','legislation_copy','legislation_favorite_toggle'
    )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'received',v_input,'valid',v_valid,'accepted',v_inserted,'rejected',greatest(v_input-v_inserted,0));
END
$ingest$;

REVOKE ALL ON FUNCTION public.verix2_ingest_events(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_events(jsonb) TO service_role;

-- A canonical analytics layer for the Admin. The old function remains as a
-- compatibility envelope; stats-v2 overlays these corrected metrics.
CREATE OR REPLACE FUNCTION public.verix2_telemetry_metrics_v3(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
AS $metrics$
WITH b AS (
  SELECT greatest(p_now-interval '24 hours',
    coalesce((SELECT reset_24h_at FROM public.verix2_dashboard_state WHERE singleton=true),'1970-01-01T00:00:00Z'::timestamptz)) s24,
    p_now-interval '7 days' s7,
    p_now-interval '30 days' s30,
    p_now enow
),
ev AS (
  SELECT e.* FROM public.verix2_events e,b
  WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow
),
query_events AS (
  SELECT e.event_id,e.installation_id,e.session_id,e.query_id,e.event,e.occurred_at,e.app_version,e.browser,e.device_type,e.metadata
  FROM public.verix2_events e,b
  WHERE e.occurred_at>=b.enow-interval '90 days' AND e.occurred_at<b.enow
    AND e.event IN('vehicle_lookup','vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
),
q AS (
  SELECT query_id,
    coalesce(min(occurred_at) FILTER(WHERE event='vehicle_lookup'),min(occurred_at) FILTER(WHERE event='vehicle_insurance_pending')) first_at,
    min(occurred_at) FILTER(WHERE event='vehicle_lookup') lookup_at,
    coalesce(
      (array_agg(app_version ORDER BY occurred_at,event_id) FILTER(WHERE event='vehicle_lookup'))[1],
      (array_agg(app_version ORDER BY occurred_at,event_id) FILTER(WHERE event='vehicle_insurance_pending'))[1]
    ) start_version
  FROM query_events WHERE event IN('vehicle_lookup','vehicle_insurance_pending') AND query_id IS NOT NULL
  GROUP BY query_id
),
terminal_rollup AS (
  SELECT query_id,count(*) terminal_event_count,count(DISTINCT event) outcome_count,max(occurred_at) last_at
  FROM query_events WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND query_id IS NOT NULL
  GROUP BY query_id
),
finals AS (
  SELECT DISTINCT ON(e.query_id) e.query_id,e.event,e.occurred_at,e.metadata,e.installation_id,e.app_version,e.browser,e.device_type
  FROM query_events e JOIN terminal_rollup tr ON tr.query_id=e.query_id AND tr.outcome_count=1
  WHERE e.event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND e.query_id IS NOT NULL
  ORDER BY e.query_id,e.occurred_at DESC,e.event_id DESC
),
query_finals AS (
  SELECT f.*,q.first_at FROM q JOIN finals f USING(query_id) WHERE f.occurred_at>=q.first_at
),
insurance AS (
 SELECT jsonb_build_object(
  '24h',jsonb_build_object(
   'started',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s24),
   'finals',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s24),
   'insured',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s24 AND f.event='vehicle_insurance_yes'),
   'uninsured',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s24 AND f.event='vehicle_insurance_no'),
   'errors',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s24 AND f.event='vehicle_insurance_error'),
   'pending',(SELECT count(*) FROM q x,b WHERE x.first_at>=b.s24 AND NOT EXISTS(SELECT 1 FROM query_finals f WHERE f.query_id=x.query_id) AND NOT EXISTS(SELECT 1 FROM terminal_rollup tr WHERE tr.query_id=x.query_id AND tr.outcome_count>1)),
   'multi_final',(SELECT count(*) FROM q x JOIN terminal_rollup tr USING(query_id),b WHERE x.first_at>=b.s24 AND tr.terminal_event_count>1),
   'conflicting_final',(SELECT count(*) FROM q x JOIN terminal_rollup tr USING(query_id),b WHERE x.first_at>=b.s24 AND tr.outcome_count>1),
   'inferred_starts',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s24 AND q.lookup_at IS NULL),
   'completed_in_window',(SELECT count(*) FROM finals,b WHERE occurred_at>=b.s24),
   'orphan_terminal',(SELECT count(*) FROM terminal_rollup tr,b WHERE tr.last_at>=b.s24 AND NOT EXISTS(SELECT 1 FROM q WHERE q.query_id=tr.query_id))
  ),
  '7d',jsonb_build_object(
   'started',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s7),
   'finals',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s7),
   'insured',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s7 AND f.event='vehicle_insurance_yes'),
   'uninsured',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s7 AND f.event='vehicle_insurance_no'),
   'errors',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s7 AND f.event='vehicle_insurance_error'),
   'pending',(SELECT count(*) FROM q x,b WHERE x.first_at>=b.s7 AND NOT EXISTS(SELECT 1 FROM query_finals f WHERE f.query_id=x.query_id) AND NOT EXISTS(SELECT 1 FROM terminal_rollup tr WHERE tr.query_id=x.query_id AND tr.outcome_count>1)),
   'multi_final',(SELECT count(*) FROM q x JOIN terminal_rollup tr USING(query_id),b WHERE x.first_at>=b.s7 AND tr.terminal_event_count>1),
   'conflicting_final',(SELECT count(*) FROM q x JOIN terminal_rollup tr USING(query_id),b WHERE x.first_at>=b.s7 AND tr.outcome_count>1),
   'inferred_starts',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s7 AND q.lookup_at IS NULL),
   'completed_in_window',(SELECT count(*) FROM finals,b WHERE occurred_at>=b.s7),
   'orphan_terminal',(SELECT count(*) FROM terminal_rollup tr,b WHERE tr.last_at>=b.s7 AND NOT EXISTS(SELECT 1 FROM q WHERE q.query_id=tr.query_id))
  ),
  '30d',jsonb_build_object(
   'started',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s30),
   'finals',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s30),
   'insured',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s30 AND f.event='vehicle_insurance_yes'),
   'uninsured',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s30 AND f.event='vehicle_insurance_no'),
   'errors',(SELECT count(*) FROM q x JOIN query_finals f USING(query_id),b WHERE x.first_at>=b.s30 AND f.event='vehicle_insurance_error'),
   'pending',(SELECT count(*) FROM q x,b WHERE x.first_at>=b.s30 AND NOT EXISTS(SELECT 1 FROM query_finals f WHERE f.query_id=x.query_id) AND NOT EXISTS(SELECT 1 FROM terminal_rollup tr WHERE tr.query_id=x.query_id AND tr.outcome_count>1)),
   'multi_final',(SELECT count(*) FROM q x JOIN terminal_rollup tr USING(query_id),b WHERE x.first_at>=b.s30 AND tr.terminal_event_count>1),
   'conflicting_final',(SELECT count(*) FROM q x JOIN terminal_rollup tr USING(query_id),b WHERE x.first_at>=b.s30 AND tr.outcome_count>1),
   'inferred_starts',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s30 AND q.lookup_at IS NULL),
   'completed_in_window',(SELECT count(*) FROM finals,b WHERE occurred_at>=b.s30),
   'orphan_terminal',(SELECT count(*) FROM terminal_rollup tr,b WHERE tr.last_at>=b.s30 AND NOT EXISTS(SELECT 1 FROM q WHERE q.query_id=tr.query_id))
  )
 ) data
),
insurance_quality AS (
 SELECT jsonb_build_object(
  'latency_p50_ms',(SELECT round((percentile_cont(.5) WITHIN GROUP(ORDER BY (metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
    FROM query_finals,b WHERE occurred_at>=b.s24 AND (metadata->'asfDiagnostic'->>'asfDurationMs') ~ '^[0-9]+([.][0-9]+)?$'),
  'latency_p95_ms',(SELECT round((percentile_cont(.95) WITHIN GROUP(ORDER BY (metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
    FROM query_finals,b WHERE occurred_at>=b.s24 AND (metadata->'asfDiagnostic'->>'asfDurationMs') ~ '^[0-9]+([.][0-9]+)?$'),
  'known_plates_24h',(SELECT count(DISTINCT upper(regexp_replace(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula',''),'[^A-Z0-9]','','g')))
    FROM query_finals,b WHERE occurred_at>=b.s24 AND coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')<>''),
  'known_plates_30d',(SELECT count(DISTINCT upper(regexp_replace(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula',''),'[^A-Z0-9]','','g')))
    FROM query_finals,b WHERE occurred_at>=b.s30 AND coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')<>'')
 ) data
),
query_quality AS (
 SELECT jsonb_build_object(
  'started_queries_30d',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s30),
  'confirmed_starts_30d',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s30 AND q.lookup_at IS NOT NULL),
  'inferred_starts_30d',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s30 AND q.lookup_at IS NULL),
  'missing_lookup_queries_30d',(SELECT count(*) FROM q,b WHERE q.first_at>=b.s30 AND q.lookup_at IS NULL),
  'orphan_terminal_queries_30d',(SELECT count(*) FROM terminal_rollup tr,b WHERE tr.last_at>=b.s30 AND NOT EXISTS(SELECT 1 FROM q WHERE q.query_id=tr.query_id)),
  'conflicting_terminal_queries_30d',(SELECT count(*) FROM q JOIN terminal_rollup tr USING(query_id),b WHERE q.first_at>=b.s30 AND tr.outcome_count>1),
  'duplicate_terminal_events_30d',(SELECT coalesce(sum(tr.terminal_event_count-1),0) FROM q JOIN terminal_rollup tr USING(query_id),b WHERE q.first_at>=b.s30 AND tr.terminal_event_count>1),
  'out_of_order_final_queries_30d',(SELECT count(*) FROM q JOIN finals f USING(query_id),b WHERE q.first_at>=b.s30 AND f.occurred_at<q.first_at),
  'by_version',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.started DESC) FROM(
    SELECT coalesce(q.start_version,'Unknown') app_version,count(*) started,
      count(*) FILTER(WHERE q.lookup_at IS NOT NULL) confirmed_starts,
      count(*) FILTER(WHERE q.lookup_at IS NULL) inferred_starts,
      count(*) FILTER(WHERE f.query_id IS NOT NULL) clean_finals,
      count(*) FILTER(WHERE f.event='vehicle_insurance_error') clean_error_results,
      count(*) FILTER(WHERE f.query_id IS NULL AND coalesce(tr.outcome_count,0)<=1) pending,
      count(*) FILTER(WHERE tr.outcome_count>1) conflicting,
      count(*) FILTER(WHERE f.query_id IS NULL AND tr.outcome_count=1 AND tr.last_at<q.first_at) out_of_order
    FROM q CROSS JOIN b LEFT JOIN query_finals f ON f.query_id=q.query_id LEFT JOIN terminal_rollup tr ON tr.query_id=q.query_id
    WHERE q.first_at>=b.s30 GROUP BY 1
  ) x),'[]'::jsonb)
 ) data
),
speed_data AS (
 SELECT e.*,e.metadata->'cin' cin
 FROM ev e WHERE e.event IN('cinemometer_speed_entry','cinemometer_calculation') AND jsonb_typeof(e.metadata->'cin')='object'
),
speed_num AS (
 SELECT *,CASE WHEN cin->>'velocidade_registada' ~ '^[0-9]+([.][0-9]+)?$' THEN (cin->>'velocidade_registada')::numeric END speed_val
 FROM speed_data
),
speed_measurements AS (
 SELECT s.* FROM speed_num s
 WHERE s.event='cinemometer_speed_entry'
 OR NOT (s.event='cinemometer_calculation' AND nullif(s.cin->>'operation_id','') IS NOT NULL
   AND EXISTS(SELECT 1 FROM speed_num e WHERE e.event='cinemometer_speed_entry' AND e.installation_id=s.installation_id
    AND e.session_id=s.session_id AND e.cin->>'operation_id'=s.cin->>'operation_id' AND e.speed_val=s.speed_val
    AND abs(extract(epoch FROM(e.occurred_at-s.occurred_at)))<=3))
),
speed_dimensions AS (
 SELECT jsonb_build_object(
  'modo',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(
    SELECT coalesce(cin->>'modo','sem dado') value,count(*) qty FROM speed_measurements,b WHERE occurred_at>=b.s30 GROUP BY 1)x),'[]'::jsonb),
  'limite',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(
    SELECT coalesce(cin->>'limite','sem dado') value,count(*) qty FROM speed_measurements,b WHERE occurred_at>=b.s30 GROUP BY 1)x),'[]'::jsonb),
  'codigo',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(
    SELECT coalesce(cin->>'codigo','sem dado') value,count(*) qty FROM speed_measurements,b WHERE occurred_at>=b.s30 GROUP BY 1)x),'[]'::jsonb)
 ) data
),
speed_summary AS (
 SELECT jsonb_build_object(
  'detail_events_24h',(SELECT count(*) FROM speed_num,b WHERE occurred_at>=b.s24),
  'calculations_24h',(SELECT count(*) FROM speed_num,b WHERE occurred_at>=b.s24 AND event='cinemometer_calculation'),
  'speed_entries_24h',(SELECT count(*) FROM speed_num,b WHERE occurred_at>=b.s24 AND event='cinemometer_speed_entry'),
  'measurements_24h',(SELECT count(*) FROM speed_measurements,b WHERE occurred_at>=b.s24 AND speed_val IS NOT NULL),
  'distinct_24h',(SELECT count(DISTINCT speed_val) FROM speed_measurements,b WHERE occurred_at>=b.s24 AND speed_val IS NOT NULL),
  'min_24h',(SELECT min(speed_val) FROM speed_measurements,b WHERE occurred_at>=b.s24 AND speed_val IS NOT NULL),
  'max_24h',(SELECT max(speed_val) FROM speed_measurements,b WHERE occurred_at>=b.s24 AND speed_val IS NOT NULL),
  'avg_24h',(SELECT round(avg(speed_val),1) FROM speed_measurements,b WHERE occurred_at>=b.s24 AND speed_val IS NOT NULL),
  'p50_24h',(SELECT round((percentile_cont(.5) WITHIN GROUP(ORDER BY speed_val))::numeric,1) FROM speed_measurements,b WHERE occurred_at>=b.s24 AND speed_val IS NOT NULL),
  'detail_coverage_30d',round((100.0*(SELECT count(*) FROM speed_num,b WHERE occurred_at>=b.s30 AND speed_val IS NOT NULL)/NULLIF((SELECT count(*) FROM ev WHERE event IN('cinemometer_speed_entry','cinemometer_calculation')),0))::numeric,1)
 ) data
),
speed_distribution AS (
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.bucket_start),'[]'::jsonb) data
 FROM(SELECT (floor(speed_val/10)*10)::int bucket_start,count(*) qty
      FROM speed_measurements,b WHERE occurred_at>=b.s24 AND speed_val IS NOT NULL GROUP BY 1)x
),
err_events AS (
 SELECT * FROM ev,b WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24
),
err_types AS (
 SELECT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown') kind,count(DISTINCT query_id) qty,count(*) event_count,
  round(avg(CASE WHEN (metadata->'asfDiagnostic'->>'asfDurationMs') ~ '^[0-9]+([.][0-9]+)?$' THEN (metadata->'asfDiagnostic'->>'asfDurationMs')::numeric END)) avg_ms,
  count(DISTINCT metadata->'asfDiagnostic'->>'asfResponseHash') hash_qty,max(occurred_at) last_at
 FROM err_events GROUP BY 1
),
err_bursts AS (
 SELECT to_timestamp(floor(extract(epoch FROM occurred_at)/300)*300) bucket_start,count(DISTINCT query_id) qty,count(*) event_count,count(DISTINCT installation_id) installs
 FROM err_events GROUP BY 1
),
err_installs AS (
 SELECT installation_id,count(DISTINCT query_id) qty,count(*) event_count,count(DISTINCT query_id) queries,max(occurred_at) last_at
 FROM err_events GROUP BY 1
),
err_signatures AS (
 SELECT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown') kind,
  coalesce(metadata->'asfDiagnostic'->>'asfResponseHash','sem-hash') response_hash,
  coalesce(NULLIF(metadata->'asfDiagnostic'->'asfGraphqlMessages'->>0,''),NULLIF(metadata->'asfDiagnostic'->>'asfMessage',''),NULLIF(metadata->>'asfUserMessage',''),'') message_text,
  count(DISTINCT query_id) qty,count(*) event_count,count(DISTINCT query_id) queries,count(DISTINCT installation_id) installs
 FROM err_events GROUP BY 1,2,3
),
err_plates AS (
 SELECT upper(regexp_replace(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula',''),'[^A-Z0-9]','','g')) plate_key,
  max(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula')) plate,
  count(DISTINCT query_id) qty,count(*) event_count,max(occurred_at) last_at,
  array_agg(DISTINCT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown')) kinds
 FROM err_events WHERE coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')<>'' GROUP BY 1
),
err_clients AS (
 SELECT coalesce(metadata->'client'->>'browser',browser,'Unknown') browser_name,
  coalesce(metadata->'client'->>'browserVersion','Unknown') browser_version,
  coalesce(metadata->'client'->>'osPlatform','Unknown') os_platform,
  coalesce(metadata->'client'->>'osVersion','Unknown') os_version,
  coalesce(metadata->'client'->>'effectiveType','Unknown') network_type,
  count(*) finals_qty,count(*) FILTER(WHERE event='vehicle_insurance_error') error_qty
 FROM finals f,b WHERE f.occurred_at>=b.s24 GROUP BY 1,2,3,4,5
),
errors AS (
 SELECT jsonb_build_object(
  'affected_queries',(SELECT count(DISTINCT query_id) FROM err_events),
  'affected_installations',(SELECT count(DISTINCT installation_id) FROM err_events),
  'signature_count',(SELECT count(*) FROM err_signatures),
  'diagnostic_coverage_pct',(SELECT round((100.0*count(*) FILTER(WHERE metadata->'asfDiagnostic'->>'asfErrorType' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfHttpStatus' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfDurationMs' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfResponseHash' IS NOT NULL)/NULLIF(count(*),0))::numeric,1) FROM err_events),
  'by_version',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.error_queries DESC) FROM(
    SELECT coalesce(app_version,'Unknown') app_version,count(*) event_count,count(DISTINCT query_id) error_queries,count(DISTINCT installation_id) installations,
      count(*) FILTER(WHERE metadata->'asfDiagnostic'->>'asfErrorType' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfHttpStatus' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfDurationMs' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfResponseHash' IS NOT NULL) diagnosed_events,
      round((100.0*count(*) FILTER(WHERE metadata->'asfDiagnostic'->>'asfErrorType' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfHttpStatus' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfDurationMs' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfResponseHash' IS NOT NULL)/NULLIF(count(*),0))::numeric,1) diagnostic_pct
    FROM err_events GROUP BY 1)x),'[]'::jsonb),
  'types',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM err_types x),'[]'::jsonb),
  'bursts',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(SELECT * FROM err_bursts ORDER BY qty DESC,bucket_start DESC LIMIT 15)x),'[]'::jsonb),
  'installations',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(SELECT * FROM err_installs ORDER BY qty DESC,last_at DESC LIMIT 15)x),'[]'::jsonb),
  'signatures',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(SELECT * FROM err_signatures ORDER BY qty DESC LIMIT 20)x),'[]'::jsonb),
  'plates',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(SELECT * FROM err_plates ORDER BY qty DESC,last_at DESC LIMIT 20)x),'[]'::jsonb),
  'clients',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.error_qty DESC,x.finals_qty DESC) FROM(SELECT * FROM err_clients ORDER BY error_qty DESC,finals_qty DESC LIMIT 30)x),'[]'::jsonb)
 ) data
),
telemetry AS (
 SELECT jsonb_build_object(
  'events_30d',count(*),'actions_30d',count(*) FILTER(WHERE event<>'heartbeat'),'heartbeats_30d',count(*) FILTER(WHERE event='heartbeat'),
  'actions_24h',count(*) FILTER(WHERE occurred_at>=b.s24 AND event<>'heartbeat'),
  'actions_7d',count(*) FILTER(WHERE occurred_at>=b.s7 AND event<>'heartbeat'),
  'client_coverage_30d',round((100.0*count(*) FILTER(WHERE event IN('app_open','heartbeat','module_open','vehicle_lookup','vehicle_insurance_pending','cinemometer_calculation','cinemometer_speed_entry','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND (metadata->'client'->>'browser' IS NOT NULL OR metadata->'client'->>'osPlatform' IS NOT NULL))/NULLIF(count(*) FILTER(WHERE event IN('app_open','heartbeat','module_open','vehicle_lookup','vehicle_insurance_pending','cinemometer_calculation','cinemometer_speed_entry','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')),0))::numeric,1),
  'asf_diagnostic_coverage_30d',round((100.0*count(*) FILTER(WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND (metadata->'asfDiagnostic'->>'asfErrorType' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfHttpStatus' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfDurationMs' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfResponseHash' IS NOT NULL))/NULLIF(count(*) FILTER(WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')),0))::numeric,1),
  'cin_detail_coverage_30d',round((100.0*count(*) FILTER(WHERE event IN('cinemometer_calculation','cinemometer_speed_entry') AND metadata->'cin'->>'velocidade_registada' IS NOT NULL)/NULLIF(count(*) FILTER(WHERE event IN('cinemometer_calculation','cinemometer_speed_entry')),0))::numeric,1),
  'coverage_by_version',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.app_version) FROM(
    SELECT coalesce(app_version,'Unknown') app_version,count(*) event_count,count(*) FILTER(WHERE event='heartbeat') heartbeats,count(*) FILTER(WHERE event<>'heartbeat') actions,
      round((100.0*count(*) FILTER(WHERE event IN('app_open','heartbeat','module_open','vehicle_lookup','vehicle_insurance_pending','cinemometer_calculation','cinemometer_speed_entry','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND (metadata->'client'->>'browser' IS NOT NULL OR metadata->'client'->>'osPlatform' IS NOT NULL))/NULLIF(count(*) FILTER(WHERE event IN('app_open','heartbeat','module_open','vehicle_lookup','vehicle_insurance_pending','cinemometer_calculation','cinemometer_speed_entry','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')),0))::numeric,1) client_coverage_pct,
      round((100.0*count(*) FILTER(WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND (metadata->'asfDiagnostic'->>'asfErrorType' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfHttpStatus' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfDurationMs' IS NOT NULL OR metadata->'asfDiagnostic'->>'asfResponseHash' IS NOT NULL))/NULLIF(count(*) FILTER(WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')),0))::numeric,1) asf_diagnostic_coverage_pct,
      round((100.0*count(*) FILTER(WHERE event IN('cinemometer_calculation','cinemometer_speed_entry') AND metadata->'cin'->>'velocidade_registada' IS NOT NULL)/NULLIF(count(*) FILTER(WHERE event IN('cinemometer_calculation','cinemometer_speed_entry')),0))::numeric,1) cin_detail_coverage_pct
    FROM ev GROUP BY 1)x),'[]'::jsonb)
 ) data FROM ev,b
),
session_base AS (
 SELECT s.session_id,s.started_at,s.last_seen parent_last_seen,
  min(e.occurred_at) event_first_at,max(e.occurred_at) event_last_at,
  count(e.event) event_count,
  count(e.event) FILTER(WHERE e.event<>'heartbeat') actions,
  count(DISTINCT e.module) FILTER(WHERE e.event='module_open' AND e.module IS NOT NULL) modules
 FROM public.verix2_sessions s LEFT JOIN ev e ON e.session_id=s.session_id
 GROUP BY s.session_id,s.started_at,s.last_seen
),
session_rows AS (
 SELECT *,
  least(p_now,started_at,coalesce(event_first_at,started_at)) duration_start,
  greatest(least(p_now,started_at,coalesce(event_first_at,started_at)),least(coalesce(event_last_at,parent_last_seen),p_now)) duration_end,
  (event_count>1 AND (parent_last_seen=started_at OR event_last_at>parent_last_seen OR event_first_at<started_at)) parent_timestamp_mismatch
 FROM session_base
),
sessions AS (
 SELECT jsonb_build_object(
  '24h',jsonb_build_object(
   'sessions',count(*) FILTER(WHERE started_at>=b.s24),
   'median_minutes',round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(duration_end-duration_start))/60) FILTER(WHERE started_at>=b.s24))::numeric,1),
   'p95_minutes',round((percentile_cont(.95) WITHIN GROUP(ORDER BY extract(epoch FROM(duration_end-duration_start))/60) FILTER(WHERE started_at>=b.s24))::numeric,1),
   'avg_actions',round((avg(actions) FILTER(WHERE started_at>=b.s24))::numeric,1),
   'multi_module_pct',round((100.0*count(*) FILTER(WHERE started_at>=b.s24 AND modules>=2)/NULLIF(count(*) FILTER(WHERE started_at>=b.s24),0))::numeric,1),
   'power_sessions',count(*) FILTER(WHERE started_at>=b.s24 AND actions>=10),
   'parent_timestamp_mismatch_24h',count(*) FILTER(WHERE started_at>=b.s24 AND parent_timestamp_mismatch)
  ),
  '30d',jsonb_build_object(
   'sessions',count(*) FILTER(WHERE started_at>=b.s30),
   'median_minutes',round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(duration_end-duration_start))/60) FILTER(WHERE started_at>=b.s30))::numeric,1),
   'p95_minutes',round((percentile_cont(.95) WITHIN GROUP(ORDER BY extract(epoch FROM(duration_end-duration_start))/60) FILTER(WHERE started_at>=b.s30))::numeric,1),
   'avg_actions',round((avg(actions) FILTER(WHERE started_at>=b.s30))::numeric,1),
   'multi_module_pct',round((100.0*count(*) FILTER(WHERE started_at>=b.s30 AND modules>=2)/NULLIF(count(*) FILTER(WHERE started_at>=b.s30),0))::numeric,1),
   'power_sessions',count(*) FILTER(WHERE started_at>=b.s30 AND actions>=10),
   'parent_timestamp_mismatch_30d',count(*) FILTER(WHERE started_at>=b.s30 AND parent_timestamp_mismatch)
  )
 ) data FROM session_rows,b
),
daily AS (
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.day_key),'[]'::jsonb) data FROM(
  SELECT (occurred_at AT TIME ZONE 'Europe/Lisbon')::date day_key,count(DISTINCT installation_id) installations,count(DISTINCT installation_id) users,
   count(*) FILTER(WHERE event='app_open') opens,count(*) FILTER(WHERE event='vehicle_lookup') lookups,
   count(*) FILTER(WHERE event='vehicle_insurance_error') asf_errors,count(*) FILTER(WHERE event='cinemometer_calculation') speed_calcs,
   count(*) FILTER(WHERE event='legislation_copy') leg_copies
  FROM ev GROUP BY 1 ORDER BY 1)x
),
hourly AS (
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.hour_num),'[]'::jsonb) data FROM(
  SELECT extract(hour FROM occurred_at AT TIME ZONE 'Europe/Lisbon')::int hour_num,
   count(*) FILTER(WHERE event<>'heartbeat') actions,count(DISTINCT installation_id) installations,count(DISTINCT installation_id) users
  FROM ev,b WHERE occurred_at>=b.s24 GROUP BY 1 ORDER BY actions DESC,hour_num
 )x
),
modules AS (
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data FROM(
  SELECT module,count(*) qty FROM ev WHERE event='module_open' AND module IS NOT NULL GROUP BY module
 )x
),
module_activity AS (
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data FROM(
  SELECT module,count(*) qty FROM ev WHERE event<>'heartbeat' AND module IS NOT NULL GROUP BY module
 )x
),
transitions AS (
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) data FROM(
  SELECT previous_module from_module,module to_module,count(*) qty FROM(
   SELECT session_id,module,lag(module) OVER(PARTITION BY session_id ORDER BY occurred_at,event_id) previous_module
   FROM ev WHERE event='module_open' AND session_id IS NOT NULL AND module IS NOT NULL
  ) sequence WHERE previous_module IS NOT NULL AND previous_module<>module GROUP BY 1,2 ORDER BY qty DESC LIMIT 20
 )x
)
SELECT jsonb_build_object(
 'bounds',jsonb_build_object('s24',(SELECT s24 FROM b),'s7',(SELECT s7 FROM b),'s30',(SELECT s30 FROM b),'end',(SELECT enow FROM b)),
 'actions',jsonb_build_object('24h',(SELECT data->'actions_24h' FROM telemetry),'7d',(SELECT data->'actions_7d' FROM telemetry),'30d',(SELECT data->'actions_30d' FROM telemetry)),
 'insurance',(SELECT data FROM insurance),
 'insurance_quality',(SELECT data FROM insurance_quality),
 'query_quality',(SELECT data FROM query_quality),
 'speed_summary',(SELECT data FROM speed_summary),
 'speed_dimensions',(SELECT data FROM speed_dimensions),
 'speed_distribution_24h',(SELECT data FROM speed_distribution),
 'errors',(SELECT data FROM errors),
 'telemetry',(SELECT data FROM telemetry),
 'sessions',(SELECT data FROM sessions),
 'usage',jsonb_build_object('daily',(SELECT data FROM daily),'hourly',(SELECT data FROM hourly),'modules',(SELECT data FROM modules),'module_activity',(SELECT data FROM module_activity),'transitions',(SELECT data FROM transitions))
)
$metrics$;

REVOKE ALL ON FUNCTION public.verix2_telemetry_metrics_v3(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_telemetry_metrics_v3(timestamptz) TO service_role;
COMMENT ON FUNCTION public.verix2_telemetry_metrics_v3(timestamptz) IS
'Canonical telemetry metrics v3: rolling windows, query cohorts, version-aware diagnostic coverage, deduplicated speed measurements, heartbeat-excluded actions, and installation/session semantics.';

