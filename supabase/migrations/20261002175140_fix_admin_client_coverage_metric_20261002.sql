DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO d
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='verix2_admin_analytics'
    AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone';
  IF d IS NULL THEN RAISE EXCEPTION 'verix2_admin_analytics not found'; END IF;
  d := replace(
    d,
    '''client_coverage_30d'',round((100.0*count(*) FILTER(WHERE metadata ? ''client'')/',
    '''client_coverage_30d'',round((100.0*count(*) FILTER(WHERE event IN(''app_open'',''heartbeat'',''cinemometer_calculation'',''cinemometer_speed_entry'',''vehicle_insurance_yes'',''vehicle_insurance_no'',''vehicle_insurance_error'') AND metadata ? ''client'')/'
  );
  EXECUTE d;
END $$;
