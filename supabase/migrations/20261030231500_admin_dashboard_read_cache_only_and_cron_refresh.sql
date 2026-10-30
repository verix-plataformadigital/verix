-- Keep interactive Admin requests on the shared snapshot.
-- Only the scheduled PostgreSQL worker performs the expensive aggregate rebuild.
CREATE OR REPLACE FUNCTION public.verix2_admin_dashboard_v3(
  p_now timestamp with time zone DEFAULT now(),
  p_force_refresh boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '32MB'
AS $function$
DECLARE
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_refreshed_at timestamptz;
  v_payload jsonb;
  v_has_cache boolean := false;
  v_lock_key bigint := hashtextextended('verix2_admin_dashboard_v3_shared_cache', 0);
  v_is_live boolean;
BEGIN
  v_is_live := abs(extract(epoch FROM (v_now - clock_timestamp()))) <= 3600;

  IF NOT v_is_live THEN
    RETURN public.verix2_admin_dashboard_v3_compute(v_now);
  END IF;

  SELECT c.refreshed_at, c.payload
    INTO v_refreshed_at, v_payload
  FROM public.verix2_admin_v3_cache c
  WHERE c.singleton = true;
  v_has_cache := FOUND;

  -- Interactive requests are read-only with respect to the aggregate cache.
  -- Return the latest complete snapshot even when its refresh is overdue:
  -- stale-but-available analytics are preferable to timing out the Admin UI.
  IF NOT coalesce(p_force_refresh, false)
     AND v_has_cache
     AND v_payload IS NOT NULL THEN
    RETURN v_payload;
  END IF;

  -- The scheduled worker is the only caller that should request a rebuild.
  -- If another refresh is already running, return the last complete snapshot.
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    IF v_has_cache AND v_payload IS NOT NULL THEN
      RETURN v_payload;
    END IF;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END IF;

  SELECT c.refreshed_at, c.payload
    INTO v_refreshed_at, v_payload
  FROM public.verix2_admin_v3_cache c
  WHERE c.singleton = true;
  v_has_cache := FOUND;

  -- A concurrent refresher may have populated the cache while this call waited.
  IF NOT coalesce(p_force_refresh, false)
     AND v_has_cache
     AND v_payload IS NOT NULL THEN
    RETURN v_payload;
  END IF;

  v_payload := public.verix2_admin_dashboard_v3_compute(v_now);

  INSERT INTO public.verix2_admin_v3_cache(singleton, refreshed_at, payload)
  VALUES (true, clock_timestamp(), v_payload)
  ON CONFLICT (singleton) DO UPDATE
    SET refreshed_at = EXCLUDED.refreshed_at,
        payload = EXCLUDED.payload;

  RETURN v_payload;
END;
$function$;

COMMENT ON FUNCTION public.verix2_admin_dashboard_v3(timestamptz, boolean)
IS 'Interactive requests read the latest shared snapshot. The scheduled pg_cron worker calls with p_force_refresh=true to rebuild it.';

DO $admin_refresh_job$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_job_id
  FROM cron.job
  WHERE jobname = 'verix2_admin_dashboard_cache_refresh';

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Could not find verix2_admin_dashboard_cache_refresh job';
  END IF;

  PERFORM cron.alter_job(
    job_id := v_job_id,
    command := 'SELECT public.verix2_admin_dashboard_v3(now(), true);'
  );
END;
$admin_refresh_job$;
