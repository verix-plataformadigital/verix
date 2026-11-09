-- Remove public RPC access to retired historical Admin functions.
-- Only service_role can execute these legacy functions while old Edge code is retired.

REVOKE ALL ON FUNCTION public.verix2_admin_daily_trend_30d_v2(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_daily_trend_30d_v2(timestamptz)
  TO service_role;

REVOKE ALL ON FUNCTION public.verix2_admin_dashboard_v3_compute_lite(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_dashboard_v3_compute_lite(timestamptz)
  TO service_role;
