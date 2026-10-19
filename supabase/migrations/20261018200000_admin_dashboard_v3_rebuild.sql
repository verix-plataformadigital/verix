-- VÉRIX Admin V3: efficient metrics, a 365-day history window, and a 24-hour operational plate registry.
-- This migration does not delete or rewrite existing event or plate rows.
-- Existing no-record rows keep their current expires_at; new rows use the 24-hour default.
-- Scheduled event cleanup is extended to 365 days so the requested history remains available.

CREATE TABLE IF NOT EXISTS public.verix2_admin_v3_cache (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  refreshed_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

ALTER TABLE public.verix2_admin_v3_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verix2_admin_v3_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.verix2_admin_v3_cache TO service_role;

ALTER TABLE public.verix_insurance_no_cases
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

CREATE OR REPLACE FUNCTION public.verix2_cleanup_old_data(
  p_before timestamptz DEFAULT (now() - interval '365 days')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_catalog
AS $function$
DECLARE
  deleted_events bigint := 0;
  deleted_rate_limits bigint := 0;
BEGIN
  -- Preserve all raw telemetry rows. The Admin's initial "Histórico Total"
  -- reports a rolling 365-day window, but this maintenance function must not
  -- destroy older events or overwrite historical data.
  DELETE FROM public.verix2_rate_limits WHERE window_started < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_rate_limits = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'before', p_before,
    'deleted_events', deleted_events,
    'deleted_rate_limits', deleted_rate_limits
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.verix2_admin_dashboard_v3_compute(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_catalog
SET work_mem TO '32MB'
AS $function$
WITH b AS (
  SELECT
    (date_trunc('day', p_now AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon') AS today_start,
    p_now - interval '7 days' AS week_start,
    p_now - interval '365 days' AS total_start,
    p_now AS report_end
),
periods AS (
  SELECT 'today'::text AS period, today_start AS start_at, report_end AS end_at FROM b
  UNION ALL
  SELECT 'week', week_start, report_end FROM b
  UNION ALL
  SELECT 'total', total_start, report_end FROM b
),
ev AS MATERIALIZED (
  -- Keep the hot path narrow: large client/forensics JSON belongs only in the
  -- small error/copy subsets below, not in every activity row.
  SELECT
    e.event_id, e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
),
meta_ev AS MATERIALIZED (
  SELECT
    e.event_id, e.installation_id, e.query_id, e.event,
    e.occurred_at, e.metadata
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
    AND e.event IN ('vehicle_insurance_error', 'legislation_copy')
),
action_events AS MATERIALIZED (
  SELECT installation_id, occurred_at
  FROM ev
  WHERE installation_id IS NOT NULL
    AND event IN (
      'vehicle_lookup', 'vehicle_insurance_yes', 'vehicle_insurance_no',
      'vehicle_insurance_error', 'imt_loaded', 'module_open',
      'history_open', 'history_reopen', 'external_tool_open', 'alcohol_lookup',
      'cinemometer_operation_start', 'cinemometer_speed_entry',
      'cinemometer_calculation', 'cinemometer_copy_code',
      'cinemometer_copy_text', 'cinemometer_copy_location',
      'cinemometer_profile_select', 'cinemometer_profile_new',
      'cinemometer_profile_duplicate', 'cinemometer_profile_delete',
      'cinemometer_profile_save', 'legislation_category_open',
      'legislation_search', 'legislation_copy', 'legislation_favorite_toggle'
    )
),
query_starts AS (
  SELECT e.query_id, min(e.occurred_at) AS started_at
  FROM ev e
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL
  GROUP BY e.query_id
),
query_finals AS (
  SELECT
    e.query_id,
    count(*) AS final_count,
    count(DISTINCT e.event) AS final_type_count,
    min(e.event) AS single_final_event,
    min(e.occurred_at) AS first_final_at
  FROM ev e
  JOIN query_starts q ON q.query_id = e.query_id
  WHERE e.event IN ('vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error')
    AND e.occurred_at >= q.started_at
  GROUP BY e.query_id
),
query_pending AS (
  SELECT e.query_id, max(e.occurred_at) AS pending_at
  FROM ev e
  JOIN query_starts q ON q.query_id = e.query_id
  WHERE e.event = 'vehicle_insurance_pending'
    AND e.occurred_at >= q.started_at
  GROUP BY e.query_id
),
query_quality AS (
  SELECT
    q.query_id,
    q.started_at,
    CASE
      WHEN f.final_count = 1 THEN 'valid'
      WHEN coalesce(f.final_count, 0) > 1 AND coalesce(f.final_type_count, 0) > 1 THEN 'contradictory'
      WHEN coalesce(f.final_count, 0) > 1 THEN 'duplicate_finals'
      WHEN p.pending_at >= (SELECT report_end FROM b) - interval '10 minutes' THEN 'pending'
      ELSE 'incomplete'
    END AS outcome_state,
    CASE WHEN f.final_count = 1 THEN f.single_final_event ELSE NULL END AS final_event
  FROM query_starts q
  LEFT JOIN query_finals f ON f.query_id = q.query_id
  LEFT JOIN query_pending p ON p.query_id = q.query_id
),
insurance_rows AS (
  SELECT
    p.period,
    count(q.query_id) AS consultations_started,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid') AS finals,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.final_event = 'vehicle_insurance_yes') AS insured,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.final_event = 'vehicle_insurance_no') AS uninsured,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.final_event = 'vehicle_insurance_error') AS errors,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'pending') AS pending,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'incomplete') AS incomplete,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'contradictory') AS contradictory,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'duplicate_finals') AS duplicate_finals
  FROM periods p
  LEFT JOIN query_quality q ON q.started_at >= p.start_at AND q.started_at < p.end_at
  GROUP BY p.period
),
error_event_rows AS (
  SELECT
    p.period,
    count(e.event_id) FILTER (WHERE e.event = 'vehicle_insurance_error') AS events,
    count(DISTINCT e.query_id) FILTER (WHERE e.event = 'vehicle_insurance_error' AND e.query_id IS NOT NULL) AS consultations,
    count(DISTINCT e.installation_id) FILTER (WHERE e.event = 'vehicle_insurance_error' AND e.installation_id IS NOT NULL) AS installations
  FROM periods p
  LEFT JOIN ev e ON e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
  GROUP BY p.period
),
user_rows AS (
  SELECT
    p.period,
    count(DISTINCT a.installation_id) AS active_installations
  FROM periods p
  LEFT JOIN action_events a ON a.occurred_at >= p.start_at AND a.occurred_at < p.end_at
  GROUP BY p.period
),
active_last_3m AS (
  SELECT
    count(DISTINCT e.installation_id) AS active_installations,
    count(DISTINCT e.query_id) FILTER (WHERE e.query_id IS NOT NULL) AS consultations
  FROM ev e
  CROSS JOIN b
  WHERE e.event = 'vehicle_lookup'
    AND e.installation_id IS NOT NULL
    AND e.occurred_at >= b.report_end - interval '3 minutes'
    AND e.occurred_at < b.report_end
),
hour_rows AS (
  SELECT
    extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Lisbon')::integer AS hour_num,
    count(DISTINCT e.query_id) FILTER (WHERE e.event = 'vehicle_lookup' AND e.query_id IS NOT NULL) AS consultations,
    count(DISTINCT e.installation_id) FILTER (
      WHERE e.event IN (
        'vehicle_lookup', 'vehicle_insurance_yes', 'vehicle_insurance_no',
        'vehicle_insurance_error', 'imt_loaded', 'module_open',
        'history_open', 'history_reopen', 'external_tool_open', 'alcohol_lookup',
        'cinemometer_operation_start', 'cinemometer_speed_entry',
        'cinemometer_calculation', 'cinemometer_copy_code',
        'cinemometer_copy_text', 'cinemometer_copy_location',
        'cinemometer_profile_select', 'cinemometer_profile_new',
        'cinemometer_profile_duplicate', 'cinemometer_profile_delete',
        'cinemometer_profile_save', 'legislation_category_open',
        'legislation_search', 'legislation_copy', 'legislation_favorite_toggle'
      )
    ) AS active_users
  FROM ev e
  CROSS JOIN b
  WHERE e.occurred_at >= b.today_start
    AND e.occurred_at < b.report_end
  GROUP BY 1
),
hourly AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'hour', lpad(gs.hour_num::text, 2, '0'),
      'hourNumber', gs.hour_num,
      'consultations', coalesce(h.consultations, 0),
      'activeUsers', coalesce(h.active_users, 0)
    ) ORDER BY gs.hour_num
  ) AS data
  FROM generate_series(0, 23) AS gs(hour_num)
  LEFT JOIN hour_rows h ON h.hour_num = gs.hour_num
),
legislation_rows AS (
  SELECT
    p.period,
    count(e.event_id) AS copies,
    count(DISTINCT e.installation_id) FILTER (WHERE e.installation_id IS NOT NULL) AS users
  FROM periods p
  LEFT JOIN meta_ev e ON e.event = 'legislation_copy'
    AND e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
  GROUP BY p.period
),
legislation_items AS (
  SELECT
    p.period,
    coalesce(
      nullif(btrim(e.metadata->>'itemLabel'), ''),
      nullif(btrim(e.metadata->>'itemId'), ''),
      '(iteme sem identificação)'
    ) AS item_label,
    coalesce(nullif(btrim(e.metadata->>'itemId'), ''), '') AS item_id,
    coalesce(nullif(btrim(e.metadata->>'copyType'), ''), 'desconhecido') AS copy_type,
    count(*) AS copies,
    count(DISTINCT e.installation_id) FILTER (WHERE e.installation_id IS NOT NULL) AS users,
    row_number() OVER (
      PARTITION BY p.period
      ORDER BY count(*) DESC, coalesce(nullif(btrim(e.metadata->>'itemLabel'), ''), nullif(btrim(e.metadata->>'itemId'), ''), '(iteme sem identificação)')
    ) AS rank
  FROM periods p
  JOIN ev e ON e.event = 'legislation_copy'
    AND e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
  GROUP BY p.period, item_label, item_id, copy_type
),
legislation_json_rows AS (
  SELECT
    l.period, l.copies, l.users,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'label', i.item_label,
        'itemId', i.item_id,
        'copyType', i.copy_type,
        'copies', i.copies,
        'users', i.users
      ) ORDER BY i.rank)
      FROM legislation_items i
      WHERE i.period = l.period AND i.rank <= 10
    ), '[]'::jsonb) AS top_items
  FROM legislation_rows l
),
error_type_groups AS (
  SELECT
    p.period,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfErrorType', ''),
      nullif(e.metadata->>'asfErrorType', ''),
      nullif(e.metadata->>'errorType', ''),
      'unknown'
    ) AS error_type,
    count(*) AS events,
    count(DISTINCT e.query_id) FILTER (WHERE e.query_id IS NOT NULL) AS consultations
  FROM periods p
  JOIN meta_ev e ON e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
  GROUP BY p.period, error_type
),
error_type_ranked AS (
  SELECT *, row_number() OVER (PARTITION BY period ORDER BY events DESC, error_type) AS rank
  FROM error_type_groups
),
error_types_json AS (
  SELECT
    p.period,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'type', r.error_type,
        'events', r.events,
        'consultations', r.consultations
      ) ORDER BY r.rank)
      FROM error_type_ranked r
      WHERE r.period = p.period AND r.rank <= 8
    ), '[]'::jsonb) AS top_types
  FROM periods p
)
SELECT jsonb_build_object(
  'generatedAt', (SELECT report_end FROM b),
  'timezone', 'Europe/Lisbon',
  'historyDays', 365,
  'ranges', jsonb_build_object(
    'today', jsonb_build_object('start', (SELECT today_start FROM b), 'end', (SELECT report_end FROM b)),
    'week', jsonb_build_object('start', (SELECT week_start FROM b), 'end', (SELECT report_end FROM b)),
    'total', jsonb_build_object('start', (SELECT total_start FROM b), 'end', (SELECT report_end FROM b))
  ),
  'insurance', (
    SELECT jsonb_object_agg(i.period, jsonb_build_object(
      'consultations', i.consultations_started,
      'finals', i.finals,
      'insured', i.insured,
      'uninsured', i.uninsured,
      'uninsuredPct', CASE WHEN i.insured + i.uninsured > 0 THEN round(100.0 * i.uninsured / (i.insured + i.uninsured), 1) ELSE NULL END,
      'errors', i.errors,
      'errorPct', CASE WHEN i.finals > 0 THEN round(100.0 * i.errors / i.finals, 1) ELSE NULL END,
      'errorEvents', coalesce(er.events, 0),
      'pending', i.pending,
      'incomplete', i.incomplete,
      'contradictory', i.contradictory,
      'duplicateFinals', i.duplicate_finals
    ))
    FROM insurance_rows i
    LEFT JOIN error_event_rows er ON er.period = i.period
  ),
  'users', jsonb_build_object(
    'consultationsLast3Minutes', (SELECT consultations FROM active_last_3m),
    'activeInstallationsLast3Minutes', (SELECT active_installations FROM active_last_3m),
    'periods', (SELECT jsonb_object_agg(period, jsonb_build_object('activeInstallations', active_installations)) FROM user_rows)
  ),
  'hourly', (SELECT data FROM hourly),
  'legislation', (
    SELECT jsonb_object_agg(period, jsonb_build_object(
      'copies', copies,
      'users', users,
      'topItems', top_items
    ))
    FROM legislation_json_rows
  ),
  'errors', (
    SELECT jsonb_object_agg(
      p.period,
      jsonb_build_object(
        'events', coalesce(er.events, 0),
        'consultations', coalesce(er.consultations, 0),
        'installations', coalesce(er.installations, 0),
        'topTypes', coalesce(et.top_types, '[]'::jsonb)
      )
    )
    FROM periods p
    LEFT JOIN error_event_rows er ON er.period = p.period
    LEFT JOIN error_types_json et ON et.period = p.period
  )
);
$function$;

