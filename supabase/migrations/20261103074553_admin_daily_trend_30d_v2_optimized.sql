CREATE OR REPLACE FUNCTION public.verix2_admin_daily_trend_30d_v2(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '32MB'
SET statement_timeout TO '20s'
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
activity_by_install_day AS MATERIALIZED (
  SELECT activity.report_day, activity.installation_id
  FROM (
    SELECT
      (e.occurred_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
      e.installation_id
    FROM public.verix2_events e
    CROSS JOIN bounds b
    WHERE e.occurred_at >= b.start_at
      AND e.occurred_at < b.end_at
      AND e.installation_id IS NOT NULL
      AND e.event IN (
        'vehicle_lookup', 'vehicle_insurance_yes', 'vehicle_insurance_no',
        'imt_loaded', 'module_open', 'history_open', 'history_reopen',
        'external_tool_open', 'alcohol_lookup', 'cinemometer_operation_start',
        'cinemometer_speed_entry', 'cinemometer_calculation',
        'cinemometer_copy_code', 'cinemometer_copy_text',
        'cinemometer_copy_location', 'cinemometer_profile_select',
        'cinemometer_profile_new', 'cinemometer_profile_duplicate',
        'cinemometer_profile_delete', 'cinemometer_profile_save',
        'legislation_category_open', 'legislation_search', 'legislation_copy',
        'legislation_favorite_toggle'
      )

    UNION ALL

    SELECT
      (e.occurred_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
      e.installation_id
    FROM public.verix2_events e
    CROSS JOIN bounds b
    WHERE e.event = 'vehicle_insurance_error'
      AND e.installation_id IS NOT NULL
      AND e.occurred_at >= b.start_at
      AND e.occurred_at < b.end_at
      AND NOT EXISTS (
        SELECT 1
        FROM public.verix2_admin_error_stats_exclusions x
        WHERE x.event_id = e.event_id
      )
  ) AS activity
  GROUP BY activity.report_day, activity.installation_id
),
active_by_day AS (
  SELECT report_day, count(*)::bigint AS active_installations
  FROM activity_by_install_day
  GROUP BY report_day
),
active_overall AS (
  SELECT count(DISTINCT installation_id)::bigint AS unique_installations
  FROM activity_by_install_day
),
active_since_asf_start AS (
  SELECT count(DISTINCT installation_id)::bigint AS unique_installations
  FROM activity_by_install_day
  WHERE report_day >= DATE '2026-10-09'
),
all_lookup_query_ids AS MATERIALIZED (
  SELECT e.query_id
  FROM public.verix2_events e
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL
),
lookup_events AS MATERIALIZED (
  SELECT e.occurred_at, e.query_id
  FROM public.verix2_events e
  CROSS JOIN bounds b
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL
    AND e.occurred_at >= b.start_at
    AND e.occurred_at < b.end_at
),
query_start_candidates AS (
  SELECT occurred_at, query_id
  FROM lookup_events

  UNION ALL

  SELECT min(p.occurred_at) AS occurred_at, p.query_id
  FROM public.verix2_events p
  CROSS JOIN bounds b
  WHERE p.event = 'vehicle_insurance_pending'
    AND p.query_id IS NOT NULL
    AND p.occurred_at >= b.start_at
    AND p.occurred_at < b.end_at
    AND NOT EXISTS (
      SELECT 1
      FROM all_lookup_query_ids l
      WHERE l.query_id = p.query_id
    )
  GROUP BY p.query_id
),
consultations_by_day AS (
  SELECT
    (started_at AT TIME ZONE 'Europe/Lisbon')::date AS report_day,
    count(*)::bigint AS consultations
  FROM (
    SELECT occurred_at AS started_at, query_id
    FROM query_start_candidates
  ) q
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
      SELECT 1
      FROM public.verix2_admin_error_stats_exclusions x
      WHERE x.event_id = e.event_id
    )
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
$function$
