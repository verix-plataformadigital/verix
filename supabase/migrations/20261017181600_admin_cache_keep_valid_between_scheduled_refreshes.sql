DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_dashboard_cached(timestamp with time zone, boolean)'::regprocedure)
    INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'verix2_admin_dashboard_cached function was not found';
  END IF;

  IF position('interval ''6 minutes''' in v_definition) = 0 THEN
    IF position('interval ''4 minutes 50 seconds''' in v_definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected cache TTL; refusing an unsafe rewrite';
    END IF;
    v_definition := replace(v_definition, 'interval ''4 minutes 50 seconds''', 'interval ''6 minutes''');
  END IF;

  EXECUTE v_definition;
END
$migration$;