-- Correct stale consultation states in the existing dashboard-quality contract.
-- A pending marker older than 10 minutes is no longer an active pending request;
-- it is incomplete until a final result event arrives.
-- Replace a UNION ALL over 24h/7d/30d quality rows with one conditional aggregate.
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
  SELECT query_id,
         count(*) AS pending_count,
         max(occurred_at) AS pending_at
  FROM ev
  WHERE event='vehicle_insurance_pending'
    AND query_id IS NOT NULL
  GROUP BY query_id
),
quality AS (
  SELECT q.query_id,q.first_at,coalesce(fc.final_event_count,0) AS final_event_count,
         coalesce(fc.final_type_count,0) AS final_type_count,fc.final_event,fc.final_at,
         pc.pending_at,
         CASE
           WHEN fc.final_event_count=1 THEN 'valid'
           WHEN coalesce(fc.final_event_count,0)>1 AND coalesce(fc.final_type_count,0)>1 THEN 'contradictory'
           WHEN coalesce(fc.final_event_count,0)>1 THEN 'duplicate_finals'
           WHEN coalesce(pc.pending_count,0)>0
             AND pc.pending_at >= p_now - interval '10 minutes' THEN 'pending'
           ELSE 'incomplete'
         END AS outcome_state
  FROM q
  LEFT JOIN fc ON fc.query_id=q.query_id
  LEFT JOIN pc ON pc.query_id=q.query_id
),
insurance_counts AS (
  -- Aggregate each consultation once, with conditional counts for every reporting window.
  -- This avoids duplicating 24h/7d/30d query rows and sorting the expanded intermediate set.
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'started',count(q.query_id) FILTER(WHERE q.first_at>=b.s24),
      'finals',count(q.query_id) FILTER(WHERE q.first_at>=b.s24 AND q.outcome_state='valid'),
      'insured',count(q.query_id) FILTER(WHERE q.first_at>=b.s24 AND q.outcome_state='valid' AND q.final_event='vehicle_insurance_yes'),
      'uninsured',count(q.query_id) FILTER(WHERE q.first_at>=b.s24 AND q.outcome_state='valid' AND q.final_event='vehicle_insurance_no'),
      'errors',count(q.query_id) FILTER(WHERE q.first_at>=b.s24 AND q.outcome_state='valid' AND q.final_event='vehicle_insurance_error'),
      'portuguese_errors',count(q.query_id) FILTER(
        WHERE q.first_at>=b.s24 AND q.outcome_state='valid'
          AND q.final_event='vehicle_insurance_error'
          AND q.query_id IN (SELECT query_id FROM pt_error_q)
      ),
      'pending',count(q.query_id) FILTER(WHERE q.first_at>=b.s24 AND q.outcome_state='pending'),
      'incomplete',count(q.query_id) FILTER(WHERE q.first_at>=b.s24 AND q.outcome_state='incomplete'),
      'contradictory',count(q.query_id) FILTER(WHERE q.first_at>=b.s24 AND q.outcome_state='contradictory'),
      'duplicate_finals',count(q.query_id) FILTER(WHERE q.first_at>=b.s24 AND q.outcome_state='duplicate_finals'),
      'multi_final',count(q.query_id) FILTER(WHERE q.first_at>=b.s24 AND q.final_event_count>1)),
    '7d',jsonb_build_object(
      'started',count(q.query_id) FILTER(WHERE q.first_at>=b.s7),
      'finals',count(q.query_id) FILTER(WHERE q.first_at>=b.s7 AND q.outcome_state='valid'),
      'insured',count(q.query_id) FILTER(WHERE q.first_at>=b.s7 AND q.outcome_state='valid' AND q.final_event='vehicle_insurance_yes'),
      'uninsured',count(q.query_id) FILTER(WHERE q.first_at>=b.s7 AND q.outcome_state='valid' AND q.final_event='vehicle_insurance_no'),
      'errors',count(q.query_id) FILTER(WHERE q.first_at>=b.s7 AND q.outcome_state='valid' AND q.final_event='vehicle_insurance_error'),
      'portuguese_errors',count(q.query_id) FILTER(
        WHERE q.first_at>=b.s7 AND q.outcome_state='valid'
          AND q.final_event='vehicle_insurance_error'
          AND q.query_id IN (SELECT query_id FROM pt_error_q)
      ),
      'pending',count(q.query_id) FILTER(WHERE q.first_at>=b.s7 AND q.outcome_state='pending'),
      'incomplete',count(q.query_id) FILTER(WHERE q.first_at>=b.s7 AND q.outcome_state='incomplete'),
      'contradictory',count(q.query_id) FILTER(WHERE q.first_at>=b.s7 AND q.outcome_state='contradictory'),
      'duplicate_finals',count(q.query_id) FILTER(WHERE q.first_at>=b.s7 AND q.outcome_state='duplicate_finals'),
      'multi_final',count(q.query_id) FILTER(WHERE q.first_at>=b.s7 AND q.final_event_count>1)),
    '30d',jsonb_build_object(
      'started',count(q.query_id) FILTER(WHERE q.first_at>=b.s30),
      'finals',count(q.query_id) FILTER(WHERE q.first_at>=b.s30 AND q.outcome_state='valid'),
      'insured',count(q.query_id) FILTER(WHERE q.first_at>=b.s30 AND q.outcome_state='valid' AND q.final_event='vehicle_insurance_yes'),
      'uninsured',count(q.query_id) FILTER(WHERE q.first_at>=b.s30 AND q.outcome_state='valid' AND q.final_event='vehicle_insurance_no'),
      'errors',count(q.query_id) FILTER(WHERE q.first_at>=b.s30 AND q.outcome_state='valid' AND q.final_event='vehicle_insurance_error'),
      'portuguese_errors',count(q.query_id) FILTER(
        WHERE q.first_at>=b.s30 AND q.outcome_state='valid'
          AND q.final_event='vehicle_insurance_error'
          AND q.query_id IN (SELECT query_id FROM pt_error_q)
      ),
      'pending',count(q.query_id) FILTER(WHERE q.first_at>=b.s30 AND q.outcome_state='pending'),
      'incomplete',count(q.query_id) FILTER(WHERE q.first_at>=b.s30 AND q.outcome_state='incomplete'),
      'contradictory',count(q.query_id) FILTER(WHERE q.first_at>=b.s30 AND q.outcome_state='contradictory'),
      'duplicate_finals',count(q.query_id) FILTER(WHERE q.first_at>=b.s30 AND q.outcome_state='duplicate_finals'),
      'multi_final',count(q.query_id) FILTER(WHERE q.first_at>=b.s30 AND q.final_event_count>1))
  ) AS data
  FROM quality q CROSS JOIN b
),
insurance AS (
  SELECT data FROM insurance_counts
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

modules AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC),'[]'::jsonb) AS data
  FROM (
    SELECT coalesce(module,'(sem módulo)') AS module,count(*) AS qty
    FROM ev WHERE event='module_open'
    GROUP BY 1 ORDER BY qty DESC LIMIT 15
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
  'usage',jsonb_build_object('modules',(SELECT data FROM modules))
);
$function$;
