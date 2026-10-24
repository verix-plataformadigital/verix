-- Smoke test for supabase/migrations/20261024_asf_global_cadence.sql.
-- Runs only against a disposable PostgreSQL instance in GitHub Actions.

DO $test$
DECLARE
  v_state jsonb;
BEGIN
  v_state := public.verix_asf_acquire_slot_v1(
    '00000000-0000-0000-0000-000000000001'::uuid, 30, 1000
  );
  IF v_state->>'granted' <> 'true' THEN
    RAISE EXCEPTION 'first request should acquire a slot: %', v_state;
  END IF;

  v_state := public.verix_asf_acquire_slot_v1(
    '00000000-0000-0000-0000-000000000002'::uuid, 30, 1000
  );
  IF v_state->>'granted' <> 'false' THEN
    RAISE EXCEPTION 'concurrent request must wait instead of acquiring: %', v_state;
  END IF;

  PERFORM public.verix_asf_release_slot_v1(
    '00000000-0000-0000-0000-000000000001'::uuid, 2000
  );

  v_state := public.verix_asf_acquire_slot_v1(
    '00000000-0000-0000-0000-000000000002'::uuid, 30, 1000
  );
  IF v_state->>'granted' <> 'false' OR v_state->>'reason' <> 'upstream_cooldown' THEN
    RAISE EXCEPTION 'shared upstream cooldown must block immediate acquisition: %', v_state;
  END IF;
END;
$test$;

SELECT 'PASS: global slot, waiting requests, and shared cooldown' AS result;
