-- Extend the daily Admin trend with ASF results from 09/10/2026 only.
-- The operational ASF engine and telemetry ingestion are not modified.
CREATE OR REPLACE FUNCTION public.verix2_admin_daily_trend_30d(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET work_mem TO '16MB'
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
),
classified_errors AS MATERIALIZED (
  SELECT
    e.*,
    (
      e.error_type = 'http_400'
      AND e.status_for_classification = '400'
      AND e.has_plate_input
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
