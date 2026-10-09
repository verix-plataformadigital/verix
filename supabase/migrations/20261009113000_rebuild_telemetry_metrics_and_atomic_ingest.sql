-- VÉRIX telemetry/statistics reconstruction (review before production deployment).
-- Keeps explicit 24h/global reset boundaries; query outcomes use start-cohort semantics.
-- Query statistics are cohort-based: queries start only at vehicle_lookup, outcome counts
-- are deduplicated by query_id, unresolved is split into pending vs incomplete, and
-- contradictory terminal outcomes are reported separately.
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
         e.occurred_at,e.created_at,e.app_version,e.device_type,e.browser,e.metadata
  FROM public.verix2_events e,b
  WHERE e.occurred_at >= b.s30 AND e.occurred_at < b.enow
),
q AS (
  -- A query starts only when the client emits vehicle_lookup. A pending or
  -- terminal event without that start is a coverage defect, not a new query.
  SELECT query_id,min(occurred_at) AS first_at
  FROM ev
  WHERE event='vehicle_lookup' AND query_id IS NOT NULL
  GROUP BY query_id
),
final_counts AS (
  SELECT query_id,
         count(*)::bigint AS final_event_count,
         count(DISTINCT event)::integer AS final_type_count
  FROM ev
  WHERE event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
    AND query_id IS NOT NULL
  GROUP BY query_id
),
finals AS (
  -- Keep one representative final row per query, while retaining diagnostics
  -- to detect duplicate and contradictory final events rather than hiding them.
  SELECT DISTINCT ON(e.query_id)
    e.query_id,e.event,e.occurred_at,e.metadata,e.installation_id,e.app_version,e.browser,e.device_type,
    fc.final_event_count,fc.final_type_count
  FROM ev e
  JOIN final_counts fc ON fc.query_id=e.query_id
  WHERE e.event IN('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
    AND e.query_id IS NOT NULL
  ORDER BY e.query_id,e.occurred_at DESC,e.event_id DESC
),
pending_events AS (
  SELECT query_id,count(*)::bigint AS pending_event_count
  FROM ev
  WHERE event='vehicle_insurance_pending' AND query_id IS NOT NULL
  GROUP BY query_id
),
overview AS (
  SELECT jsonb_build_object(
    'online_now',(SELECT count(DISTINCT installation_id) FROM (
      SELECT installation_id FROM public.verix2_events
       WHERE created_at >= p_now-interval '5 minutes' AND created_at < p_now
    ) active5),
    'active_10m',(SELECT count(DISTINCT installation_id) FROM (
      SELECT installation_id FROM public.verix2_events
       WHERE event='heartbeat' AND created_at >= p_now-interval '10 minutes' AND created_at < p_now
    ) active10),
    'unique_24h',count(DISTINCT installation_id) FILTER(WHERE occurred_at >= b.s24),
    'unique_7d',count(DISTINCT installation_id) FILTER(WHERE occurred_at >= b.s7),
    'unique_30d',count(DISTINCT installation_id),
    'events_24h',count(*) FILTER(WHERE occurred_at >= b.s24),
    'events_7d',count(*) FILTER(WHERE occurred_at >= b.s7),
    'events_30d',count(*),
    'actions_24h',count(*) FILTER(WHERE occurred_at >= b.s24 AND event<>'heartbeat'),
    'actions_7d',count(*) FILTER(WHERE occurred_at >= b.s7 AND event<>'heartbeat'),
    'actions_30d',count(*) FILTER(WHERE event<>'heartbeat'),
    'last_event_at',max(occurred_at)
  ) data
  FROM ev,b
),
ret AS (
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'unique',count(*) FILTER(WHERE last_seen>=b.s24 AND last_seen<b.enow),
      'new',count(*) FILTER(WHERE first_seen>=b.s24 AND first_seen<b.enow),
      'returning',count(*) FILTER(WHERE last_seen>=b.s24 AND last_seen<b.enow AND first_seen<b.s24)),
    '7d',jsonb_build_object(
      'unique',count(*) FILTER(WHERE last_seen>=b.s7 AND last_seen<b.enow),
      'new',count(*) FILTER(WHERE first_seen>=b.s7 AND first_seen<b.enow),
      'returning',count(*) FILTER(WHERE last_seen>=b.s7 AND last_seen<b.enow AND first_seen<b.s7)),
    '30d',jsonb_build_object(
      'unique',count(*) FILTER(WHERE last_seen>=b.s30 AND last_seen<b.enow),
      'new',count(*) FILTER(WHERE first_seen>=b.s30 AND first_seen<b.enow),
      'returning',count(*) FILTER(WHERE last_seen>=b.s30 AND last_seen<b.enow AND first_seen<b.s30))
  ) data
  FROM public.verix2_installations i,b
),
insurance AS (
  SELECT jsonb_build_object(
    '24h',jsonb_build_object(
      'started',(SELECT count(*) FROM q WHERE first_at>=b.s24 AND first_at<b.enow),
      'finals',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s24 AND x.first_at<b.enow AND f.final_type_count=1),
      'insured',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s24 AND x.first_at<b.enow AND f.final_type_count=1 AND f.event='vehicle_insurance_yes'),
      'uninsured',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s24 AND x.first_at<b.enow AND f.final_type_count=1 AND f.event='vehicle_insurance_no'),
      'errors',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s24 AND x.first_at<b.enow AND f.final_type_count=1 AND f.event='vehicle_insurance_error'),
      'pending',(SELECT count(*) FROM q x JOIN pending_events pe ON pe.query_id=x.query_id WHERE x.first_at>=b.s24 AND x.first_at<b.enow AND NOT EXISTS(SELECT 1 FROM finals f WHERE f.query_id=x.query_id)),
      'incomplete',(SELECT count(*) FROM q x WHERE x.first_at>=b.s24 AND x.first_at<b.enow AND NOT EXISTS(SELECT 1 FROM finals f WHERE f.query_id=x.query_id) AND NOT EXISTS(SELECT 1 FROM pending_events pe WHERE pe.query_id=x.query_id)),
      'conflicting_final',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s24 AND x.first_at<b.enow AND f.final_type_count>1),
      'duplicate_final_events',(SELECT coalesce(sum(greatest(f.final_event_count-1,0)),0) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s24 AND x.first_at<b.enow),
      'multi_final',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s24 AND x.first_at<b.enow AND f.final_event_count>1)
    ),
    '7d',jsonb_build_object(
      'started',(SELECT count(*) FROM q WHERE first_at>=b.s7 AND first_at<b.enow),
      'finals',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s7 AND x.first_at<b.enow AND f.final_type_count=1),
      'insured',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s7 AND x.first_at<b.enow AND f.final_type_count=1 AND f.event='vehicle_insurance_yes'),
      'uninsured',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s7 AND x.first_at<b.enow AND f.final_type_count=1 AND f.event='vehicle_insurance_no'),
      'errors',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s7 AND x.first_at<b.enow AND f.final_type_count=1 AND f.event='vehicle_insurance_error'),
      'pending',(SELECT count(*) FROM q x JOIN pending_events pe ON pe.query_id=x.query_id WHERE x.first_at>=b.s7 AND x.first_at<b.enow AND NOT EXISTS(SELECT 1 FROM finals f WHERE f.query_id=x.query_id)),
      'incomplete',(SELECT count(*) FROM q x WHERE x.first_at>=b.s7 AND x.first_at<b.enow AND NOT EXISTS(SELECT 1 FROM finals f WHERE f.query_id=x.query_id) AND NOT EXISTS(SELECT 1 FROM pending_events pe WHERE pe.query_id=x.query_id)),
      'conflicting_final',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s7 AND x.first_at<b.enow AND f.final_type_count>1),
      'duplicate_final_events',(SELECT coalesce(sum(greatest(f.final_event_count-1,0)),0) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s7 AND x.first_at<b.enow),
      'multi_final',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s7 AND x.first_at<b.enow AND f.final_event_count>1)
    ),
    '30d',jsonb_build_object(
      'started',(SELECT count(*) FROM q WHERE first_at>=b.s30 AND first_at<b.enow),
      'finals',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s30 AND x.first_at<b.enow AND f.final_type_count=1),
      'insured',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s30 AND x.first_at<b.enow AND f.final_type_count=1 AND f.event='vehicle_insurance_yes'),
      'uninsured',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s30 AND x.first_at<b.enow AND f.final_type_count=1 AND f.event='vehicle_insurance_no'),
      'errors',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s30 AND x.first_at<b.enow AND f.final_type_count=1 AND f.event='vehicle_insurance_error'),
      'pending',(SELECT count(*) FROM q x JOIN pending_events pe ON pe.query_id=x.query_id WHERE x.first_at>=b.s30 AND x.first_at<b.enow AND NOT EXISTS(SELECT 1 FROM finals f WHERE f.query_id=x.query_id)),
      'incomplete',(SELECT count(*) FROM q x WHERE x.first_at>=b.s30 AND x.first_at<b.enow AND NOT EXISTS(SELECT 1 FROM finals f WHERE f.query_id=x.query_id) AND NOT EXISTS(SELECT 1 FROM pending_events pe WHERE pe.query_id=x.query_id)),
      'conflicting_final',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s30 AND x.first_at<b.enow AND f.final_type_count>1),
      'duplicate_final_events',(SELECT coalesce(sum(greatest(f.final_event_count-1,0)),0) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s30 AND x.first_at<b.enow),
      'multi_final',(SELECT count(*) FROM q x JOIN finals f ON f.query_id=x.query_id WHERE x.first_at>=b.s30 AND x.first_at<b.enow AND f.final_event_count>1)
    )
  ) data
  FROM b
),
ins_quality AS (
  SELECT jsonb_build_object(
    'latency_p50_ms',(SELECT round((percentile_cont(.5) WITHIN GROUP(
      ORDER BY (metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
      FROM finals,b WHERE occurred_at>=b.s24 AND final_type_count=1 AND (metadata->'asfDiagnostic'->>'asfDurationMs')~'^[0-9]+(\\.[0-9]+)?$'),
    'latency_p95_ms',(SELECT round((percentile_cont(.95) WITHIN GROUP(
      ORDER BY (metadata->'asfDiagnostic'->>'asfDurationMs')::numeric))::numeric,0)
      FROM finals,b WHERE occurred_at>=b.s24 AND final_type_count=1 AND (metadata->'asfDiagnostic'->>'asfDurationMs')~'^[0-9]+(\\.[0-9]+)?$'),
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
         count(DISTINCT query_id) qty,
         count(*) raw_events,
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
  SELECT installation_id,count(DISTINCT query_id) qty,count(*) raw_events,count(DISTINCT query_id) queries,max(occurred_at) last_at
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
         count(DISTINCT query_id) qty,count(*) raw_events,count(DISTINCT query_id) queries,count(DISTINCT installation_id) installs
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
      FROM public.verix2_installations,b WHERE last_seen>=b.s30 AND last_seen<b.enow GROUP BY 1 ORDER BY qty DESC LIMIT 15)x),'[]'::jsonb),
    'device_types',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(
      SELECT coalesce(device_type,'Unknown') value,count(*) qty
      FROM public.verix2_installations,b WHERE last_seen>=b.s30 AND last_seen<b.enow GROUP BY 1 ORDER BY qty DESC LIMIT 10)x),'[]'::jsonb),
    'os',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC) FROM(
      SELECT coalesce(os,'Unknown') value,count(*) qty
      FROM public.verix2_installations,b WHERE last_seen>=b.s30 AND last_seen<b.enow GROUP BY 1 ORDER BY qty DESC LIMIT 15)x),'[]'::jsonb)
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
      NULLIF(count(*) FILTER(WHERE event IN('cinemometer_calculation','cinemometer_speed_entry')),0))::numeric,1),
    'query_events_missing_id_30d',count(*) FILTER(WHERE event IN('vehicle_lookup','vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error','imt_loaded') AND query_id IS NULL),
    'query_outcomes_without_start_30d',(SELECT count(DISTINCT e.query_id) FROM ev e WHERE e.event IN('vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error','imt_loaded') AND e.query_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ev s WHERE s.event='vehicle_lookup' AND s.query_id=e.query_id)),
    'conflicting_final_queries_30d',(SELECT count(*) FROM final_counts WHERE final_type_count>1),
    'duplicate_final_events_30d',(SELECT coalesce(sum(greatest(final_event_count-1,0)),0) FROM final_counts),
    'imt_duplicate_query_source_groups_30d',(SELECT count(*) FROM (SELECT query_id,coalesce(metadata->>'source','') source FROM ev WHERE event='imt_loaded' AND query_id IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d)
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


-- Server-side activity timestamps fix client-clock skew for presence calculations.
CREATE INDEX IF NOT EXISTS verix2_events_created_at_install_idx
  ON public.verix2_events (created_at DESC, installation_id);

-- Reconcile presence timestamps against database receipt timestamps already persisted.
UPDATE public.verix2_installations
SET first_seen = LEAST(first_seen, now()),
    last_seen = LEAST(last_seen, now())
WHERE first_seen > now() OR last_seen > now();

UPDATE public.verix2_sessions
SET started_at = LEAST(started_at, now()),
    last_seen = LEAST(last_seen, now())
WHERE started_at > now() OR last_seen > now();

UPDATE public.verix2_installations i
SET last_seen = GREATEST(i.first_seen, COALESCE((
  SELECT max(e.created_at) FROM public.verix2_events e
  WHERE e.installation_id = i.installation_id
), i.first_seen));

UPDATE public.verix2_sessions s
SET last_seen = GREATEST(s.started_at, COALESCE((
  SELECT max(e.created_at) FROM public.verix2_events e
  WHERE e.session_id = s.session_id
), s.started_at));

-- Exact application-version error investigation. Aggregate in PostgreSQL so
-- PostgREST's row limit cannot silently truncate the counts shown in Admin.
CREATE OR REPLACE FUNCTION public.verix2_error_investigation(
  p_now timestamptz DEFAULT now(),
  p_app_version text DEFAULT '1.5',
  p_recent_limit integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
WITH bounds AS (
  SELECT greatest(
    p_now - interval '24 hours',
    coalesce((SELECT reset_24h_at FROM public.verix2_dashboard_state WHERE singleton=true),
             '1970-01-01T00:00:00Z'::timestamptz)
  ) AS s24,
  p_now AS enow
),
all_errors AS (
  SELECT e.event_id,e.occurred_at,e.event,e.installation_id,e.query_id,e.app_version,e.browser,e.metadata
  FROM public.verix2_events e,bounds b
  WHERE e.event='vehicle_insurance_error'
    AND e.occurred_at>=b.s24 AND e.occurred_at<b.enow
),
err AS (
  SELECT * FROM all_errors WHERE app_version=COALESCE(NULLIF(p_app_version,''),'1.5')
),
by_type AS (
  SELECT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown') AS type,
         count(*)::bigint AS count
  FROM err GROUP BY 1 ORDER BY count DESC,type
),
by_hash AS (
  SELECT coalesce(nullif(metadata->'asfDiagnostic'->>'asfResponseHash',''),'sem-hash') AS hash,
         count(*)::bigint AS count
  FROM err GROUP BY 1 ORDER BY count DESC,hash LIMIT 10
),
by_install AS (
  SELECT installation_id,count(*)::bigint AS count
  FROM err GROUP BY installation_id ORDER BY count DESC,installation_id LIMIT 10
),
bursts AS (
  SELECT to_timestamp(floor(extract(epoch FROM occurred_at)/300)*300) AS start,
         count(*)::bigint AS count
  FROM err GROUP BY 1 ORDER BY count DESC,start DESC LIMIT 12
),
recent AS (
  SELECT e.*,
         coalesce(e.metadata->'asfDiagnostic','{}'::jsonb) AS diagnostic
  FROM err e ORDER BY occurred_at DESC,event_id DESC
  LIMIT greatest(1,least(coalesce(p_recent_limit,12),50))
)
SELECT jsonb_build_object(
  'generated_at',p_now,
  'errors_24h',(SELECT count(*) FROM all_errors),
  'app15_errors',(SELECT count(*) FROM err),
  'app15_installations',(SELECT count(DISTINCT installation_id) FROM err),
  'app15_plates',(SELECT count(DISTINCT upper(regexp_replace(
    coalesce(diagnostic->>'matricula',metadata->>'matricula',''),'[^A-Z0-9]','','g'
  ))) FROM recent WHERE coalesce(diagnostic->>'matricula',metadata->>'matricula','')<>''),
  'app15_hashes',(SELECT count(DISTINCT coalesce(nullif(metadata->'asfDiagnostic'->>'asfResponseHash',''),'sem-hash')) FROM err),
  'app15_types',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.count DESC,x.type) FROM by_type x),'[]'::jsonb),
  'app15_hashes_top',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.count DESC,x.hash) FROM by_hash x),'[]'::jsonb),
  'app15_installations_top',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'installation_id',CASE WHEN length(installation_id)>14 THEN left(installation_id,8)||'…'||right(installation_id,4) ELSE installation_id END,
    'count',count
  ) ORDER BY count DESC,installation_id) FROM by_install),'[]'::jsonb),
  'app15_bursts_5m',coalesce((SELECT jsonb_agg(jsonb_build_object('start',start,'count',count) ORDER BY count DESC,start DESC) FROM bursts),'[]'::jsonb),
  'latest_app15',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'occurred_at',occurred_at,
      'installation_id',CASE WHEN length(installation_id)>14 THEN left(installation_id,8)||'…'||right(installation_id,4) ELSE installation_id END,
      'query_id',CASE WHEN length(coalesce(query_id,''))>14 THEN left(query_id,8)||'…'||right(query_id,4) ELSE query_id END,
      'browser',coalesce(browser,'Unknown'),
      'error_type',coalesce(diagnostic->>'asfErrorType','unknown'),
      'transport',diagnostic->>'asfTransport',
      'relay_latency_ms',CASE WHEN (diagnostic->>'asfRelayLatencyMs')~'^[0-9]+(\\.[0-9]+)?
