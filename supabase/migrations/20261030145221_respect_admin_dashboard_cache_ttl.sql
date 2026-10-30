-- Respect the PostgreSQL cache TTL for the VÉRIX Admin dashboard.
-- The current Admin calls stats-v2?detail=dashboard-v3. Normal refreshes pass
-- p_force_refresh=false; only an explicit manual refresh uses fresh=1.
-- The cron must warm the same cache without forcing an expensive recomputation
-- every five minutes. This does not modify the ASF relay or telemetry ingestion.
DO $migration$
DECLARE
  v_job_id bigint;
  v_command text;
BEGIN
  SELECT jobid, command
    INTO STRICT v_job_id, v_command
  FROM cron.job
  WHERE command IN (
    'SELECT public.verix2_admin_dashboard_v3(now(), true);',
    'SELECT public.verix2_admin_dashboard_v3(now(), false);'
  );

  IF v_command = 'SELECT public.verix2_admin_dashboard_v3(now(), true);' THEN
    PERFORM cron.alter_job(
      job_id := v_job_id,
      command := 'SELECT public.verix2_admin_dashboard_v3(now(), false);'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = v_job_id
      AND command = 'SELECT public.verix2_admin_dashboard_v3(now(), false);'
  ) THEN
    RAISE EXCEPTION 'Could not verify the Admin dashboard cron command';
  END IF;
END
$migration$;
