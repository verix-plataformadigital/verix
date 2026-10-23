-- Shared short-lived snapshot for the VÉRIX Admin fast dashboard.
-- Values retain the original analytics payload and are keyed by reset markers.
-- Manual refresh bypasses this cache; auto-refreshes reuse it for up to 45 seconds.

CREATE TABLE IF NOT EXISTS public.verix2_admin_dashboard_cache (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  refreshed_at timestamptz NOT NULL,
  reset_24h_at timestamptz,
  reset_all_at timestamptz,
  payload jsonb NOT NULL
);

ALTER TABLE public.verix2_admin_dashboard_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verix2_admin_dashboard_cache FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.verix2_admin_dashboard_cache FROM service_role;

COMMENT ON TABLE public.verix2_admin_dashboard_cache IS
  'Private short-lived shared snapshot used by the Admin dashboard fast path.';

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
  -- Do not reuse a snapshot for historical/test calls with a custom timestamp.
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
    IF v_cached_at >= clock_timestamp() - interval '45 seconds' THEN
      RETURN v_payload;
    END IF;

    -- If another request is already refreshing, serve the latest compatible
    -- snapshot instead of making every Admin tab scan the events table.
    IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
      RETURN v_payload;
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END IF;

  -- Recheck after taking the lock: another request may have refreshed the row.
  SELECT c.refreshed_at, c.reset_24h_at, c.reset_all_at, c.payload
    INTO v_cached_at, v_cache_reset24, v_cache_reset_all, v_payload
  FROM public.verix2_admin_dashboard_cache c
  WHERE c.singleton = true;

  v_compatible := FOUND
    AND v_cache_reset24 IS NOT DISTINCT FROM v_reset24
    AND v_cache_reset_all IS NOT DISTINCT FROM v_reset_all;

  IF v_compatible
     AND NOT coalesce(p_force_refresh, false)
     AND v_cached_at >= clock_timestamp() - interval '45 seconds' THEN
    RETURN v_payload;
  END IF;

  BEGIN
    v_payload := public.verix2_admin_dashboard_fast(v_now);
  EXCEPTION WHEN OTHERS THEN
    -- Avoid blanking the Admin during a brief DB fault if a recent compatible
    -- snapshot exists. Keep its original generated_at so its age is visible.
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

REVOKE ALL ON FUNCTION public.verix2_admin_dashboard_cached(timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_dashboard_cached(timestamptz, boolean)
  TO service_role;