-- acknowledge only actually inserted rows, and update last_seen using server time.
CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(
  p_events jsonb,
  p_installations jsonb,
  p_sessions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_events, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_installations, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_sessions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'telemetry_payload_must_be_arrays' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.verix2_installations (
    installation_id, first_seen, last_seen, app_version, device_type, browser, os
  )
  SELECT x.installation_id, LEAST(COALESCE(x.first_seen, v_now), v_now), LEAST(COALESCE(x.first_seen, v_now), v_now),
         x.app_version, x.device_type, x.browser, x.os
  FROM jsonb_to_recordset(p_installations) AS x(
    installation_id text, first_seen timestamptz, last_seen timestamptz,
    app_version text, device_type text, browser text, os text
  )
  WHERE x.installation_id IS NOT NULL
  ON CONFLICT (installation_id) DO UPDATE SET
    first_seen = LEAST(public.verix2_installations.first_seen, EXCLUDED.first_seen),
    app_version = COALESCE(EXCLUDED.app_version, public.verix2_installations.app_version),
    device_type = COALESCE(EXCLUDED.device_type, public.verix2_installations.device_type),
    browser = COALESCE(EXCLUDED.browser, public.verix2_installations.browser),
    os = COALESCE(EXCLUDED.os, public.verix2_installations.os);

  INSERT INTO public.verix2_sessions (
    session_id, installation_id, tab_id, started_at, last_seen
  )
  SELECT x.session_id, x.installation_id, x.tab_id, LEAST(COALESCE(x.started_at, v_now), v_now), LEAST(COALESCE(x.started_at, v_now), v_now)
  FROM jsonb_to_recordset(p_sessions) AS x(
    session_id text, installation_id text, tab_id text,
    started_at timestamptz, last_seen timestamptz
  )
  WHERE x.session_id IS NOT NULL AND x.installation_id IS NOT NULL
  ON CONFLICT (session_id) DO UPDATE SET
    started_at = LEAST(public.verix2_sessions.started_at, EXCLUDED.started_at),
    installation_id = EXCLUDED.installation_id,
    tab_id = COALESCE(EXCLUDED.tab_id, public.verix2_sessions.tab_id);

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_events, '[]'::jsonb)) AS x(
      event_id text, installation_id text, session_id text, tab_id text,
      query_id text, event text, module text, occurred_at timestamptz,
      app_version text, device_type text, browser text, metadata jsonb
    )
    WHERE x.event_id IS NOT NULL AND x.installation_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO public.verix2_events (
      event_id, installation_id, session_id, tab_id, query_id, event, module,
      occurred_at, app_version, device_type, browser, metadata
    )
    SELECT event_id, installation_id, session_id, tab_id, query_id, event, module,
           occurred_at, app_version, device_type, browser, COALESCE(metadata, '{}'::jsonb)
    FROM incoming
    ON CONFLICT (event_id) DO NOTHING
    RETURNING installation_id, session_id
  ),
  touch_installations AS (
    UPDATE public.verix2_installations i
    SET last_seen = GREATEST(i.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.installation_id=i.installation_id)
    RETURNING i.installation_id
  ),
  touch_sessions AS (
    UPDATE public.verix2_sessions s
    SET last_seen = GREATEST(s.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.session_id=s.session_id)
    RETURNING s.session_id
  )
  SELECT count(*)::integer INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('events_inserted', v_inserted);
