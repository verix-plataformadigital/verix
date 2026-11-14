-- Additional one-hour consultation window for the live Admin dashboard.
CREATE OR REPLACE FUNCTION public.verix_admin_consultations_last_hour(
  p_now timestamp with time zone DEFAULT now()
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET statement_timeout TO '1500ms'
AS $function$
  SELECT count(*)::bigint
  FROM public.verix_lifetime_query_state
  WHERE has_lookup IS TRUE
    AND lookup_at >= coalesce(p_now, clock_timestamp()) - interval '1 hour'
    AND lookup_at <= coalesce(p_now, clock_timestamp()) + interval '30 seconds';
$function$;

REVOKE ALL ON FUNCTION public.verix_admin_consultations_last_hour(timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_admin_consultations_last_hour(timestamp with time zone) TO service_role;
