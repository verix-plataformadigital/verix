-- Bound analytics memory and make every dashboard snapshot carry an explicit freshness state.
ALTER FUNCTION public.verix2_admin_dashboard_v3_compute(timestamptz) SET work_mem = '12MB';
ALTER FUNCTION public.verix2_admin_dashboard_v3(timestamptz, boolean) SET work_mem = '8MB';
ALTER FUNCTION public.verix2_admin_daily_trend_30d(timestamptz) SET work_mem = '8MB';
ALTER FUNCTION public.verix2_admin_daily_trend_cache_refresh_v1(timestamptz) SET work_mem = '8MB';
ALTER FUNCTION public.verix2_admin_daily_trend_30d(timestamptz) SET statement_timeout = '45s';
ALTER FUNCTION public.verix2_admin_daily_trend_cache_refresh_v1(timestamptz) SET statement_timeout = '50s';

CREATE OR REPLACE FUNCTION public.verix2_admin_dashboard_v3(
  p_now timestamptz DEFAULT now(),
  p_force_refresh boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '8MB'
AS $function$
DECLARE
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_refreshed_at timestamptz;
  v_payload jsonb;
  v_has_cache boolean := false;
  v_lock_key bigint := hashtextextended('verix2_admin_dashboard_v3_shared_cache', 0);
  v_is_live boolean;
  v_age_seconds bigint;
  v_freshness jsonb;
BEGIN
  v_is_live := abs(extract(epoch FROM (v_now - clock_timestamp()))) <= 3600;
  IF NOT v_is_live THEN
    RETURN public.verix2_admin_dashboard_v3_compute(v_now);
  END IF;
  SELECT c.refreshed_at, c.payload INTO v_refreshed_at, v_payload
  FROM public.verix2_admin_v3_cache c WHERE c.singleton = true;
  v_has_cache := FOUND AND v_payload IS NOT NULL;

  -- HTTP dashboard reads never execute the full aggregate. The cron worker
  -- owns refreshes; stale data is returned with explicit server freshness.
  IF NOT coalesce(p_force_refresh, false) AND v_has_cache THEN
    v_age_seconds := greatest(0,floor(extract(epoch FROM (clock_timestamp()-v_refreshed_at)))::bigint);
    v_freshness := jsonb_build_object(
      'status',CASE WHEN v_age_seconds>2100 THEN 'stale' ELSE 'fresh' END,
      'isStale',v_age_seconds>2100,'ageSeconds',v_age_seconds,
      'maxAgeSeconds',2100,'refreshedAt',v_refreshed_at
    );
    RETURN v_payload || jsonb_build_object('freshness',v_freshness);
  END IF;

  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    IF v_has_cache THEN
      v_age_seconds := greatest(0,floor(extract(epoch FROM (clock_timestamp()-v_refreshed_at)))::bigint);
      v_freshness := jsonb_build_object(
        'status',CASE WHEN v_age_seconds>2100 THEN 'stale' ELSE 'fresh' END,
        'isStale',v_age_seconds>2100,'ageSeconds',v_age_seconds,
        'maxAgeSeconds',2100,'refreshedAt',v_refreshed_at,'refreshInProgress',true
      );
      RETURN v_payload || jsonb_build_object('freshness',v_freshness);
    END IF;
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END IF;

  v_payload := public.verix2_admin_dashboard_v3_compute(v_now);
  v_refreshed_at := clock_timestamp();
  INSERT INTO public.verix2_admin_v3_cache(singleton,refreshed_at,payload)
  VALUES(true,v_refreshed_at,v_payload)
  ON CONFLICT(singleton) DO UPDATE
    SET refreshed_at=EXCLUDED.refreshed_at,payload=EXCLUDED.payload;
  v_freshness := jsonb_build_object(
    'status','fresh','isStale',false,'ageSeconds',0,
    'maxAgeSeconds',2100,'refreshedAt',v_refreshed_at,'refreshInProgress',false
  );
  RETURN v_payload || jsonb_build_object('freshness',v_freshness);
END;
$function$;
NOTIFY pgrst, 'reload schema';
