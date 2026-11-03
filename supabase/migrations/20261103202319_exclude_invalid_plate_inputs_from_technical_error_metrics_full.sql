-- Keep malformed plate input separate from technical ASF failures in every Admin metric.
-- This migration changes analytics classification only; ASF and IMT request paths are untouched.

CREATE OR REPLACE FUNCTION public.verix2_admin_dashboard_v3_compute(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET work_mem TO '64MB'
AS $function$
WITH b AS (
  SELECT
    (date_trunc('day', p_now AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon') AS today_start,
    p_now - interval '7 days' AS week_start,
    coalesce(
      (SELECT reset_all_at FROM public.verix2_admin_dashboard_cache WHERE singleton = true),
      p_now - interval '365 days'
    ) AS total_start,
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
  -- Use equality predicates per event so PostgreSQL can range-scan the existing
  -- covering partial index. A broad IN-list with a runtime time bound selected
  -- occurred_at_idx, reading more than 400k heap rows to retain about 133k.
  -- Insurance errors remain a separate small scan so exclusions are checked
  -- only for that subset.
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'vehicle_lookup'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'vehicle_insurance_pending'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'vehicle_insurance_yes'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'vehicle_insurance_no'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'imt_loaded'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'module_open'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'history_open'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'history_reopen'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'external_tool_open'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'alcohol_lookup'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_operation_start'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_speed_entry'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_calculation'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_copy_code'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_copy_text'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_copy_location'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_profile_select'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_profile_new'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_profile_duplicate'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_profile_delete'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'cinemometer_profile_save'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'legislation_category_open'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'legislation_search'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'legislation_copy'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'legislation_favorite_toggle'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
  UNION ALL
  SELECT e.installation_id, e.query_id, e.event, e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
    AND NOT EXISTS (
      SELECT 1
      FROM public.verix2_admin_error_stats_exclusions x
      WHERE x.event_id = e.event_id
    )
),
meta_ev AS MATERIALIZED (
  SELECT
    e.event_id, e.installation_id, e.query_id, e.event,
    e.occurred_at, e.metadata
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
    AND NOT (
      e.event = 'vehicle_insurance_error'
      AND EXISTS (
        SELECT 1 FROM public.verix2_admin_error_stats_exclusions x
        WHERE x.event_id = e.event_id
      )
    )
    AND e.event IN ('vehicle_insurance_error', 'legislation_copy')
),
error_candidate_rows AS MATERIALIZED (
  SELECT
    e.event_id, e.query_id, e.installation_id, e.occurred_at,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfErrorType', ''),
      nullif(e.metadata->>'asfErrorType', ''),
      nullif(e.metadata->>'errorType', ''),
      'unknown'
    ) AS error_type,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfHttpStatus', ''),
      nullif(e.metadata->>'httpStatus', '')
    ) AS http_status_raw,
    EXISTS (
      SELECT 1
      FROM (VALUES
        (e.metadata->>'matriculaCapturada'),
        (e.metadata->'asfDiagnostic'->>'matricula'),
        (e.metadata->>'matriculaNormalizada'),
        (e.metadata->>'matricula')
      ) AS plate_candidate(value)
      WHERE public.verix2_admin_plate_format_valid(plate_candidate.value)
    ) AS has_valid_plate_format,
    EXISTS (
      SELECT 1
      FROM (VALUES
        (e.metadata->>'matriculaCapturada'),
        (e.metadata->'asfDiagnostic'->>'matricula'),
        (e.metadata->>'matriculaNormalizada'),
        (e.metadata->>'matricula')
      ) AS plate_candidate(value)
      WHERE regexp_replace(upper(coalesce(plate_candidate.value, '')), '[^A-Z0-9]', '', 'g') <> ''
    ) AS has_plate_input
  FROM meta_ev e
  WHERE e.event = 'vehicle_insurance_error'
),
error_classified AS MATERIALIZED (
  SELECT c.*,
    (
      c.has_plate_input
      AND NOT c.has_valid_plate_format
    ) AS user_input_invalid
  FROM error_candidate_rows c
),
error_input_by_query AS (
  SELECT query_id, bool_or(user_input_invalid) AS user_input_invalid
  FROM error_classified
  WHERE query_id IS NOT NULL
  GROUP BY query_id
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
query_start_candidates AS (
  SELECT e.query_id, e.occurred_at AS started_at
  FROM ev e
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL

  UNION ALL

  -- Legacy telemetry has a small set of pending/outcome IDs with no stored
  -- vehicle_lookup event. Recover these only when a lookup does not exist
  -- anywhere in the retained event history; the ingest guard prevents new
  -- orphan outcomes. This avoids dropping completed legacy consultations.
  SELECT e.query_id, min(e.occurred_at) AS started_at
  FROM ev e
  WHERE e.event = 'vehicle_insurance_pending'
    AND e.query_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.verix2_events l
      WHERE l.query_id = e.query_id
        AND l.event = 'vehicle_lookup'
    )
  GROUP BY e.query_id
),
query_starts AS (
  SELECT query_id, min(started_at) AS started_at
  FROM query_start_candidates
  GROUP BY query_id
),
query_finals AS (
  SELECT
    e.query_id,
    count(*) AS final_count,
    count(DISTINCT e.event) AS final_type_count,
    min(e.event) AS single_final_event
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
    CASE WHEN f.final_count = 1 THEN f.single_final_event ELSE NULL END AS final_event,
    CASE
      WHEN f.final_count = 1 AND f.single_final_event = 'vehicle_insurance_error'
        THEN coalesce(eq.user_input_invalid, false)
      ELSE false
    END AS user_input_invalid
  FROM query_starts q
  LEFT JOIN query_finals f ON f.query_id = q.query_id
  LEFT JOIN query_pending p ON p.query_id = q.query_id
  LEFT JOIN error_input_by_query eq ON eq.query_id = q.query_id
),
insurance_rows AS (
  SELECT
    p.period,
    count(q.query_id) AS consultations_started,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid') AS finals,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.final_event = 'vehicle_insurance_yes') AS insured,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.final_event = 'vehicle_insurance_no') AS uninsured,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.final_event = 'vehicle_insurance_error' AND NOT q.user_input_invalid) AS errors,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.user_input_invalid) AS user_input_invalid,
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
    count(e.event_id) FILTER (WHERE NOT e.user_input_invalid) AS events,
    count(DISTINCT e.query_id) FILTER (WHERE NOT e.user_input_invalid AND e.query_id IS NOT NULL) AS consultations,
    count(DISTINCT e.installation_id) FILTER (WHERE NOT e.user_input_invalid AND e.installation_id IS NOT NULL) AS installations,
    count(e.event_id) FILTER (WHERE e.user_input_invalid) AS user_input_invalid_events,
    count(DISTINCT e.query_id) FILTER (WHERE e.user_input_invalid AND e.query_id IS NOT NULL) AS user_input_invalid_consultations
  FROM periods p
  LEFT JOIN error_classified e ON e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
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
  JOIN meta_ev e ON e.event = 'legislation_copy'
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
    AND NOT EXISTS (
      SELECT 1 FROM error_classified ec
      WHERE ec.event_id = e.event_id AND ec.user_input_invalid
    )
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
      'userInputInvalid', i.user_input_invalid,
      'errorPct', CASE WHEN i.finals - i.user_input_invalid > 0 THEN round(100.0 * i.errors / (i.finals - i.user_input_invalid), 1) ELSE NULL END,
      'errorEvents', coalesce(er.events, 0),
      'userInputInvalidEvents', coalesce(er.user_input_invalid_events, 0),
      'userInputInvalidConsultations', coalesce(er.user_input_invalid_consultations, 0),
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
        'userInputInvalidEvents', coalesce(er.user_input_invalid_events, 0),
        'userInputInvalidConsultations', coalesce(er.user_input_invalid_consultations, 0),
        'topTypes', coalesce(et.top_types, '[]'::jsonb)
      )
    )
    FROM periods p
    LEFT JOIN error_event_rows er ON er.period = p.period
    LEFT JOIN error_types_json et ON et.period = p.period
  )
);
$function$;

