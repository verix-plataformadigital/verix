-- Daily-only Admin snapshot: no live presence windows or heartbeat-derived metrics.
-- This keeps the dashboard RPC focused on the 30-day aggregate required by the operator.
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
    public.verix_daily_metrics_30d_read() AS history
  FROM timing t
)
SELECT jsonb_build_object(
  'generated_at', observed_at,
  'history', history
)
FROM snapshot;
$function$;

REVOKE ALL ON FUNCTION public.verix_admin_dashboard_snapshot_v1(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_admin_dashboard_snapshot_v1(timestamptz)
  TO service_role;