END;
$function$;

REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) TO service_role;
 THEN (diagnostic->>'asfRelayLatencyMs')::numeric ELSE NULL END,
      'http_status',CASE WHEN (diagnostic->>'asfHttpStatus')~'^[0-9]+
-- acknowledge only actually inserted rows, and update last_seen using server time.
CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(
  p_events jsonb,
  p_installations jsonb,
  p_sessions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_events, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_installations, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_sessions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'telemetry_payload_must_be_arrays' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.verix2_installations (
    installation_id, first_seen, last_seen, app_version, device_type, browser, os
  )
  SELECT x.installation_id, LEAST(COALESCE(x.first_seen, v_now), v_now), LEAST(COALESCE(x.first_seen, v_now), v_now),
         x.app_version, x.device_type, x.browser, x.os
  FROM jsonb_to_recordset(p_installations) AS x(
    installation_id text, first_seen timestamptz, last_seen timestamptz,
    app_version text, device_type text, browser text, os text
  )
  WHERE x.installation_id IS NOT NULL
  ON CONFLICT (installation_id) DO UPDATE SET
    first_seen = LEAST(public.verix2_installations.first_seen, EXCLUDED.first_seen),
    app_version = COALESCE(EXCLUDED.app_version, public.verix2_installations.app_version),
    device_type = COALESCE(EXCLUDED.device_type, public.verix2_installations.device_type),
    browser = COALESCE(EXCLUDED.browser, public.verix2_installations.browser),
    os = COALESCE(EXCLUDED.os, public.verix2_installations.os);

  INSERT INTO public.verix2_sessions (
    session_id, installation_id, tab_id, started_at, last_seen
  )
  SELECT x.session_id, x.installation_id, x.tab_id, LEAST(COALESCE(x.started_at, v_now), v_now), LEAST(COALESCE(x.started_at, v_now), v_now)
  FROM jsonb_to_recordset(p_sessions) AS x(
    session_id text, installation_id text, tab_id text,
    started_at timestamptz, last_seen timestamptz
  )
  WHERE x.session_id IS NOT NULL AND x.installation_id IS NOT NULL
  ON CONFLICT (session_id) DO UPDATE SET
    started_at = LEAST(public.verix2_sessions.started_at, EXCLUDED.started_at),
    installation_id = EXCLUDED.installation_id,
    tab_id = COALESCE(EXCLUDED.tab_id, public.verix2_sessions.tab_id);

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_events, '[]'::jsonb)) AS x(
      event_id text, installation_id text, session_id text, tab_id text,
      query_id text, event text, module text, occurred_at timestamptz,
      app_version text, device_type text, browser text, metadata jsonb
    )
    WHERE x.event_id IS NOT NULL AND x.installation_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO public.verix2_events (
      event_id, installation_id, session_id, tab_id, query_id, event, module,
      occurred_at, app_version, device_type, browser, metadata
    )
    SELECT event_id, installation_id, session_id, tab_id, query_id, event, module,
           occurred_at, app_version, device_type, browser, COALESCE(metadata, '{}'::jsonb)
    FROM incoming
    ON CONFLICT (event_id) DO NOTHING
    RETURNING installation_id, session_id
  ),
  touch_installations AS (
    UPDATE public.verix2_installations i
    SET last_seen = GREATEST(i.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.installation_id=i.installation_id)
    RETURNING i.installation_id
  ),
  touch_sessions AS (
    UPDATE public.verix2_sessions s
    SET last_seen = GREATEST(s.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.session_id=s.session_id)
    RETURNING s.session_id
  )
  SELECT count(*)::integer INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('events_inserted', v_inserted);