CREATE OR REPLACE FUNCTION public.verix2_admin_daily_trend_30d(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET work_mem TO '16MB'
 SET statement_timeout TO '14s'
AS $function$
WITH local_dates AS (
  SELECT
    ((p_now AT TIME ZONE 'Europe/Lisbon')::date - 29) AS first_day,
    (p_now AT TIME ZONE 'Europe/Lisbon')::date AS last_day,
    p_now AS report_end
),
bounds AS (
  SELECT
    first_day,
    last_day,
    (first_day::timestamp AT TIME ZONE 'Europe/Lisbon') AS start_at,
    report_end AS end_at,
    GREATEST(
      (first_day::timestamp AT TIME ZONE 'Europe/Lisbon'),
      ('2026-10-09 00:00:00'::timestamp AT TIME ZONE 'Europe/Lisbon')
    ) AS asf_start_at
  FROM local_dates
),
days AS (
  SELECT generate_series(first_day, last_day, interval '1 day')::date AS report_day
  FROM local_dates
),
base AS MATERIALIZED (
  SELECT
    (e.occurred_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
    e.installation_id,
    e.query_id,
    e.event,
    e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.occurred_at >= b.start_at
    AND e.occurred_at < b.end_at
    AND e.event <> 'vehicle_insurance_error'
    AND e.event IN (
      'vehicle_lookup', 'vehicle_insurance_pending',
      'vehicle_insurance_yes', 'vehicle_insurance_no',
      'vehicle_insurance_error', 'imt_loaded', 'module_open',
      'history_open', 'history_reopen', 'external_tool_open',
      'alcohol_lookup', 'cinemometer_operation_start',
      'cinemometer_speed_entry', 'cinemometer_calculation',
      'cinemometer_copy_code', 'cinemometer_copy_text',
      'cinemometer_copy_location', 'cinemometer_profile_select',
      'cinemometer_profile_new', 'cinemometer_profile_duplicate',
      'cinemometer_profile_delete', 'cinemometer_profile_save',
      'legislation_category_open', 'legislation_search',
      'legislation_copy', 'legislation_favorite_toggle'
    )
  UNION ALL
  SELECT
    (e.occurred_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
    e.installation_id,
    e.query_id,
    e.event,
    e.occurred_at
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.start_at
    AND e.occurred_at < b.end_at
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_admin_error_stats_exclusions x
      WHERE x.event_id = e.event_id
    )
),
action_events AS MATERIALIZED (
  SELECT report_day, installation_id, occurred_at, event
  FROM base
  WHERE installation_id IS NOT NULL
    AND event IN (
      'vehicle_lookup', 'vehicle_insurance_yes', 'vehicle_insurance_no',
      'vehicle_insurance_error', 'imt_loaded', 'module_open',
      'history_open', 'history_reopen', 'external_tool_open',
      'alcohol_lookup', 'cinemometer_operation_start',
      'cinemometer_speed_entry', 'cinemometer_calculation',
      'cinemometer_copy_code', 'cinemometer_copy_text',
      'cinemometer_copy_location', 'cinemometer_profile_select',
      'cinemometer_profile_new', 'cinemometer_profile_duplicate',
      'cinemometer_profile_delete', 'cinemometer_profile_save',
      'legislation_category_open', 'legislation_search',
      'legislation_copy', 'legislation_favorite_toggle'
    )
),
active_by_day AS (
  SELECT report_day, count(DISTINCT installation_id)::bigint AS active_installations
  FROM action_events
  GROUP BY report_day
),
active_overall AS (
  SELECT count(DISTINCT installation_id)::bigint AS unique_installations
  FROM action_events
),
active_since_asf_start AS (
  SELECT count(DISTINCT installation_id)::bigint AS unique_installations
  FROM action_events
  WHERE report_day >= DATE '2026-10-09'
),
query_start_candidates AS (
  SELECT occurred_at, query_id
  FROM base
  WHERE event = 'vehicle_lookup'
    AND query_id IS NOT NULL

  UNION ALL

  SELECT min(e.occurred_at) AS occurred_at, e.query_id
  FROM base e
  WHERE e.event = 'vehicle_insurance_pending'
    AND e.query_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.verix2_events l
      WHERE l.query_id = e.query_id
        AND l.event = 'vehicle_lookup'
    )
  GROUP BY e.query_id
),
query_starts AS (
  SELECT query_id, min(occurred_at) AS started_at
  FROM query_start_candidates
  GROUP BY query_id
),
consultations_by_day AS (
  SELECT (started_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
         count(*)::bigint AS consultations
  FROM query_starts
  GROUP BY 1
),
uninsured_by_day AS (
  SELECT
    (e.occurred_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
    count(DISTINCT e.query_id)::bigint AS uninsured_detections
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_insurance_no'
    AND e.query_id IS NOT NULL
    AND e.occurred_at >= b.asf_start_at
    AND e.occurred_at < b.end_at
  GROUP BY 1
),
error_candidates AS MATERIALIZED (
  SELECT
    (e.occurred_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
    e.query_id,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfErrorType', ''),
      nullif(e.metadata->>'asfErrorType', ''),
      nullif(e.metadata->>'errorType', ''),
      'unknown'
    ) AS error_type,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfHttpStatus', ''),
      nullif(e.metadata->>'httpStatus', '')
    ) AS status_for_classification,
    EXISTS (
      SELECT 1
      FROM (VALUES
        (e.metadata->>'matriculaCapturada'),
        (e.metadata->'asfDiagnostic'->>'matricula'),
        (e.metadata->>'matriculaNormalizada'),
        (e.metadata->>'matricula')
      ) AS plate_candidate(value)
      WHERE public.verix2_admin_plate_format_valid(plate_candidate.value)
    ) AS has_valid_plate_format,
    EXISTS (
      SELECT 1
      FROM (VALUES
        (e.metadata->>'matriculaCapturada'),
        (e.metadata->'asfDiagnostic'->>'matricula'),
        (e.metadata->>'matriculaNormalizada'),
        (e.metadata->>'matricula')
      ) AS plate_candidate(value)
      WHERE regexp_replace(upper(coalesce(plate_candidate.value, '')), '[^A-Z0-9]', '', 'g') <> ''
    ) AS has_plate_input
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.asf_start_at
    AND e.occurred_at < b.end_at
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_admin_error_stats_exclusions x
      WHERE x.event_id = e.event_id
    )
),
classified_errors AS MATERIALIZED (
  SELECT
    e.*,
    (
      e.has_plate_input
      AND NOT e.has_valid_plate_format
    ) AS user_input_invalid
  FROM error_candidates e
),
technical_errors_by_day AS (
  SELECT report_day, count(DISTINCT query_id)::bigint AS technical_error_queries
  FROM classified_errors
  WHERE NOT user_input_invalid
    AND query_id IS NOT NULL
  GROUP BY report_day
)
SELECT jsonb_build_object(
  'generatedAt', p_now,
  'firstDay', to_char(first_day, 'YYYY-MM-DD'),
  'lastDay', to_char(last_day, 'YYYY-MM-DD'),
  'insuranceMetricsStartDay', '2026-10-09',
  'uniqueInstallations30d', (SELECT unique_installations FROM active_overall),
  'uniqueInstallationsSinceASFStart', (SELECT unique_installations FROM active_since_asf_start),
  'days', (
    SELECT jsonb_agg(
      jsonb_build_object(
        'day', to_char(d.report_day, 'YYYY-MM-DD'),
        'activeInstallations', coalesce(a.active_installations, 0),
        'consultations', coalesce(c.consultations, 0),
        'uninsuredDetections', CASE
          WHEN d.report_day < DATE '2026-10-09' THEN NULL
          ELSE coalesce(u.uninsured_detections, 0)
        END,
        'technicalErrorQueries', CASE
          WHEN d.report_day < DATE '2026-10-09' THEN NULL
          ELSE coalesce(t.technical_error_queries, 0)
        END
      )
      ORDER BY d.report_day
    )
    FROM days d
    LEFT JOIN active_by_day a ON a.report_day = d.report_day
    LEFT JOIN consultations_by_day c ON c.report_day = d.report_day
    LEFT JOIN uninsured_by_day u ON u.report_day = d.report_day
    LEFT JOIN technical_errors_by_day t ON t.report_day = d.report_day
  )
)
FROM local_dates;
$function$;

CREATE OR REPLACE FUNCTION public.verix2_admin_insurance_delta_v1(p_since timestamp with time zone, p_now timestamp with time zone, p_today_start timestamp with time zone, p_week_start timestamp with time zone, p_total_start timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET work_mem TO '16MB'
 SET statement_timeout TO '14s'
AS $function$
WITH bounds AS (
  SELECT
    coalesce(p_since, coalesce(p_now, clock_timestamp()) - interval '6 minutes') AS cutoff,
    coalesce(p_now, clock_timestamp()) AS now_at,
    coalesce(
      p_today_start,
      date_trunc('day', coalesce(p_now, clock_timestamp()) AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon'
    ) AS today_start,
    coalesce(p_week_start, coalesce(p_now, clock_timestamp()) - interval '7 days') AS week_start,
    coalesce(p_total_start, coalesce(p_now, clock_timestamp()) - interval '365 days') AS total_start
),
periods AS (
  SELECT 'today'::text AS period, today_start AS start_at, now_at AS end_at FROM bounds
  UNION ALL
  SELECT 'week', week_start, now_at FROM bounds
  UNION ALL
  SELECT 'total', total_start, now_at FROM bounds
),
earliest_period AS (
  SELECT least(today_start, week_start, total_start) AS start_at FROM bounds
),
candidate_ids AS MATERIALIZED (
  SELECT DISTINCT e.query_id
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.query_id IS NOT NULL
    AND e.event IN (
      'vehicle_lookup', 'vehicle_insurance_pending',
      'vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error'
    )
    AND e.occurred_at >= b.cutoff
    AND e.occurred_at < b.now_at
),
event_scope AS MATERIALIZED (
  SELECT e.event_id, e.query_id, e.event, e.occurred_at, e.metadata
  FROM public.verix2_events e
  JOIN candidate_ids c ON c.query_id = e.query_id
  CROSS JOIN bounds b
  CROSS JOIN earliest_period ep
  WHERE e.occurred_at >= ep.start_at
    AND e.occurred_at < b.now_at
    AND NOT (
      e.event = 'vehicle_insurance_error'
      AND EXISTS (
        SELECT 1 FROM public.verix2_admin_error_stats_exclusions x
        WHERE x.event_id = e.event_id
      )
    )
    AND e.event IN (
      'vehicle_lookup', 'vehicle_insurance_pending',
      'vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error'
    )
),
invalid_inputs_by_query AS MATERIALIZED (
  SELECT
    e.query_id,
    bool_or(
      EXISTS (
        SELECT 1
        FROM (VALUES
          (e.metadata->>'matriculaCapturada'),
          (e.metadata->'asfDiagnostic'->>'matricula'),
          (e.metadata->>'matriculaNormalizada'),
          (e.metadata->>'matricula')
        ) AS plate_candidate(value)
        WHERE regexp_replace(upper(coalesce(plate_candidate.value, '')), '[^A-Z0-9]', '', 'g') <> ''
      )
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES
          (e.metadata->>'matriculaCapturada'),
          (e.metadata->'asfDiagnostic'->>'matricula'),
          (e.metadata->>'matriculaNormalizada'),
          (e.metadata->>'matricula')
        ) AS plate_candidate(value)
        WHERE public.verix2_admin_plate_format_valid(plate_candidate.value)
      )
    ) AS user_input_invalid
  FROM event_scope e
  WHERE e.event = 'vehicle_insurance_error'
  GROUP BY e.query_id
),
start_before AS (
  SELECT e.query_id, min(e.occurred_at) AS started_at
  FROM event_scope e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_lookup'
    AND e.occurred_at < b.cutoff
  GROUP BY e.query_id
),
finals_before AS (
  SELECT e.query_id,
    count(*)::bigint AS final_count,
    count(DISTINCT e.event)::bigint AS final_type_count,
    min(e.event) AS single_final_event
  FROM event_scope e
  JOIN start_before s ON s.query_id = e.query_id
  CROSS JOIN bounds b
  WHERE e.event IN ('vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error')
    AND e.occurred_at >= s.started_at
    AND e.occurred_at < b.cutoff
  GROUP BY e.query_id
),
pending_before AS (
  SELECT e.query_id, max(e.occurred_at) AS pending_at
  FROM event_scope e
  JOIN start_before s ON s.query_id = e.query_id
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_insurance_pending'
    AND e.occurred_at >= s.started_at
    AND e.occurred_at < b.cutoff
  GROUP BY e.query_id
),
state_before AS (
  SELECT
    s.query_id,
    s.started_at,
    CASE
      WHEN coalesce(f.final_count, 0) = 1 THEN 'valid'
      WHEN coalesce(f.final_count, 0) > 1 AND coalesce(f.final_type_count, 0) > 1 THEN 'contradictory'
      WHEN coalesce(f.final_count, 0) > 1 THEN 'duplicate_finals'
      WHEN p.pending_at >= b.cutoff - interval '10 minutes' THEN 'pending'
      ELSE 'incomplete'
    END AS outcome_state,
    CASE WHEN f.final_count = 1 THEN f.single_final_event ELSE NULL END AS final_event,
    coalesce(iiq.user_input_invalid, false) AS user_input_invalid
  FROM start_before s
  CROSS JOIN bounds b
  LEFT JOIN finals_before f ON f.query_id = s.query_id
  LEFT JOIN pending_before p ON p.query_id = s.query_id
  LEFT JOIN invalid_inputs_by_query iiq ON iiq.query_id = s.query_id
),
start_now AS (
  SELECT e.query_id, min(e.occurred_at) AS started_at
  FROM event_scope e
  WHERE e.event = 'vehicle_lookup'
  GROUP BY e.query_id
),
finals_now AS (
  SELECT e.query_id,
    count(*)::bigint AS final_count,
    count(DISTINCT e.event)::bigint AS final_type_count,
    min(e.event) AS single_final_event
  FROM event_scope e
  JOIN start_now s ON s.query_id = e.query_id
  WHERE e.event IN ('vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error')
    AND e.occurred_at >= s.started_at
  GROUP BY e.query_id
),
pending_now AS (
  SELECT e.query_id, max(e.occurred_at) AS pending_at
  FROM event_scope e
  JOIN start_now s ON s.query_id = e.query_id
  WHERE e.event = 'vehicle_insurance_pending'
    AND e.occurred_at >= s.started_at
  GROUP BY e.query_id
),
state_now AS (
  SELECT
    s.query_id,
    s.started_at,
    CASE
      WHEN coalesce(f.final_count, 0) = 1 THEN 'valid'
      WHEN coalesce(f.final_count, 0) > 1 AND coalesce(f.final_type_count, 0) > 1 THEN 'contradictory'
      WHEN coalesce(f.final_count, 0) > 1 THEN 'duplicate_finals'
      WHEN p.pending_at >= b.now_at - interval '10 minutes' THEN 'pending'
      ELSE 'incomplete'
    END AS outcome_state,
    CASE WHEN f.final_count = 1 THEN f.single_final_event ELSE NULL END AS final_event,
    coalesce(iiq.user_input_invalid, false) AS user_input_invalid
  FROM start_now s
  CROSS JOIN bounds b
  LEFT JOIN finals_now f ON f.query_id = s.query_id
  LEFT JOIN pending_now p ON p.query_id = s.query_id
  LEFT JOIN invalid_inputs_by_query iiq ON iiq.query_id = s.query_id
),
query_deltas AS (
  SELECT
    p.period,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at THEN 1 ELSE 0 END)
    ), 0)::bigint AS consultations,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'valid' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'valid' THEN 1 ELSE 0 END)
    ), 0)::bigint AS finals,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'valid' AND n.final_event = 'vehicle_insurance_yes' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'valid' AND old.final_event = 'vehicle_insurance_yes' THEN 1 ELSE 0 END)
    ), 0)::bigint AS insured,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'valid' AND n.final_event = 'vehicle_insurance_no' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'valid' AND old.final_event = 'vehicle_insurance_no' THEN 1 ELSE 0 END)
    ), 0)::bigint AS uninsured,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'valid' AND n.final_event = 'vehicle_insurance_error' AND NOT n.user_input_invalid THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'valid' AND old.final_event = 'vehicle_insurance_error' AND NOT old.user_input_invalid THEN 1 ELSE 0 END)
    ), 0)::bigint AS errors,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'valid' AND n.final_event = 'vehicle_insurance_error' AND n.user_input_invalid THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'valid' AND old.final_event = 'vehicle_insurance_error' AND old.user_input_invalid THEN 1 ELSE 0 END)
    ), 0)::bigint AS user_input_invalid,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'pending' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'pending' THEN 1 ELSE 0 END)
    ), 0)::bigint AS pending,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'incomplete' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'incomplete' THEN 1 ELSE 0 END)
    ), 0)::bigint AS incomplete,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'contradictory' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'contradictory' THEN 1 ELSE 0 END)
    ), 0)::bigint AS contradictory,
    coalesce(sum(
      (CASE WHEN n.started_at >= p.start_at AND n.started_at < p.end_at AND n.outcome_state = 'duplicate_finals' THEN 1 ELSE 0 END) -
      (CASE WHEN old.started_at >= p.start_at AND old.started_at < p.end_at AND old.outcome_state = 'duplicate_finals' THEN 1 ELSE 0 END)
    ), 0)::bigint AS duplicate_finals
  FROM periods p
  CROSS JOIN state_now n
  LEFT JOIN state_before old ON old.query_id = n.query_id
  GROUP BY p.period
),
raw_error_candidates AS MATERIALIZED (
  SELECT
    e.event_id,
    e.query_id,
    e.occurred_at,
    EXISTS (
      SELECT 1
      FROM (VALUES
        (e.metadata->>'matriculaCapturada'),
        (e.metadata->'asfDiagnostic'->>'matricula'),
        (e.metadata->>'matriculaNormalizada'),
        (e.metadata->>'matricula')
      ) AS plate_candidate(value)
      WHERE public.verix2_admin_plate_format_valid(plate_candidate.value)
    ) AS has_valid_plate_format,
    EXISTS (
      SELECT 1
      FROM (VALUES
        (e.metadata->>'matriculaCapturada'),
        (e.metadata->'asfDiagnostic'->>'matricula'),
        (e.metadata->>'matriculaNormalizada'),
        (e.metadata->>'matricula')
      ) AS plate_candidate(value)
      WHERE regexp_replace(upper(coalesce(plate_candidate.value, '')), '[^A-Z0-9]', '', 'g') <> ''
    ) AS has_plate_input
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= b.cutoff
    AND e.occurred_at < b.now_at
    AND NOT EXISTS (
      SELECT 1 FROM public.verix2_admin_error_stats_exclusions x
      WHERE x.event_id = e.event_id
    )
),
raw_error_deltas AS (
  SELECT
    p.period,
    count(e.event_id) FILTER (
      WHERE NOT (e.has_plate_input AND NOT e.has_valid_plate_format)
    )::bigint AS error_events,
    count(e.event_id) FILTER (
      WHERE e.has_plate_input AND NOT e.has_valid_plate_format
    )::bigint AS user_input_invalid_events
  FROM periods p
  CROSS JOIN bounds b
  LEFT JOIN raw_error_candidates e
    ON e.occurred_at >= b.cutoff
   AND e.occurred_at < b.now_at
   AND e.occurred_at >= p.start_at
   AND e.occurred_at < p.end_at
  GROUP BY p.period
),
period_results AS (
  SELECT
    p.period,
    coalesce(q.consultations, 0)::bigint AS consultations,
    coalesce(q.finals, 0)::bigint AS finals,
    coalesce(q.insured, 0)::bigint AS insured,
    coalesce(q.uninsured, 0)::bigint AS uninsured,
    coalesce(q.errors, 0)::bigint AS errors,
    coalesce(q.user_input_invalid, 0)::bigint AS userInputInvalid,
    coalesce(e.error_events, 0)::bigint AS errorEvents,
    coalesce(e.user_input_invalid_events, 0)::bigint AS userInputInvalidEvents,
    coalesce(q.pending, 0)::bigint AS pending,
    coalesce(q.incomplete, 0)::bigint AS incomplete,
    coalesce(q.contradictory, 0)::bigint AS contradictory,
    coalesce(q.duplicate_finals, 0)::bigint AS duplicateFinals
  FROM periods p
  LEFT JOIN query_deltas q ON q.period = p.period
  LEFT JOIN raw_error_deltas e ON e.period = p.period
)
SELECT jsonb_build_object(
  'cutoff', b.cutoff,
  'generatedAt', b.now_at,
  'periods', (SELECT jsonb_object_agg(period, jsonb_build_object(
    'consultations', consultations,
    'finals', finals,
    'insured', insured,
    'uninsured', uninsured,
    'errors', errors,
    'userInputInvalid', userInputInvalid,
    'errorEvents', errorEvents,
    'userInputInvalidEvents', userInputInvalidEvents,
    'pending', pending,
    'incomplete', incomplete,
    'contradictory', contradictory,
    'duplicateFinals', duplicateFinals
  )) FROM period_results)
)
FROM bounds b;
$function$;


DO $admin_refresh_job$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO STRICT v_job_id
  FROM cron.job
  WHERE jobname = 'verix2_admin_dashboard_cache_refresh';

  PERFORM cron.alter_job(
    job_id := v_job_id,
    command := 'SELECT public.verix2_admin_dashboard_v3(now(), true);'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = v_job_id
      AND active
      AND command = 'SELECT public.verix2_admin_dashboard_v3(now(), true);'
  ) THEN
    RAISE EXCEPTION 'Dashboard cache refresh schedule did not activate force_refresh=true';
  END IF;
END
$admin_refresh_job$;

-- Rebuild both snapshots immediately using the corrected classification.
SELECT public.verix2_admin_dashboard_v3(now(), true);
SELECT public.verix2_admin_daily_trend_cache_refresh_v1(now());
