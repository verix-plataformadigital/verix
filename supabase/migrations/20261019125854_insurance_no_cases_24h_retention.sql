-- Keep only the last 24 hours in the operational no-record plate register.
-- Raw telemetry events and historical aggregates are intentionally preserved.
ALTER TABLE public.verix_insurance_no_cases
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '24 hours');

DELETE FROM public.verix_insurance_no_cases
WHERE created_at < now() - interval '24 hours';

UPDATE public.verix_insurance_no_cases
SET expires_at = created_at + interval '24 hours'
WHERE expires_at IS DISTINCT FROM created_at + interval '24 hours';

COMMENT ON TABLE public.verix_insurance_no_cases IS
  'Restricted operational register of ASF no-record plate results. Rows are physically deleted after 24 hours from database receipt. A no-record result is not proof by itself that a vehicle has no insurance.';

DO $cleanup$
DECLARE
  r record;
  found_job boolean := false;
  v_command text := 'DELETE FROM public.verix_insurance_no_cases WHERE created_at < now() - interval ''24 hours'' OR expires_at <= now();';
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE command ILIKE '%verix_insurance_no_cases%'
  LOOP
    PERFORM cron.alter_job(
      job_id := r.jobid,
      schedule := '*/5 * * * *',
      command := v_command
    );
    found_job := true;
  END LOOP;

  IF NOT found_job THEN
    PERFORM cron.schedule(
      'verix_insurance_no_cases_expiry',
      '*/5 * * * *',
      v_command
    );
  END IF;
END
$cleanup$;