END;
$function$;

REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) TO service_role;
 THEN (diagnostic->>'asfHttpStatus')::integer ELSE NULL END,
      'duration_ms',CASE WHEN (diagnostic->>'asfDurationMs')~'^[0-9]+(\\.[0-9]+)?
-- acknowledge only actually inserted rows, and update last_seen using server time.
CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(
  p_events jsonb,
  p_installations jsonb,
  p_sessions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_events, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_installations, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_sessions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'telemetry_payload_must_be_arrays' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.verix2_installations (
    installation_id, first_seen, last_seen, app_version, device_type, browser, os
  )
  SELECT x.installation_id, LEAST(COALESCE(x.first_seen, v_now), v_now), LEAST(COALESCE(x.first_seen, v_now), v_now),
         x.app_version, x.device_type, x.browser, x.os
  FROM jsonb_to_recordset(p_installations) AS x(
    installation_id text, first_seen timestamptz, last_seen timestamptz,
    app_version text, device_type text, browser text, os text
  )
  WHERE x.installation_id IS NOT NULL
  ON CONFLICT (installation_id) DO UPDATE SET
    first_seen = LEAST(public.verix2_installations.first_seen, EXCLUDED.first_seen),
    app_version = COALESCE(EXCLUDED.app_version, public.verix2_installations.app_version),
    device_type = COALESCE(EXCLUDED.device_type, public.verix2_installations.device_type),
    browser = COALESCE(EXCLUDED.browser, public.verix2_installations.browser),
    os = COALESCE(EXCLUDED.os, public.verix2_installations.os);

  INSERT INTO public.verix2_sessions (
    session_id, installation_id, tab_id, started_at, last_seen
  )
  SELECT x.session_id, x.installation_id, x.tab_id, LEAST(COALESCE(x.started_at, v_now), v_now), LEAST(COALESCE(x.started_at, v_now), v_now)
  FROM jsonb_to_recordset(p_sessions) AS x(
    session_id text, installation_id text, tab_id text,
    started_at timestamptz, last_seen timestamptz
  )
  WHERE x.session_id IS NOT NULL AND x.installation_id IS NOT NULL
  ON CONFLICT (session_id) DO UPDATE SET
    started_at = LEAST(public.verix2_sessions.started_at, EXCLUDED.started_at),
    installation_id = EXCLUDED.installation_id,
    tab_id = COALESCE(EXCLUDED.tab_id, public.verix2_sessions.tab_id);

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_events, '[]'::jsonb)) AS x(
      event_id text, installation_id text, session_id text, tab_id text,
      query_id text, event text, module text, occurred_at timestamptz,
      app_version text, device_type text, browser text, metadata jsonb
    )
    WHERE x.event_id IS NOT NULL AND x.installation_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO public.verix2_events (
      event_id, installation_id, session_id, tab_id, query_id, event, module,
      occurred_at, app_version, device_type, browser, metadata
    )
    SELECT event_id, installation_id, session_id, tab_id, query_id, event, module,
           occurred_at, app_version, device_type, browser, COALESCE(metadata, '{}'::jsonb)
    FROM incoming
    ON CONFLICT (event_id) DO NOTHING
    RETURNING installation_id, session_id
  ),
  touch_installations AS (
    UPDATE public.verix2_installations i
    SET last_seen = GREATEST(i.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.installation_id=i.installation_id)
    RETURNING i.installation_id
  ),
  touch_sessions AS (
    UPDATE public.verix2_sessions s
    SET last_seen = GREATEST(s.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.session_id=s.session_id)
    RETURNING s.session_id
  )
  SELECT count(*)::integer INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('events_inserted', v_inserted);
