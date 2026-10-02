-- VÉRIX production contract checks.
-- Run in a controlled environment with the service role/postgres role.

DO $$
DECLARE
  c bigint;
BEGIN
  SELECT count(*) INTO c FROM public.verix2_events
  WHERE event='vehicle_lookup' AND query_id IS NOT NULL;
  IF c < 0 THEN RAISE EXCEPTION 'Impossible vehicle lookup count'; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.verix2_events q
    WHERE q.event='vehicle_lookup'
      AND q.query_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.verix2_events f
        WHERE f.query_id=q.query_id
          AND f.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
        GROUP BY f.query_id
        HAVING count(*) > 1
      )
  ) THEN
    RAISE EXCEPTION 'Duplicate final outcome detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename LIKE 'verix2_%'
      AND policyname='verix2_deny_public'
      AND (qual <> 'false' OR with_check <> 'false')
  ) THEN
    RAISE EXCEPTION 'Public deny policy is not deny-by-default';
  END IF;
END $$;
