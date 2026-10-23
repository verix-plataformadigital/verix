-- Operational presence for the Admin KPI: an installation is "online now"
-- only if it initiated at least one real vehicle lookup in the last three minutes.
-- Keep browser-session presence as a separate metric in verix2_admin_analytics.

CREATE OR REPLACE FUNCTION public.verix2_consulted_installations_3m(
  p_now timestamp with time zone DEFAULT now()
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT count(DISTINCT e.installation_id)
  FROM public.verix2_events AS e
  WHERE e.event = 'vehicle_lookup'
    AND e.query_id IS NOT NULL
    AND e.occurred_at >= p_now - interval '3 minutes'
    AND e.occurred_at <= p_now + interval '30 seconds';
$function$;

REVOKE ALL ON FUNCTION public.verix2_consulted_installations_3m(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_consulted_installations_3m(timestamptz)
  TO service_role;