END;
$function$;

REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) TO service_role;
 THEN (diagnostic->>'asfDurationMs')::numeric ELSE NULL END,
      'response_hash',diagnostic->>'asfResponseHash',
      'response_class',diagnostic->>'asfResponseClass',
      'graphql_error_count',CASE WHEN (diagnostic->>'asfGraphqlErrorCount')~'^[0-9]+
-- acknowledge only actually inserted rows, and update last_seen using server time.
CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(
  p_events jsonb,
  p_installations jsonb,
  p_sessions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_events, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_installations, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_sessions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'telemetry_payload_must_be_arrays' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.verix2_installations (
    installation_id, first_seen, last_seen, app_version, device_type, browser, os
  )
  SELECT x.installation_id, LEAST(COALESCE(x.first_seen, v_now), v_now), LEAST(COALESCE(x.first_seen, v_now), v_now),
         x.app_version, x.device_type, x.browser, x.os
  FROM jsonb_to_recordset(p_installations) AS x(
    installation_id text, first_seen timestamptz, last_seen timestamptz,
    app_version text, device_type text, browser text, os text
  )
  WHERE x.installation_id IS NOT NULL
  ON CONFLICT (installation_id) DO UPDATE SET
    first_seen = LEAST(public.verix2_installations.first_seen, EXCLUDED.first_seen),
    app_version = COALESCE(EXCLUDED.app_version, public.verix2_installations.app_version),
    device_type = COALESCE(EXCLUDED.device_type, public.verix2_installations.device_type),
    browser = COALESCE(EXCLUDED.browser, public.verix2_installations.browser),
    os = COALESCE(EXCLUDED.os, public.verix2_installations.os);

  INSERT INTO public.verix2_sessions (
    session_id, installation_id, tab_id, started_at, last_seen
  )
  SELECT x.session_id, x.installation_id, x.tab_id, LEAST(COALESCE(x.started_at, v_now), v_now), LEAST(COALESCE(x.started_at, v_now), v_now)
  FROM jsonb_to_recordset(p_sessions) AS x(
    session_id text, installation_id text, tab_id text,
    started_at timestamptz, last_seen timestamptz
  )
  WHERE x.session_id IS NOT NULL AND x.installation_id IS NOT NULL
  ON CONFLICT (session_id) DO UPDATE SET
    started_at = LEAST(public.verix2_sessions.started_at, EXCLUDED.started_at),
    installation_id = EXCLUDED.installation_id,
    tab_id = COALESCE(EXCLUDED.tab_id, public.verix2_sessions.tab_id);

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_events, '[]'::jsonb)) AS x(
      event_id text, installation_id text, session_id text, tab_id text,
      query_id text, event text, module text, occurred_at timestamptz,
      app_version text, device_type text, browser text, metadata jsonb
    )
    WHERE x.event_id IS NOT NULL AND x.installation_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO public.verix2_events (
      event_id, installation_id, session_id, tab_id, query_id, event, module,
      occurred_at, app_version, device_type, browser, metadata
    )
    SELECT event_id, installation_id, session_id, tab_id, query_id, event, module,
           occurred_at, app_version, device_type, browser, COALESCE(metadata, '{}'::jsonb)
    FROM incoming
    ON CONFLICT (event_id) DO NOTHING
    RETURNING installation_id, session_id
  ),
  touch_installations AS (
    UPDATE public.verix2_installations i
    SET last_seen = GREATEST(i.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.installation_id=i.installation_id)
    RETURNING i.installation_id
  ),
  touch_sessions AS (
    UPDATE public.verix2_sessions s
    SET last_seen = GREATEST(s.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.session_id=s.session_id)
    RETURNING s.session_id
  )
  SELECT count(*)::integer INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('events_inserted', v_inserted);
