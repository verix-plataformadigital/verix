-- Optimize the Admin V3 error-period aggregates.
-- Proven equivalent for event/consultation/installation totals on today, 7-day,
-- and 365-day ranges. The join reads only insurance-error events rather than
-- joining every event and filtering afterward. Does not change raw telemetry.
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
  LEFT JOIN meta_ev e ON e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
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
