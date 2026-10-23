-- The API obtains current hourly activity through the dedicated lightweight RPC.
-- Avoid recomputing duplicate hourly groupings inside the five-minute dashboard refresh.
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
unique_installation_counts AS MATERIALIZED (
  -- Installation state stores the most recent activity timestamp per installation.
  -- This matches the event-window distinct counts while avoiding a large raw-event sort.
  SELECT
    count(*) FILTER (WHERE i.last_seen >= b.s24 AND i.last_seen < b.enow) AS unique_24h,
    count(*) FILTER (WHERE i.last_seen >= b.s7 AND i.last_seen < b.enow) AS unique_7d,
    count(*) FILTER (WHERE i.last_seen >= b.s30 AND i.last_seen < b.enow) AS unique_30d
  FROM public.verix2_installations i CROSS JOIN b
),
overview_counts AS MATERIALIZED (
  SELECT
    (SELECT unique_24h FROM unique_installation_counts) AS unique_24h,
    (SELECT unique_7d FROM unique_installation_counts) AS unique_7d,
    (SELECT unique_30d FROM unique_installation_counts) AS unique_30d,
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
  -- This value is replaced by verix2_admin_hourly_active_interactions in stats-v2.
  -- Do not aggregate the same event history twice on each cache refresh.
  SELECT '[]'::jsonb AS data
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
