ALTER TABLE public.verix_insurance_no_cases
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '90 days');

UPDATE public.verix_insurance_no_cases
SET expires_at = created_at + interval '90 days'
WHERE expires_at IS DISTINCT FROM created_at + interval '90 days';

DO $migration$
DECLARE
  v_job_id bigint;
  v_command text := 'DELETE FROM public.verix_insurance_no_cases WHERE created_at < now() - interval ''90 days'' OR expires_at <= now();';
BEGIN
  SELECT jobid, command
    INTO STRICT v_job_id, v_command
  FROM cron.job
  WHERE jobname = 'verix_insurance_no_cases_expiry';

  IF v_command IS DISTINCT FROM
     'DELETE FROM public.verix_insurance_no_cases WHERE created_at < now() - interval ''90 days'' OR expires_at <= now();' THEN
    PERFORM cron.alter_job(
      job_id := v_job_id,
      command := 'DELETE FROM public.verix_insurance_no_cases WHERE created_at < now() - interval ''90 days'' OR expires_at <= now();'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = v_job_id
      AND command = 'DELETE FROM public.verix_insurance_no_cases WHERE created_at < now() - interval ''90 days'' OR expires_at <= now();'
  ) THEN
    RAISE EXCEPTION 'Could not verify 90-day insurance case cleanup job';
  END IF;
END
$migration$;