CREATE OR REPLACE FUNCTION public.verix2_admin_dashboard_v3(
  p_now timestamptz DEFAULT now(),
  p_force_refresh boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_catalog
SET work_mem TO '32MB'
AS $function$
DECLARE
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_refreshed_at timestamptz;
  v_payload jsonb;
  v_has_cache boolean := false;
  v_lock_key bigint := hashtextextended('verix2_admin_dashboard_v3_shared_cache', 0);
  v_is_live boolean;
BEGIN
  v_is_live := abs(extract(epoch FROM (v_now - clock_timestamp()))) <= 10;

  IF NOT v_is_live THEN
    RETURN public.verix2_admin_dashboard_v3_compute(v_now);
  END IF;

  SELECT c.refreshed_at, c.payload
    INTO v_refreshed_at, v_payload
  FROM public.verix2_admin_v3_cache c
  WHERE c.singleton = true;
  v_has_cache := FOUND;

  IF v_has_cache
     AND NOT coalesce(p_force_refresh, false)
     AND v_refreshed_at >= clock_timestamp() - interval '6 minutes' THEN
    RETURN v_payload;
  END IF;

  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    IF v_has_cache AND v_payload IS NOT NULL THEN
      RETURN v_payload;
    END IF;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END IF;

  SELECT c.refreshed_at, c.payload
    INTO v_refreshed_at, v_payload
  FROM public.verix2_admin_v3_cache c
  WHERE c.singleton = true;
  v_has_cache := FOUND;

  IF v_has_cache
     AND NOT coalesce(p_force_refresh, false)
     AND v_refreshed_at >= clock_timestamp() - interval '6 minutes' THEN
    RETURN v_payload;
  END IF;

  v_payload := public.verix2_admin_dashboard_v3_compute(v_now);

  INSERT INTO public.verix2_admin_v3_cache(singleton, refreshed_at, payload)
  VALUES (true, clock_timestamp(), v_payload)
  ON CONFLICT (singleton) DO UPDATE
    SET refreshed_at = EXCLUDED.refreshed_at,
        payload = EXCLUDED.payload;

  RETURN v_payload;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verix2_admin_live_activity_v3(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_catalog
AS $function$
SELECT jsonb_build_object(
  'consultations',
  count(DISTINCT e.query_id) FILTER (WHERE e.query_id IS NOT NULL),
  'activeInstallations',
  count(DISTINCT e.installation_id) FILTER (WHERE e.installation_id IS NOT NULL)
)
FROM public.verix2_events e
WHERE e.event = 'vehicle_lookup'
  AND e.query_id IS NOT NULL
  AND e.occurred_at >= p_now - interval '3 minutes'
  AND e.occurred_at <= p_now + interval '30 seconds';
$function$;

CREATE OR REPLACE FUNCTION public.verix2_admin_error_ledger_v3(
  p_period text DEFAULT 'today',
  p_now timestamptz DEFAULT now(),
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_catalog
SET work_mem TO '16MB'
AS $function$
WITH b AS (
  SELECT
    CASE
      WHEN p_period = 'today' THEN date_trunc('day', p_now AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon'
      WHEN p_period = 'week' THEN p_now - interval '7 days'
      ELSE p_now - interval '365 days'
    END AS start_at,
    p_now AS end_at,
    greatest(1, least(coalesce(p_limit, 50), 200)) AS safe_limit,
    greatest(0, least(coalesce(p_offset, 0), 1000000)) AS safe_offset
),
filtered AS MATERIALIZED (
  SELECT
    e.event_id, e.query_id, e.installation_id, e.occurred_at, e.app_version,
    e.browser, e.device_type, e.metadata,
    coalesce(
      nullif(btrim(e.metadata->>'matriculaCapturada'), ''),
      nullif(btrim(e.metadata->>'matriculaNormalizada'), ''),
      nullif(btrim(e.metadata->>'matricula'), ''),
      nullif(btrim(e.metadata->'asfDiagnostic'->>'matricula'), ''),
      'Não capturada'
    ) AS plate,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfErrorType', ''),
      nullif(e.metadata->>'asfErrorType', ''),
      nullif(e.metadata->>'errorType', ''),
      'unknown'
    ) AS error_type,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfMessage', ''),
      nullif(e.metadata->>'asfUserMessage', ''),
      nullif(e.metadata->'asfDiagnostic'->>'asfNetworkError', ''),
      nullif(e.metadata->'asfDiagnostic'->>'asfStatusText', ''),
      'A versão cliente não registou uma causa textual específica.'
    ) AS cause,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfTransport', ''),
      nullif(e.metadata->>'transport', ''),
      'não registado'
    ) AS transport,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfHttpStatus', ''),
      nullif(e.metadata->>'httpStatus', '')
    ) AS http_status_raw,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfDurationMs', ''),
      nullif(e.metadata->>'durationMs', '')
    ) AS duration_raw,
    coalesce(
      nullif(e.metadata->>'asfRelayLatencyMs', ''),
      nullif(e.metadata->'asfDiagnostic'->>'asfRelayLatencyMs', '')
    ) AS relay_latency_raw,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfResponseHash', ''),
      nullif(e.metadata->>'responseHash', '')
    ) AS response_hash,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfBuildId', ''),
      nullif(e.metadata->>'build_id', '')
    ) AS build_id,
    coalesce(e.metadata->'asfDiagnostic'->'asfAttempts', e.metadata->'attempts', '[]'::jsonb) AS attempts,
    coalesce(e.metadata->'asfDiagnostic'->'asfGraphqlMessages', e.metadata->'graphqlMessages', '[]'::jsonb) AS graphql_messages,
    coalesce(e.metadata->'asfDiagnostic'->'asfClientContext', e.metadata->'clientContext', '{}'::jsonb) AS client_context,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfNetworkError', ''),
      nullif(e.metadata->>'networkError', '')
    ) AS network_error,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfQueueWaitMs', ''),
      nullif(e.metadata->>'queueWaitMs', '')
    ) AS queue_wait_raw
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.start_at
    AND e.occurred_at < b.end_at
),
counts AS (
  SELECT
    count(*) AS total_events,
    count(DISTINCT query_id) FILTER (WHERE query_id IS NOT NULL) AS unique_consultations,
    count(DISTINCT installation_id) FILTER (WHERE installation_id IS NOT NULL) AS installations
  FROM filtered
),
page AS (
  SELECT f.*
  FROM filtered f
  ORDER BY f.occurred_at DESC, f.event_id DESC
  LIMIT (SELECT safe_limit FROM b)
  OFFSET (SELECT safe_offset FROM b)
)
SELECT jsonb_build_object(
  'period', CASE WHEN p_period IN ('today','week','total') THEN p_period ELSE 'total' END,
  'generatedAt', p_now,
  'totalEvents', c.total_events,
  'uniqueConsultations', c.unique_consultations,
  'installations', c.installations,
  'limit', b.safe_limit,
  'offset', b.safe_offset,
  'hasMore', b.safe_offset + b.safe_limit < c.total_events,
  'items', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'eventId', f.event_id,
      'queryId', f.query_id,
      'installationId', f.installation_id,
      'occurredAt', f.occurred_at,
      'plate', f.plate,
      'errorType', f.error_type,
      'cause', f.cause,
      'transport', f.transport,
      'httpStatus', CASE WHEN f.http_status_raw ~ '^[0-9]{3}$' THEN f.http_status_raw::integer ELSE NULL END,
      'durationMs', CASE WHEN f.duration_raw ~ '^[0-9]+([.][0-9]+)?$' THEN f.duration_raw::numeric ELSE NULL END,
      'relayLatencyMs', CASE WHEN f.relay_latency_raw ~ '^[0-9]+([.][0-9]+)?$' THEN f.relay_latency_raw::numeric ELSE NULL END,
      'queueWaitMs', CASE WHEN f.queue_wait_raw ~ '^[0-9]+([.][0-9]+)?$' THEN f.queue_wait_raw::numeric ELSE NULL END,
      'responseHash', f.response_hash,
      'buildId', f.build_id,
      'appVersion', f.app_version,
      'browser', f.browser,
      'deviceType', f.device_type,
      'attempts', CASE WHEN jsonb_typeof(f.attempts) = 'array' THEN f.attempts ELSE '[]'::jsonb END,
      'graphqlMessages', CASE WHEN jsonb_typeof(f.graphql_messages) = 'array' THEN f.graphql_messages ELSE '[]'::jsonb END,
      'clientContext', CASE WHEN jsonb_typeof(f.client_context) = 'object' THEN f.client_context ELSE '{}'::jsonb END,
      'networkError', f.network_error
    ) ORDER BY f.occurred_at DESC, f.event_id DESC)
    FROM page f
  ), '[]'::jsonb)
)
FROM b CROSS JOIN counts c;
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_dashboard_v3_compute(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verix2_admin_dashboard_v3(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verix2_admin_error_ledger_v3(text, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verix2_admin_live_activity_v3(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_dashboard_v3_compute(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.verix2_admin_dashboard_v3(timestamptz, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.verix2_admin_error_ledger_v3(text, timestamptz, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.verix2_admin_live_activity_v3(timestamptz) TO service_role;

-- Replace the expensive forced refresh with the compact V3 cache refresher.
-- The job identity and existing telemetry rows are preserved.
DO $block$
DECLARE
  r record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR r IN
      SELECT jobid
      FROM cron.job
      WHERE command ILIKE '%verix2_admin_dashboard_cached%'
    LOOP
      PERFORM cron.alter_job(
        job_id := r.jobid,
        schedule := '*/5 * * * *',
        command := 'SELECT public.verix2_admin_dashboard_v3(now(), true);'
      );
    END LOOP;
  END IF;
END;
$block$;
