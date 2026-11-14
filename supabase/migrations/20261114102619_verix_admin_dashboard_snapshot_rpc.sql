-- One authenticated RPC for the Admin live counters and 30-day aggregate history.
-- Keeps the Edge Function to one PostgREST round trip per dashboard refresh.
CREATE OR REPLACE FUNCTION public.verix_admin_dashboard_snapshot_v1(
  p_now timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public'
SET statement_timeout TO '5000ms'
AS $function$
WITH timing AS (
  SELECT coalesce(p_now, statement_timestamp()) AS observed_at
),
snapshot AS (
  SELECT
    t.observed_at,
    public.verix_admin_recent_consultations(t.observed_at) AS consultations_5m,
    public.verix_admin_consultations_last_hour(t.observed_at) AS consultations_1h,
    public.verix_daily_metrics_30d_read() AS history
  FROM timing t
)
SELECT jsonb_build_object(
  'generated_at', observed_at,
  'presence', jsonb_build_object(
    'observed_at', observed_at,
    'consultations_started_last_5m', consultations_5m,
    'consultations_started_last_1h', consultations_1h
  ),
  'history', history
)
FROM snapshot;
$function$;

REVOKE ALL ON FUNCTION public.verix_admin_dashboard_snapshot_v1(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_admin_dashboard_snapshot_v1(timestamptz)
  TO service_role;
