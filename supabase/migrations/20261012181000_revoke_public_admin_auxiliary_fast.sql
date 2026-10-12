-- This administrative aggregate is consumed only by the authenticated stats-v2 Edge Function.
-- Do not expose SECURITY DEFINER telemetry/insurance aggregates through PostgREST to anon/authenticated.
REVOKE ALL ON FUNCTION public.verix2_admin_auxiliary_fast(timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_auxiliary_fast(timestamp with time zone) TO service_role;
