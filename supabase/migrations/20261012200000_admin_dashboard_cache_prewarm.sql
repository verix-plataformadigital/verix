
CREATE OR REPLACE FUNCTION public.verix2_admin_dashboard_cached(
  p_now timestamptz DEFAULT now(),
  p_force_refresh boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '48MB'
AS $function$
DECLARE
  v_requested_at timestamptz := clock_timestamp();
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_live boolean;
  v_reset24 timestamptz;
  v_reset_all timestamptz;
  v_cache_reset24 timestamptz;
  v_cache_reset_all timestamptz;
  v_payload jsonb;
  v_cached_at timestamptz;
  v_compatible boolean := false;
  v_lock_key bigint := hashtextextended('verix2_admin_dashboard_shared_cache', 0);
BEGIN
  v_live := abs(extract(epoch FROM (v_now - clock_timestamp()))) <= 10;

  IF NOT v_live THEN
    RETURN public.verix2_admin_dashboard_fast(v_now);
  END IF;

  SELECT s.reset_24h_at, s.reset_all_at
    INTO v_reset24, v_reset_all
  FROM public.verix2_dashboard_state s
  WHERE s.singleton = true;

  SELECT c.refreshed_at, c.reset_24h_at, c.reset_all_at, c.payload
    INTO v_cached_at, v_cache_reset24, v_cache_reset_all, v_payload
  FROM public.verix2_admin_dashboard_cache c
  WHERE c.singleton = true;

  v_compatible := FOUND
    AND v_cache_reset24 IS NOT DISTINCT FROM v_reset24
    AND v_cache_reset_all IS NOT DISTINCT FROM v_reset_all;

  IF v_compatible AND NOT coalesce(p_force_refresh, false) THEN
    IF v_cached_at >= clock_timestamp() - interval '90 seconds' THEN
      RETURN v_payload;
    END IF;
    IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
      RETURN v_payload;
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END IF;

  SELECT c.refreshed_at, c.reset_24h_at, c.reset_all_at, c.payload
    INTO v_cached_at, v_cache_reset24, v_cache_reset_all, v_payload
  FROM public.verix2_admin_dashboard_cache c
  WHERE c.singleton = true;

  v_compatible := FOUND
    AND v_cache_reset24 IS NOT DISTINCT FROM v_reset24
    AND v_cache_reset_all IS NOT DISTINCT FROM v_reset_all;

  -- Coalesce concurrent refresh requests, including an Admin click overlapping cron.
  IF v_compatible AND v_payload IS NOT NULL
     AND v_cached_at >= v_requested_at THEN
    RETURN v_payload;
  END IF;

  IF v_compatible
     AND NOT coalesce(p_force_refresh, false)
     AND v_cached_at >= clock_timestamp() - interval '90 seconds' THEN
    RETURN v_payload;
  END IF;

  BEGIN
    v_payload := public.verix2_admin_dashboard_fast(v_now);
  EXCEPTION WHEN OTHERS THEN
    IF v_compatible
       AND v_cached_at >= clock_timestamp() - interval '5 minutes'
       AND v_payload IS NOT NULL THEN
      RETURN v_payload;
    END IF;
    RAISE;
  END;

  INSERT INTO public.verix2_admin_dashboard_cache
    (singleton, refreshed_at, reset_24h_at, reset_all_at, payload)
  VALUES
    (true, clock_timestamp(), v_reset24, v_reset_all, v_payload)
  ON CONFLICT (singleton) DO UPDATE
    SET refreshed_at = EXCLUDED.refreshed_at,
        reset_24h_at = EXCLUDED.reset_24h_at,
        reset_all_at = EXCLUDED.reset_all_at,
        payload = EXCLUDED.payload;

  RETURN v_payload;
END;
$function$;

-- Keep the snapshot warm so normal page visits do not pay the full aggregation
-- cost. Advisory locking inside the RPC coalesces overlapping refresh requests.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'verix2_admin_dashboard_cache_refresh';

SELECT cron.schedule(
  'verix2_admin_dashboard_cache_refresh',
  '* * * * *',
  'SELECT public.verix2_admin_dashboard_cached(now(), true);'
);
