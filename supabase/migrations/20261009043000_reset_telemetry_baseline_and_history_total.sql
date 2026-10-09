-- Establish a clean, cumulative telemetry baseline without deleting archived rows.
CREATE OR REPLACE FUNCTION public.verix2_reset_all_periods()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.verix2_dashboard_state(singleton, reset_24h_at, reset_all_at)
  VALUES (true, v_now, v_now)
  ON CONFLICT (singleton) DO UPDATE
    SET reset_24h_at = EXCLUDED.reset_24h_at,
        reset_all_at = EXCLUDED.reset_all_at;
  RETURN v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.verix2_reset_all_periods() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_reset_all_periods() TO service_role;

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
    public.verix2_all_start(p_now) AS s_all,
    p_now AS enow
),
ev AS (
  SELECT e.event_id,e.installation_id,e.session_id,e.query_id,e.event,e.module,
         e.occurred_at,e.app_version,e.device_type,e.browser,e.metadata
  FROM public.verix2_events e,b
  WHERE e.occurred_at >= b.s30 AND e.occurred_at < b.enow
),
ev_total AS (
  SELECT e.event_id,e.installation_id,e.session_id,e.query_id,e.event,e.module,
         e.occurred_at,e.app_version,e.device_type,e.browser,e.metadata
  FROM public.verix2_events e,b
  WHERE e.occurred_at >= b.s_all AND e.occurred_at < b.enow
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
query_quality AS (
  SELECT q.query_id,q.first_at,
         COALESCE(fc.final_event_count,0) AS final_event_count,
         COALESCE(fc.final_type_count,0) AS final_type_count,
         fc.event AS final_event,fc.occurred_at AS final_at,
         CASE
           WHEN fc.final_event_count=1 THEN 'valid'
           WHEN COALESCE(fc.final_event_count,0)>1 AND COALESCE(fc.final_type_count,0)>1 THEN 'contradictory'
           WHEN COALESCE(fc.final_event_count,0)>1 THEN 'duplicate_finals'
           WHEN EXISTS (SELECT 1 FROM ev pe WHERE pe.query_id=q.query_id AND pe.event='vehicle_insurance_pending') THEN 'pending'
           ELSE 'incomplete'
         END AS outcome_state
  FROM q LEFT JOIN final_counts fc ON fc.query_id=q.query_id
),
q_total AS (
  SELECT query_id,min(occurred_at) AS first_at
  FROM ev_total WHERE event='vehicle_lookup' AND query_id IS NOT NULL GROUP BY query_id
),
final_counts_total AS (
  SELECT query_id,count(*) AS final_event_count,count(DISTINCT event) AS final_type_count,
         min(event) AS event,max(occurred_at) AS occurred_at
  FROM ev_total
  WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND query_id IS NOT NULL
  GROUP BY query_id
),
query_quality_total AS (
  SELECT qt.query_id,qt.first_at,COALESCE(fc.final_event_count,0) AS final_event_count,
         COALESCE(fc.final_type_count,0) AS final_type_count,fc.event AS final_event,fc.occurred_at AS final_at,
         CASE
           WHEN fc.final_event_count=1 THEN 'valid'
           WHEN COALESCE(fc.final_event_count,0)>1 AND COALESCE(fc.final_type_count,0)>1 THEN 'contradictory'
           WHEN COALESCE(fc.final_event_count,0)>1 THEN 'duplicate_finals'
           WHEN EXISTS (SELECT 1 FROM ev_total pe WHERE pe.query_id=qt.query_id AND pe.event='vehicle_insurance_pending') THEN 'pending'
           ELSE 'incomplete'
         END AS outcome_state
  FROM q_total qt LEFT JOIN final_counts_total fc ON fc.query_id=qt.query_id
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
    'unique_total',(SELECT count(DISTINCT installation_id) FROM ev_total),
    'events_total',(SELECT count(*) FROM ev_total),
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
      'returning',count(*) FILTER(WHERE last_seen>=b.s30 AND first_seen<b.s30)),
    'total',jsonb_build_object(
      'unique',count(*) FILTER(WHERE last_seen>=b.s_all),
      'new',count(*) FILTER(WHERE first_seen>=b.s_all),
      'returning',count(*) FILTER(WHERE last_seen>=b.s_all AND first_seen<b.s_all))
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
    ),
    'total',jsonb_build_object(
      'started',(SELECT count(*) FROM q_total WHERE first_at>=b.s_all),
      'finals',(SELECT count(*) FROM query_quality_total WHERE outcome_state='valid'),
      'insured',(SELECT count(*) FROM query_quality_total WHERE outcome_state='valid' AND final_event='vehicle_insurance_yes'),
      'uninsured',(SELECT count(*) FROM query_quality_total WHERE outcome_state='valid' AND final_event='vehicle_insurance_no'),
      'errors',(SELECT count(*) FROM query_quality_total WHERE outcome_state='valid' AND final_event='vehicle_insurance_error'),
      'pending',(SELECT count(*) FROM query_quality_total WHERE outcome_state='pending'),
      'incomplete',(SELECT count(*) FROM query_quality_total WHERE outcome_state='incomplete'),
      'contradictory',(SELECT count(*) FROM query_quality_total WHERE outcome_state='contradictory'),
      'duplicate_finals',(SELECT count(*) FROM query_quality_total WHERE outcome_state='duplicate_finals'),
      'multi_final',(SELECT count(*) FROM query_quality_total WHERE final_event_count>1),
      'orphan_finals',(SELECT count(*) FROM final_counts_total fc WHERE NOT EXISTS(SELECT 1 FROM ev_total le WHERE le.event='vehicle_lookup' AND le.query_id=fc.query_id))
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
      'favorites',count(*) FILTER(WHERE event='legislation_favorite_toggle')),
    'total',jsonb_build_object(
      'opens',(SELECT count(*) FROM ev_total WHERE event='legislation_category_open'),
      'searches',(SELECT count(*) FROM ev_total WHERE event='legislation_search'),
      'copies',(SELECT count(*) FROM ev_total WHERE event='legislation_copy'),
      'favorites',(SELECT count(*) FROM ev_total WHERE event='legislation_favorite_toggle'))
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
sess_total AS (
  SELECT session_id,min(occurred_at) first_at,max(occurred_at) last_at,
         count(*) total_events,count(*) FILTER(WHERE event<>'heartbeat') actions,
         count(DISTINCT module) FILTER(WHERE module IS NOT NULL) modules
  FROM ev_total WHERE session_id IS NOT NULL GROUP BY 1
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
    ),
    'total',jsonb_build_object(
      'sessions',(SELECT count(*) FROM sess_total),
      'median_minutes',(SELECT round((percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60))::numeric,1) FROM sess_total),
      'p95_minutes',(SELECT round((percentile_cont(.95) WITHIN GROUP(ORDER BY extract(epoch FROM(last_at-first_at))/60))::numeric,1) FROM sess_total),
      'avg_actions',(SELECT round(avg(actions)::numeric,1) FROM sess_total),
      'multi_module_pct',(SELECT round((100.0*count(*) FILTER(WHERE modules>=2)/NULLIF(count(*),0))::numeric,1) FROM sess_total),
      'power_sessions',(SELECT count(*) FROM sess_total WHERE actions>=10)
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


-- Activate the new baseline immediately; rows before this timestamp remain stored but are excluded from new metrics.
SELECT public.verix2_reset_all_periods();