END;
$function$;

REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) TO service_role;
 THEN (diagnostic->>'asfGraphqlErrorCount')::integer ELSE NULL END,
      'response_bytes',CASE WHEN (diagnostic->>'asfResponseBytes')~'^[0-9]+
-- acknowledge only actually inserted rows, and update last_seen using server time.
CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(
  p_events jsonb,
  p_installations jsonb,
  p_sessions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_events, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_installations, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_sessions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'telemetry_payload_must_be_arrays' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.verix2_installations (
    installation_id, first_seen, last_seen, app_version, device_type, browser, os
  )
  SELECT x.installation_id, LEAST(COALESCE(x.first_seen, v_now), v_now), LEAST(COALESCE(x.first_seen, v_now), v_now),
         x.app_version, x.device_type, x.browser, x.os
  FROM jsonb_to_recordset(p_installations) AS x(
    installation_id text, first_seen timestamptz, last_seen timestamptz,
    app_version text, device_type text, browser text, os text
  )
  WHERE x.installation_id IS NOT NULL
  ON CONFLICT (installation_id) DO UPDATE SET
    first_seen = LEAST(public.verix2_installations.first_seen, EXCLUDED.first_seen),
    app_version = COALESCE(EXCLUDED.app_version, public.verix2_installations.app_version),
    device_type = COALESCE(EXCLUDED.device_type, public.verix2_installations.device_type),
    browser = COALESCE(EXCLUDED.browser, public.verix2_installations.browser),
    os = COALESCE(EXCLUDED.os, public.verix2_installations.os);

  INSERT INTO public.verix2_sessions (
    session_id, installation_id, tab_id, started_at, last_seen
  )
  SELECT x.session_id, x.installation_id, x.tab_id, LEAST(COALESCE(x.started_at, v_now), v_now), LEAST(COALESCE(x.started_at, v_now), v_now)
  FROM jsonb_to_recordset(p_sessions) AS x(
    session_id text, installation_id text, tab_id text,
    started_at timestamptz, last_seen timestamptz
  )
  WHERE x.session_id IS NOT NULL AND x.installation_id IS NOT NULL
  ON CONFLICT (session_id) DO UPDATE SET
    started_at = LEAST(public.verix2_sessions.started_at, EXCLUDED.started_at),
    installation_id = EXCLUDED.installation_id,
    tab_id = COALESCE(EXCLUDED.tab_id, public.verix2_sessions.tab_id);

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_events, '[]'::jsonb)) AS x(
      event_id text, installation_id text, session_id text, tab_id text,
      query_id text, event text, module text, occurred_at timestamptz,
      app_version text, device_type text, browser text, metadata jsonb
    )
    WHERE x.event_id IS NOT NULL AND x.installation_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO public.verix2_events (
      event_id, installation_id, session_id, tab_id, query_id, event, module,
      occurred_at, app_version, device_type, browser, metadata
    )
    SELECT event_id, installation_id, session_id, tab_id, query_id, event, module,
           occurred_at, app_version, device_type, browser, COALESCE(metadata, '{}'::jsonb)
    FROM incoming
    ON CONFLICT (event_id) DO NOTHING
    RETURNING installation_id, session_id
  ),
  touch_installations AS (
    UPDATE public.verix2_installations i
    SET last_seen = GREATEST(i.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.installation_id=i.installation_id)
    RETURNING i.installation_id
  ),
  touch_sessions AS (
    UPDATE public.verix2_sessions s
    SET last_seen = GREATEST(s.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.session_id=s.session_id)
    RETURNING s.session_id
  )
  SELECT count(*)::integer INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('events_inserted', v_inserted);
