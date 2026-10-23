-- Main Admin period means "today so far", from Lisbon local midnight.
-- Panels expressly labelled "last 24 hours" retain their rolling-window semantics.
-- The daily period no longer shifts when the manual baseline is reset.
CREATE OR REPLACE FUNCTION public.verix2_admin_dashboard_fast(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET work_mem TO '64MB'
AS $function$
WITH b AS (
  SELECT
    (date_trunc('day', p_now AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon') AS s24,
    greatest(p_now - interval '7 days', public.verix2_all_start(p_now)) AS s7,
    greatest(p_now - interval '30 days', public.verix2_all_start(p_now)) AS s30,
    p_now AS enow
),
ev AS MATERIALIZED (
  SELECT e.installation_id,e.session_id,e.query_id,e.event,e.module,e.occurred_at
  FROM public.verix2_events e,b
  WHERE e.occurred_at >= b.s30 AND e.occurred_at < b.enow
),
q AS (
  SELECT query_id,min(occurred_at) AS first_at
  FROM ev WHERE event='vehicle_lookup' AND query_id IS NOT NULL
  GROUP BY query_id
),
fc AS (
  SELECT query_id,count(*) AS final_event_count,count(DISTINCT event) AS final_type_count,
         min(event) AS final_event,max(occurred_at) AS final_at
  FROM ev
  WHERE event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
    AND query_id IS NOT NULL
  GROUP BY query_id
),
pt_error_q AS MATERIALIZED (
  SELECT DISTINCT e.query_id
  FROM public.verix2_events e,b
  WHERE e.event='vehicle_insurance_error'
    AND e.query_id IS NOT NULL
    AND e.occurred_at >= b.s30 AND e.occurred_at < b.enow
    AND public.verix2_is_portuguese_plate_format(coalesce(
      nullif(e.metadata->>'matriculaNormalizada',''),
      nullif(e.metadata->'asfDiagnostic'->>'matricula',''),
      nullif(e.metadata->>'matricula',''),
      nullif(e.metadata->>'matriculaCapturada','')
    ))
),
pc AS (
  SELECT query_id,count(*) AS pending_count
  FROM ev WHERE event='vehicle_insurance_pending' AND query_id IS NOT NULL
  GROUP BY query_id
),
quality AS (
  SELECT q.query_id,q.first_at,coalesce(fc.final_event_count,0) AS final_event_count,
         coalesce(fc.final_type_count,0) AS final_type_count,fc.final_event,fc.final_at,
         CASE
           WHEN fc.final_event_count=1 THEN 'valid'
           WHEN coalesce(fc.final_event_count,0)>1 AND coalesce(fc.final_type_count,0)>1 THEN 'contradictory'
           WHEN coalesce(fc.final_event_count,0)>1 THEN 'duplicate_finals'
           WHEN coalesce(pc.pending_count,0)>0 THEN 'pending'
           ELSE 'incomplete'
         END AS outcome_state
  FROM q
  LEFT JOIN fc ON fc.query_id=q.query_id
  LEFT JOIN pc ON pc.query_id=q.query_id
),
period_quality AS (
  SELECT '24h'::text AS period,q.* FROM quality q,b WHERE q.first_at>=b.s24
  UNION ALL
  SELECT '7d'::text,q.* FROM quality q,b WHERE q.first_at>=b.s7
  UNION ALL
  SELECT '30d'::text,q.* FROM quality q
),
periods AS (
  SELECT unnest(ARRAY['24h','7d','30d']::text[]) AS period
),
insurance_counts AS (
  SELECT p.period,
         count(pq.query_id) AS started,
         count(pq.query_id) FILTER(WHERE pq.outcome_state='valid') AS finals,
         count(pq.query_id) FILTER(WHERE pq.outcome_state='valid' AND pq.final_event='vehicle_insurance_yes') AS insured,
         count(pq.query_id) FILTER(WHERE pq.outcome_state='valid' AND pq.final_event='vehicle_insurance_no') AS uninsured,
         count(pq.query_id) FILTER(WHERE pq.outcome_state='valid' AND pq.final_event='vehicle_insurance_error') AS errors,
         count(pq.query_id) FILTER(
           WHERE pq.outcome_state='valid'
             AND pq.final_event='vehicle_insurance_error'
             AND pq.query_id IN (SELECT query_id FROM pt_error_q)
         ) AS portuguese_errors,
         count(pq.query_id) FILTER(WHERE pq.outcome_state='pending') AS pending,
         count(pq.query_id) FILTER(WHERE pq.outcome_state='incomplete') AS incomplete,
         count(pq.query_id) FILTER(WHERE pq.outcome_state='contradictory') AS contradictory,
         count(pq.query_id) FILTER(WHERE pq.outcome_state='duplicate_finals') AS duplicate_finals,
         count(pq.query_id) FILTER(WHERE pq.final_event_count>1) AS multi_final
  FROM periods p
  LEFT JOIN period_quality pq ON pq.period=p.period
  GROUP BY p.period
),
insurance AS (
  SELECT coalesce(jsonb_object_agg(period,to_jsonb(i)-'period'),'{}'::jsonb) AS data
  FROM insurance_counts i
),
presence AS (
  SELECT session_id,
         max(occurred_at) FILTER(WHERE event IN ('app_open','heartbeat')) AS last_presence,
         max(occurred_at) FILTER(WHERE event='session_close') AS last_close
  FROM public.verix2_events
  WHERE session_id IS NOT NULL
    AND event IN ('app_open','heartbeat','session_close')
    AND occurred_at >= p_now-interval '2 minutes'
    AND occurred_at <= p_now+interval '30 seconds'
  GROUP BY session_id
),
overview_counts AS MATERIALIZED (
  -- Same reporting semantics, one pass over the event CTE for headline metrics.
  SELECT
    count(DISTINCT e.installation_id) FILTER (WHERE e.occurred_at >= b.s24) AS unique_24h,
    count(DISTINCT e.installation_id) FILTER (WHERE e.occurred_at >= b.s7) AS unique_7d,
    count(DISTINCT e.installation_id) AS unique_30d,
    count(*) FILTER (WHERE e.occurred_at >= b.s24) AS events_24h,
    count(*) FILTER (WHERE e.occurred_at >= b.s7) AS events_7d,
    count(*) AS events_30d,
    max(e.occurred_at) AS last_event_at
  FROM ev e CROSS JOIN b
),
overview AS (
  SELECT jsonb_build_object(
    'online_now',(SELECT count(*) FROM presence p
      WHERE p.last_presence>=p_now-interval '90 seconds'
        AND (p.last_close IS NULL OR p.last_presence>p.last_close)),
    'active_10m',(SELECT count(*) FROM (
      SELECT installation_id FROM public.verix2_installations WHERE last_seen>=p_now-interval '10 minutes'
      UNION SELECT installation_id FROM public.verix2_sessions WHERE last_seen>=p_now-interval '10 minutes'
      UNION SELECT installation_id FROM public.verix2_events
        WHERE occurred_at>=p_now-interval '10 minutes' AND occurred_at>=(SELECT s30 FROM b) AND occurred_at<p_now
    ) active10),
    'unique_24h',oc.unique_24h,
    'unique_7d',oc.unique_7d,
    'unique_30d',oc.unique_30d,
    'events_24h',oc.events_24h,
    'events_7d',oc.events_7d,
    'events_30d',oc.events_30d,
    'last_event_at',oc.last_event_at
  ) AS data
  FROM b CROSS JOIN overview_counts oc
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
  ) AS data
  FROM public.verix2_installations i,b
),
sess AS (
  SELECT session_id,min(occurred_at) AS first_at,max(occurred_at) AS last_at,
         count(*) FILTER(WHERE event<>'heartbeat') AS actions,
         count(DISTINCT module) FILTER(WHERE module IS NOT NULL) AS modules
  FROM ev WHERE session_id IS NOT NULL GROUP BY session_id
),
session_metrics AS (
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'sessions',count(*) FILTER(WHERE first_at>=b.s24),
      'median_minutes',round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60) FILTER(WHERE first_at>=b.s24))::numeric,1),
      'p95_minutes',round((percentile_cont(.95) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60) FILTER(WHERE first_at>=b.s24))::numeric,1),
      'avg_actions',round((avg(actions) FILTER(WHERE first_at>=b.s24))::numeric,1),
      'multi_module_pct',round((100.0*count(*) FILTER(WHERE first_at>=b.s24 AND modules>=2)/NULLIF(count(*) FILTER(WHERE first_at>=b.s24),0))::numeric,1),
      'power_sessions',count(*) FILTER(WHERE first_at>=b.s24 AND actions>=10)),
    '7d',jsonb_build_object(
      'sessions',count(*) FILTER(WHERE first_at>=b.s7),
      'median_minutes',round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60) FILTER(WHERE first_at>=b.s7))::numeric,1),
      'p95_minutes',round((percentile_cont(.95) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60) FILTER(WHERE first_at>=b.s7))::numeric,1),
      'avg_actions',round((avg(actions) FILTER(WHERE first_at>=b.s7))::numeric,1),
      'multi_module_pct',round((100.0*count(*) FILTER(WHERE first_at>=b.s7 AND modules>=2)/NULLIF(count(*) FILTER(WHERE first_at>=b.s7),0))::numeric,1),
      'power_sessions',count(*) FILTER(WHERE first_at>=b.s7 AND actions>=10)),
    '30d',jsonb_build_object(
      'sessions',count(*),
      'median_minutes',round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60))::numeric,1),
      'p95_minutes',round((percentile_cont(.95) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60))::numeric,1),
      'avg_actions',round(avg(actions)::numeric,1),
      'multi_module_pct',round((100.0*count(*) FILTER(WHERE modules>=2)/NULLIF(count(*),0))::numeric,1),
      'power_sessions',count(*) FILTER(WHERE actions>=10))
  ) AS data
  FROM sess,b
),
modules AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) AS data
  FROM (
    SELECT coalesce(module,'(sem módulo)') AS module,count(*) AS qty
    FROM ev WHERE event='module_open'
    GROUP BY 1 ORDER BY qty DESC LIMIT 15
  ) x
),
daily AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.day_key),'[]'::jsonb) AS data
  FROM (
    SELECT (occurred_at AT TIME ZONE 'Europe/Lisbon')::date AS day_key,
           count(DISTINCT installation_id) AS users,
           count(*) FILTER(WHERE event='app_open') AS opens,
           count(*) FILTER(WHERE event='vehicle_lookup') AS lookups,
           count(*) FILTER(WHERE event='vehicle_insurance_error') AS asf_errors,
           count(*) FILTER(WHERE event='cinemometer_calculation') AS speed_calcs,
           count(*) FILTER(WHERE event='legislation_copy') AS leg_copies
    FROM ev GROUP BY 1 ORDER BY 1
  ) x
),
hourly AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.hour_num),'[]'::jsonb) AS data
  FROM (
    SELECT h.hour_num,coalesce(c.consultations,0) AS consultations,coalesce(c.consultations,0) AS actions,
           coalesce(p.users,0) AS users,coalesce(p.sessions,0) AS sessions
    FROM generate_series(0,23) h(hour_num)
    LEFT JOIN (
      SELECT extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Lisbon')::int AS hour_num,
             count(DISTINCT e.query_id) FILTER(WHERE e.event='vehicle_lookup' AND e.query_id IS NOT NULL) AS consultations
      FROM ev e,b WHERE e.occurred_at>=b.s24 GROUP BY 1
    ) c USING(hour_num)
    LEFT JOIN (
      SELECT extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Lisbon')::int AS hour_num,
             count(DISTINCT e.installation_id) FILTER(WHERE e.event IN('app_open','heartbeat')) AS users,
             count(DISTINCT e.session_id) FILTER(WHERE e.event IN('app_open','heartbeat') AND e.session_id IS NOT NULL) AS sessions
      FROM ev e,b WHERE e.occurred_at>=b.s24 GROUP BY 1
    ) p USING(hour_num)
    ORDER BY h.hour_num
  ) x
),
err_plates AS (
  SELECT upper(regexp_replace(coalesce(e.metadata->'asfDiagnostic'->>'matricula',e.metadata->>'matricula',''),'[^A-Z0-9]','','g')) AS plate_key,
         max(coalesce(e.metadata->'asfDiagnostic'->>'matricula',e.metadata->>'matricula')) AS plate,
         count(*) AS qty,max(e.occurred_at) AS last_at,
         array_agg(DISTINCT coalesce(e.metadata->'asfDiagnostic'->>'asfErrorType','unknown')) AS kinds
  FROM public.verix2_events e,b
  WHERE e.event='vehicle_insurance_error'
    AND e.occurred_at>=b.s24 AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow
    AND coalesce(e.metadata->'asfDiagnostic'->>'matricula',e.metadata->>'matricula','')<>''
  GROUP BY 1 ORDER BY qty DESC,last_at DESC LIMIT 20
)
SELECT jsonb_build_object(
  'generated_at',p_now,
  'bounds',jsonb_build_object('s24',(SELECT s24 FROM b),'s7',(SELECT s7 FROM b),'s30',(SELECT s30 FROM b),'end',(SELECT enow FROM b)),
  'overview',(SELECT data FROM overview),
  'retention',(SELECT data FROM ret),
  'insurance',(SELECT data FROM insurance),
  'errors',jsonb_build_object('plates',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM err_plates x),'[]'::jsonb)),
  'usage',jsonb_build_object('modules',(SELECT data FROM modules),'sessions',(SELECT data FROM session_metrics),'daily',(SELECT data FROM daily),'hourly',(SELECT data FROM hourly))
);
$function$;

