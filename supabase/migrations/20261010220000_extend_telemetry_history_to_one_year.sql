CREATE OR REPLACE FUNCTION public.verix2_cleanup_old_data(
  p_before timestamp with time zone DEFAULT (now() - interval '365 days')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  deleted_events bigint := 0;
  deleted_rate_limits bigint := 0;
  deleted_insurance_no_cases bigint := 0;
BEGIN
  DELETE FROM public.verix2_events WHERE occurred_at < p_before;
  GET DIAGNOSTICS deleted_events = ROW_COUNT;

  DELETE FROM public.verix2_rate_limits WHERE window_start < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_rate_limits = ROW_COUNT;

  DELETE FROM public.verix_insurance_no_cases WHERE expires_at <= now();
  GET DIAGNOSTICS deleted_insurance_no_cases = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'before', p_before,
    'deleted_events', deleted_events,
    'deleted_rate_limits', deleted_rate_limits,
    'deleted_insurance_no_cases', deleted_insurance_no_cases
  );
END;
$function$;
