-- Daily error-category view: return today's aggregate from the existing 30-day table.
CREATE OR REPLACE FUNCTION public.verix_daily_metrics_30d_read()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
WITH state AS (
  SELECT collecting_since, error_types_since
  FROM public.verix_daily_metrics_state
  WHERE singleton = true
),
bounds AS (
  SELECT
    (clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date AS today,
    collecting_since,
    (collecting_since AT TIME ZONE 'Europe/Lisbon')::date AS first_day,
    error_types_since
  FROM state
),
calendar AS (
  SELECT (b.today - offs)::date AS stat_date, b.collecting_since, b.first_day
  FROM bounds b
  CROSS JOIN generate_series(29, 0, -1) AS offs
),
daily AS (
  SELECT
    c.stat_date,
    (c.stat_date >= c.first_day) AS available,
    CASE WHEN c.stat_date >= c.first_day THEN coalesce(m.consultations, 0) ELSE NULL END AS consultations,
    CASE WHEN c.stat_date >= c.first_day THEN coalesce(m.no_record_results, 0) ELSE NULL END AS no_record_results,
    CASE WHEN c.stat_date >= c.first_day THEN coalesce(m.errors, 0) ELSE NULL END AS errors
  FROM calendar c
  LEFT JOIN public.verix_daily_metrics m ON m.stat_date = c.stat_date
),
today_error_types AS (
  SELECT e.error_type, sum(e.occurrences)::bigint AS occurrences
  FROM public.verix_daily_error_types e
  CROSS JOIN bounds b
  WHERE e.stat_date = b.today
  GROUP BY e.error_type
)
SELECT jsonb_build_object(
  'window_days', 30,
  'collecting_since', (SELECT collecting_since FROM bounds),
  'error_types_since', (SELECT error_types_since FROM bounds),
  'generated_at', clock_timestamp(),
  'days', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'date', d.stat_date,
      'available', d.available,
      'consultations', d.consultations,
      'no_record_results', d.no_record_results,
      'errors', d.errors
    ) ORDER BY d.stat_date)
    FROM daily d
  ), '[]'::jsonb),
  'totals', jsonb_build_object(
    'consultations', coalesce((SELECT sum(consultations) FROM daily WHERE available), 0),
    'no_record_results', coalesce((SELECT sum(no_record_results) FROM daily WHERE available), 0),
    'errors', coalesce((SELECT sum(errors) FROM daily WHERE available), 0)
  ),
  'today_error_types', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'error_type', e.error_type,
      'occurrences', e.occurrences
    ) ORDER BY e.occurrences DESC, e.error_type)
    FROM today_error_types e
  ), '[]'::jsonb)
);
$function$;
REVOKE ALL ON FUNCTION public.verix_daily_metrics_30d_read() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_daily_metrics_30d_read() TO service_role;