CREATE OR REPLACE FUNCTION public.verix2_admin_auxiliary_fast(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET work_mem TO '16MB'
AS $function$
WITH b AS (
  SELECT
    (date_trunc('day', p_now AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon') AS s24,
    greatest(p_now - interval '7 days', public.verix2_all_start(p_now)) AS s7,
    greatest(p_now - interval '30 days', public.verix2_all_start(p_now)) AS s30,
    public.verix2_all_start(p_now) AS s_all,
    p_now AS enow
),
leg_events AS MATERIALIZED (
  SELECT e.event, e.occurred_at, e.metadata
  FROM public.verix2_events e, b
  WHERE e.occurred_at >= b.s_all AND e.occurred_at < b.enow
    AND e.event IN ('legislation_category_open','legislation_search','legislation_copy','legislation_favorite_toggle')
),
legislation_counts AS (
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'opens',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='legislation_category_open'),
      'searches',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='legislation_search'),
      'copies',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='legislation_copy'),
      'favorites',count(*) FILTER(WHERE occurred_at>=b.s24 AND event='legislation_favorite_toggle')),
    '7d',jsonb_build_object(
      'opens',count(*) FILTER(WHERE occurred_at>=b.s7 AND event='legislation_category_open'),
      'searches',count(*) FILTER(WHERE occurred_at>=b.s7 AND event='legislation_search'),
      'copies',count(*) FILTER(WHERE occurred_at>=b.s7 AND event='legislation_copy'),
      'favorites',count(*) FILTER(WHERE occurred_at>=b.s7 AND event='legislation_favorite_toggle')),
    '30d',jsonb_build_object(
      'opens',count(*) FILTER(WHERE occurred_at>=b.s30 AND event='legislation_category_open'),
      'searches',count(*) FILTER(WHERE occurred_at>=b.s30 AND event='legislation_search'),
      'copies',count(*) FILTER(WHERE occurred_at>=b.s30 AND event='legislation_copy'),
      'favorites',count(*) FILTER(WHERE occurred_at>=b.s30 AND event='legislation_favorite_toggle')),
    'total',jsonb_build_object(
      'opens',count(*) FILTER(WHERE event='legislation_category_open'),
      'searches',count(*) FILTER(WHERE event='legislation_search'),
      'copies',count(*) FILTER(WHERE event='legislation_copy'),
      'favorites',count(*) FILTER(WHERE event='legislation_favorite_toggle'))
  ) AS data
  FROM leg_events, b
),
legislation_items AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC, x.item_label),'[]'::jsonb) AS data
  FROM (
    SELECT e.metadata->>'itemId' AS item_id,
           e.metadata->>'itemLabel' AS item_label,
           count(*) AS qty,
           count(*) FILTER(WHERE e.metadata->>'copyType'='code') AS code_qty,
           count(*) FILTER(WHERE e.metadata->>'copyType'='description') AS desc_qty,
           count(*) FILTER(WHERE e.metadata->>'copyType'='all') AS all_qty
    FROM public.verix2_events e, b
    WHERE e.event='legislation_copy'
      AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow
    GROUP BY 1,2
    ORDER BY qty DESC, item_label
    LIMIT 30
  ) x
),
final_counts AS (
  SELECT e.query_id,
         count(*) AS final_event_count,
         (array_agg(e.metadata ORDER BY e.occurred_at DESC,e.event_id DESC))[1] AS metadata,
         max(e.occurred_at) AS occurred_at
  FROM public.verix2_events e, b
  WHERE e.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
    AND e.query_id IS NOT NULL
    AND e.occurred_at>=b.s30 AND e.occurred_at<b.enow
  GROUP BY e.query_id
),
valid_finals AS (
  SELECT metadata, occurred_at
  FROM final_counts
  WHERE final_event_count=1
),
insurance_quality AS (
  SELECT jsonb_build_object(
    'latency_p50_ms',(
      SELECT round((percentile_cont(.5) WITHIN GROUP(
        ORDER BY (f.metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
      FROM valid_finals f,b
      WHERE f.occurred_at>=b.s24
        AND (f.metadata->'asfDiagnostic'->>'asfDurationMs')~'^[0-9]+(\.[0-9]+)?$'),
    'latency_p95_ms',(
      SELECT round((percentile_cont(.95) WITHIN GROUP(
        ORDER BY (f.metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
      FROM valid_finals f,b
      WHERE f.occurred_at>=b.s24
        AND (f.metadata->'asfDiagnostic'->>'asfDurationMs')~'^[0-9]+(\.[0-9]+)?$'),
    'known_plates_24h',(
      SELECT count(DISTINCT upper(regexp_replace(coalesce(
        f.metadata->'asfDiagnostic'->>'matricula',f.metadata->>'matricula',''),'[^A-Z0-9]','','g')))
      FROM valid_finals f,b
      WHERE f.occurred_at>=b.s24
        AND coalesce(f.metadata->'asfDiagnostic'->>'matricula',f.metadata->>'matricula','')<>''),
    'known_plates_30d',(
      SELECT count(DISTINCT upper(regexp_replace(coalesce(
        f.metadata->'asfDiagnostic'->>'matricula',f.metadata->>'matricula',''),'[^A-Z0-9]','','g')))
      FROM valid_finals f
      WHERE coalesce(f.metadata->'asfDiagnostic'->>'matricula',f.metadata->>'matricula','')<>'')
  ) AS data
),
telemetry_agg AS (
  SELECT
    count(*) AS events_30d,
    count(*) FILTER (WHERE e.event='heartbeat') AS heartbeats_30d,
    count(*) FILTER (WHERE e.event IN (
      'app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry',
      'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'
    )) AS client_events,
    count(*) FILTER (WHERE e.event IN (
      'app_open','heartbeat','cinemometer_calculation','cinemometer_speed_entry',
      'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'
    ) AND e.metadata ? 'client') AS client_with_metadata,
    count(*) FILTER (WHERE e.event IN (
      'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'
    )) AS asf_events,
    count(*) FILTER (WHERE e.event IN (
      'vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'
    ) AND e.metadata ? 'asfDiagnostic') AS asf_with_diagnostic,
    count(*) FILTER (WHERE e.event IN (
      'cinemometer_calculation','cinemometer_speed_entry'
    )) AS cin_events,
    count(*) FILTER (WHERE e.event IN (
      'cinemometer_calculation','cinemometer_speed_entry'
    ) AND e.metadata ? 'cin') AS cin_with_detail
  FROM public.verix2_events e,b
  WHERE e.occurred_at>=b.s30 AND e.occurred_at<b.enow
),
telemetry AS (
  SELECT jsonb_build_object(
    'events_30d',events_30d,
    'heartbeats_30d',heartbeats_30d,
    'client_coverage_30d',round((100.0*client_with_metadata/NULLIF(client_events,0))::numeric,1),
    'asf_diagnostic_coverage_30d',round((100.0*asf_with_diagnostic/NULLIF(asf_events,0))::numeric,1),
    'cin_detail_coverage_30d',round((100.0*cin_with_detail/NULLIF(cin_events,0))::numeric,1)
  ) AS data
  FROM telemetry_agg
)
SELECT jsonb_build_object(
  'legislation',jsonb_build_object(
    'counts',(SELECT data FROM legislation_counts),
    'items',(SELECT data FROM legislation_items)),
  'insurance_quality',(SELECT data FROM insurance_quality),
  'telemetry',(SELECT data FROM telemetry)
);
$function$;

CREATE OR REPLACE FUNCTION public.verix2_admin_dashboard_cached(
  p_now timestamptz DEFAULT now(),
  p_force_refresh boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '48MB'
AS $function$
DECLARE
  v_requested_at timestamptz := clock_timestamp();
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_live boolean;
  v_reset24 timestamptz;
  v_reset_all timestamptz;
  v_cache_reset24 timestamptz;
  v_cache_reset_all timestamptz;
  v_payload jsonb;
  v_cached_at timestamptz;
  v_compatible boolean := false;
  v_lock_key bigint := hashtextextended('verix2_admin_dashboard_shared_cache', 0);
BEGIN
  v_live := abs(extract(epoch FROM (v_now - clock_timestamp()))) <= 10;

  IF NOT v_live THEN
    RETURN public.verix2_admin_dashboard_fast(v_now);
  END IF;

  SELECT s.reset_24h_at, s.reset_all_at
    INTO v_reset24, v_reset_all
  FROM public.verix2_dashboard_state s
  WHERE s.singleton = true;

  SELECT c.refreshed_at, c.reset_24h_at, c.reset_all_at, c.payload
    INTO v_cached_at, v_cache_reset24, v_cache_reset_all, v_payload
  FROM public.verix2_admin_dashboard_cache c
  WHERE c.singleton = true;

  v_compatible := FOUND
    AND v_cache_reset24 IS NOT DISTINCT FROM v_reset24
    AND v_cache_reset_all IS NOT DISTINCT FROM v_reset_all
    AND (v_payload #>> '{bounds,s24}')::timestamptz >=
        (date_trunc('day', v_now AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon');

  IF v_compatible AND NOT coalesce(p_force_refresh, false) THEN
    IF v_cached_at >= clock_timestamp() - interval '45 seconds' THEN
      RETURN v_payload;
    END IF;
    IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
      RETURN v_payload;
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END IF;

  SELECT c.refreshed_at, c.reset_24h_at, c.reset_all_at, c.payload
    INTO v_cached_at, v_cache_reset24, v_cache_reset_all, v_payload
  FROM public.verix2_admin_dashboard_cache c
  WHERE c.singleton = true;

  v_compatible := FOUND
    AND v_cache_reset24 IS NOT DISTINCT FROM v_reset24
    AND v_cache_reset_all IS NOT DISTINCT FROM v_reset_all
    AND (v_payload #>> '{bounds,s24}')::timestamptz >=
        (date_trunc('day', v_now AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon');

  -- Coalesce concurrent refresh requests, including an Admin click overlapping cron.
  IF v_compatible AND v_payload IS NOT NULL
     AND v_cached_at >= v_requested_at THEN
    RETURN v_payload;
  END IF;

  IF v_compatible
     AND NOT coalesce(p_force_refresh, false)
     AND v_cached_at >= clock_timestamp() - interval '45 seconds' THEN
    RETURN v_payload;
  END IF;

  BEGIN
    v_payload := public.verix2_admin_dashboard_fast(v_now);
  EXCEPTION WHEN OTHERS THEN
    IF v_compatible
       AND v_cached_at >= clock_timestamp() - interval '5 minutes'
       AND v_payload IS NOT NULL THEN
      RETURN v_payload;
    END IF;
    RAISE;
  END;

  INSERT INTO public.verix2_admin_dashboard_cache
    (singleton, refreshed_at, reset_24h_at, reset_all_at, payload)
  VALUES
    (true, clock_timestamp(), v_reset24, v_reset_all, v_payload)
  ON CONFLICT (singleton) DO UPDATE
    SET refreshed_at = EXCLUDED.refreshed_at,
        reset_24h_at = EXCLUDED.reset_24h_at,
        reset_all_at = EXCLUDED.reset_all_at,
        payload = EXCLUDED.payload;

  RETURN v_payload;
END;
$function$;

COMMENT ON FUNCTION public.verix2_admin_dashboard_fast(timestamptz) IS
  'Admin dashboard analytics; 24h period starts at Europe/Lisbon local midnight.';
COMMENT ON FUNCTION public.verix2_admin_auxiliary_fast(timestamptz) IS
  'Auxiliary Admin analytics; 24h period starts at Europe/Lisbon local midnight.';
