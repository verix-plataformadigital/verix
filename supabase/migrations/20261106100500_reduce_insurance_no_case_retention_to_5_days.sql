-- Reduce the operational ASF "no record" plate register retention to five days.
-- Existing rows are re-aged from database receipt time and expired rows are deleted immediately.
ALTER TABLE public.verix_insurance_no_cases
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '5 days');

UPDATE public.verix_insurance_no_cases
SET expires_at = created_at + interval '5 days'
WHERE expires_at IS DISTINCT FROM created_at + interval '5 days';

DELETE FROM public.verix_insurance_no_cases
WHERE created_at < now() - interval '5 days'
   OR expires_at <= now();

COMMENT ON TABLE public.verix_insurance_no_cases IS
  'Restricted operational register of ASF no-record plate results. Registration plates are retained for a maximum of 5 days from database receipt and physically deleted by the hourly verix_insurance_no_cases_expiry cron job. A no-record result is not proof by itself that a vehicle has no insurance.';

COMMENT ON COLUMN public.verix_insurance_no_cases.expires_at IS
  'Database-enforced retention deadline. Defaults to 5 days after database receipt; expired rows are physically removed by the hourly cleanup cron job.';

DO $migration$
DECLARE
  v_job_id bigint;
  v_expected_schedule text := '0 * * * *';
  v_expected_command text := 'DELETE FROM public.verix_insurance_no_cases WHERE created_at < now() - interval ''5 days'' OR expires_at <= now();';
BEGIN
  SELECT jobid
    INTO STRICT v_job_id
  FROM cron.job
  WHERE jobname = 'verix_insurance_no_cases_expiry';

  PERFORM cron.alter_job(
    job_id := v_job_id,
    schedule := v_expected_schedule,
    command := v_expected_command
  );

  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = v_job_id
      AND active = true
      AND schedule = v_expected_schedule
      AND command = v_expected_command
  ) THEN
    RAISE EXCEPTION 'Could not verify 5-day hourly insurance case cleanup job';
  END IF;
END
$migration$;
