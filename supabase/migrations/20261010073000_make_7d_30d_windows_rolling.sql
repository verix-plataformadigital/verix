-- Keep short period selectors as true rolling windows even when the
-- cumulative history baseline is reset. The "total" window remains anchored
-- to verix2_all_start(p_now); 24h/7d/30d do not inherit that reset marker.
DO $migration$
DECLARE
  v_definition text;
  v_old_7 text := $old_7$
    greatest(p_now - interval '7 days', public.verix2_all_start(p_now)) AS s7,
$old_7$;
  v_new_7 text := $new_7$
    p_now - interval '7 days' AS s7,
$new_7$;
  v_old_30 text := $old_30$
    greatest(p_now - interval '30 days', public.verix2_all_start(p_now)) AS s30,
$old_30$;
  v_new_30 text := $new_30$
    p_now - interval '30 days' AS s30,
$new_30$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure)
    INTO v_definition;

  IF position(v_old_7 IN v_definition)=0 THEN
    RAISE EXCEPTION 'Expected reset-clamped 7-day expression not found; refusing partial patch';
  END IF;
  IF position(v_old_30 IN v_definition)=0 THEN
    RAISE EXCEPTION 'Expected reset-clamped 30-day expression not found; refusing partial patch';
  END IF;

  v_definition := replace(v_definition, v_old_7, v_new_7);
  v_definition := replace(v_definition, v_old_30, v_new_30);
  EXECUTE v_definition;
END
$migration$;