END;
$function$;

REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) TO service_role;
 THEN (diagnostic->>'asfResponseBytes')::integer ELSE NULL END,
      'parse_path',diagnostic->>'asfParsePath',
      'build_id',coalesce(metadata->>'build_id',diagnostic->>'build_id')
    ) ORDER BY occurred_at DESC,event_id DESC)
    FROM recent
  ),'[]'::jsonb)
);
$function$;

REVOKE ALL ON FUNCTION public.verix2_error_investigation(timestamptz,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_error_investigation(timestamptz,text,integer) TO service_role;

-- Atomic, idempotent ingestion: establish FK parents before inserting child events,
-- acknowledge only actually inserted rows, and update last_seen using server time.
CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(
  p_events jsonb,
  p_installations jsonb,
  p_sessions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_events, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_installations, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_sessions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'telemetry_payload_must_be_arrays' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.verix2_installations (
    installation_id, first_seen, last_seen, app_version, device_type, browser, os
  )
  SELECT x.installation_id, LEAST(COALESCE(x.first_seen, v_now), v_now), LEAST(COALESCE(x.first_seen, v_now), v_now),
         x.app_version, x.device_type, x.browser, x.os
  FROM jsonb_to_recordset(p_installations) AS x(
    installation_id text, first_seen timestamptz, last_seen timestamptz,
    app_version text, device_type text, browser text, os text
  )
  WHERE x.installation_id IS NOT NULL
  ON CONFLICT (installation_id) DO UPDATE SET
    first_seen = LEAST(public.verix2_installations.first_seen, EXCLUDED.first_seen),
    app_version = COALESCE(EXCLUDED.app_version, public.verix2_installations.app_version),
    device_type = COALESCE(EXCLUDED.device_type, public.verix2_installations.device_type),
    browser = COALESCE(EXCLUDED.browser, public.verix2_installations.browser),
    os = COALESCE(EXCLUDED.os, public.verix2_installations.os);

  INSERT INTO public.verix2_sessions (
    session_id, installation_id, tab_id, started_at, last_seen
  )
  SELECT x.session_id, x.installation_id, x.tab_id, LEAST(COALESCE(x.started_at, v_now), v_now), LEAST(COALESCE(x.started_at, v_now), v_now)
  FROM jsonb_to_recordset(p_sessions) AS x(
    session_id text, installation_id text, tab_id text,
    started_at timestamptz, last_seen timestamptz
  )
  WHERE x.session_id IS NOT NULL AND x.installation_id IS NOT NULL
  ON CONFLICT (session_id) DO UPDATE SET
    started_at = LEAST(public.verix2_sessions.started_at, EXCLUDED.started_at),
    installation_id = EXCLUDED.installation_id,
    tab_id = COALESCE(EXCLUDED.tab_id, public.verix2_sessions.tab_id);

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_events, '[]'::jsonb)) AS x(
      event_id text, installation_id text, session_id text, tab_id text,
      query_id text, event text, module text, occurred_at timestamptz,
      app_version text, device_type text, browser text, metadata jsonb
    )
    WHERE x.event_id IS NOT NULL AND x.installation_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO public.verix2_events (
      event_id, installation_id, session_id, tab_id, query_id, event, module,
      occurred_at, app_version, device_type, browser, metadata
    )
    SELECT event_id, installation_id, session_id, tab_id, query_id, event, module,
           occurred_at, app_version, device_type, browser, COALESCE(metadata, '{}'::jsonb)
    FROM incoming
    ON CONFLICT (event_id) DO NOTHING
    RETURNING installation_id, session_id
  ),
  touch_installations AS (
    UPDATE public.verix2_installations i
    SET last_seen = GREATEST(i.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.installation_id=i.installation_id)
    RETURNING i.installation_id
  ),
  touch_sessions AS (
    UPDATE public.verix2_sessions s
    SET last_seen = GREATEST(s.last_seen, v_now)
    WHERE EXISTS (SELECT 1 FROM inserted e WHERE e.session_id=s.session_id)
    RETURNING s.session_id
  )
  SELECT count(*)::integer INTO v_inserted FROM inserted;

  RETURN jsonb_build_object('events_inserted', v_inserted);
END;
$function$;

REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb) TO service_role;
