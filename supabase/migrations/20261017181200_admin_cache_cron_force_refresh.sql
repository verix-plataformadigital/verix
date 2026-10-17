DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'verix2_admin_dashboard_cache_refresh'
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Admin cache refresh cron job was not found';
  END IF;

  PERFORM cron.alter_job(
    v_job_id,
    '*/5 * * * *',
    'SELECT public.verix2_admin_dashboard_cached(now(), true);',
    NULL,
    NULL,
    true
  );
END
$migration$;