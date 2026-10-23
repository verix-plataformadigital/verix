-- Restore the approved 90-day retention window for "Sem registo" consultation cases.
-- Applied to production on 2026-10-14; this migration records the live change in source control.
ALTER TABLE public.verix_insurance_no_cases
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '90 days');

UPDATE public.verix_insurance_no_cases
SET expires_at = occurred_at + interval '90 days'
WHERE occurred_at >= now() - interval '90 days'
  AND expires_at IS DISTINCT FROM occurred_at + interval '90 days';

COMMENT ON TABLE public.verix_insurance_no_cases IS
  'Restricted 90-day list of vehicle plates for which ASF returned no record. Not proof by itself that a vehicle has no insurance.';
