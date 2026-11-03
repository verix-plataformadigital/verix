DO $migration$
DECLARE
  v_job_id bigint;
  v_expected text := 'SELECT public.verix2_admin_dashboard_v3(now(), false);';
BEGIN
  SELECT jobid
    INTO STRICT v_job_id
  FROM cron.job
  WHERE jobname = 'verix2_admin_dashboard_cache_refresh';

  PERFORM cron.alter_job(job_id := v_job_id, command := v_expected);

  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobid = v_job_id AND active = true
      AND schedule = '*/5 * * * *' AND command = v_expected
  ) THEN
    RAISE EXCEPTION 'Could not verify the non-forced dashboard cache schedule';
  END IF;
END
$migration$;

COMMENT ON TABLE public.verix_insurance_no_cases IS
  'Restricted operational register of ASF no-record plate results. Registration plates are retained for 90 days from database receipt and physically deleted by the verix_insurance_no_cases_expiry cron job. A no-record result is not proof by itself that a vehicle has no insurance.';

COMMENT ON COLUMN public.verix_insurance_no_cases.expires_at IS
  'Database-enforced retention deadline. Defaults to 90 days after database receipt; expired rows are physically removed by the cleanup cron job.';
