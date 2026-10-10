-- Keep the 24h, 7d and 30d panels comparable with Histórico Total.
-- Every period remains a rolling window, but it cannot include events older
-- than the current total-history baseline. Older telemetry stays stored.
DO $migration$
DECLARE
  v_definition text;
  v_old_24 text := $old_24$
    p_now - interval '24 hours' AS s24,
$old_24$;
  v_new_24 text := $new_24$
    greatest(p_now - interval '24 hours', public.verix2_all_start(p_now)) AS s24,
$new_24$;
  v_old_7 text := $old_7$
    p_now - interval '7 days' AS s7,
$old_7$;
  v_new_7 text := $new_7$
    greatest(p_now - interval '7 days', public.verix2_all_start(p_now)) AS s7,
$new_7$;
  v_old_30 text := $old_30$
    p_now - interval '30 days' AS s30,
$old_30$;
  v_new_30 text := $new_30$
    greatest(p_now - interval '30 days', public.verix2_all_start(p_now)) AS s30,
$new_30$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure)
    INTO v_definition;

  IF position(v_old_24 IN v_definition)=0
     OR position(v_old_7 IN v_definition)=0
     OR position(v_old_30 IN v_definition)=0 THEN
    RAISE EXCEPTION 'Expected rolling period boundaries not found; refusing partial patch';
  END IF;

  v_definition := replace(v_definition, v_old_24, v_new_24);
  v_definition := replace(v_definition, v_old_7, v_new_7);
  v_definition := replace(v_definition, v_old_30, v_new_30);

  IF position(v_new_24 IN v_definition)=0
     OR position(v_new_7 IN v_definition)=0
     OR position(v_new_30 IN v_definition)=0
     OR position(v_old_24 IN v_definition)>0
     OR position(v_old_7 IN v_definition)>0
     OR position(v_old_30 IN v_definition)>0 THEN
    RAISE EXCEPTION 'Period-boundary validation failed; no changes applied';
  END IF;

  EXECUTE v_definition;
END
$migration$;
