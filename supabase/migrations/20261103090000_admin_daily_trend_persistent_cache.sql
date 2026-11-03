-- Persist the 30-day Admin trend separately from the live dashboard cache.
-- A staggered cron refresh keeps the Usage page from executing a heavy event scan.

DROP FUNCTION IF EXISTS public.verix2_admin_daily_trend_30d_v2(timestamptz);

CREATE TABLE IF NOT EXISTS public.verix2_admin_daily_trend_cache (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  payload jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.verix2_admin_daily_trend_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verix2_admin_daily_trend_cache FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verix2_admin_daily_trend_cache
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verix2_admin_daily_trend_cache_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
    c.payload || jsonb_build_object(
      'cacheRefreshedAt', c.refreshed_at,
      'cacheAgeSeconds',
        GREATEST(0, floor(extract(epoch FROM (now() - c.refreshed_at)))::bigint),
      'cacheStale',
        c.refreshed_at < now() - interval '15 minutes'
    )
  FROM public.verix2_admin_daily_trend_cache c
  WHERE c.singleton = true;
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_daily_trend_cache_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_daily_trend_cache_v1()
  TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.verix2_admin_daily_trend_cache_refresh_v1(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '32MB'
SET statement_timeout TO '25s'
AS $function$
DECLARE
  v_payload jsonb;
  v_refreshed_at timestamptz;
  v_lock_key bigint := hashtextextended('verix2_admin_daily_trend_cache_refresh_v1', 0);
BEGIN
  -- Prevent concurrent refreshes from creating avoidable load on verix2_events.
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN jsonb_build_object('ok', false, 'skipped', true, 'reason', 'refresh_in_progress');
  END IF;

  -- Keep the existing, validated date-window and classification logic intact.
  v_payload := public.verix2_admin_daily_trend_30d(coalesce(p_now, now()));

  IF v_payload IS NULL
     OR jsonb_typeof(v_payload->'days') IS DISTINCT FROM 'array'
     OR coalesce(jsonb_array_length(v_payload->'days'), 0) <> 30 THEN
    RAISE EXCEPTION 'daily trend refresh returned an invalid 30-day payload';
  END IF;

  v_refreshed_at := clock_timestamp();

  INSERT INTO public.verix2_admin_daily_trend_cache(singleton, payload, refreshed_at)
  VALUES (true, v_payload, v_refreshed_at)
  ON CONFLICT (singleton) DO UPDATE
    SET payload = EXCLUDED.payload,
        refreshed_at = EXCLUDED.refreshed_at;

  RETURN jsonb_build_object(
    'ok', true,
    'refreshedAt', v_refreshed_at,
    'firstDay', v_payload->>'firstDay',
    'lastDay', v_payload->>'lastDay',
    'dayCount', jsonb_array_length(v_payload->'days')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_daily_trend_cache_refresh_v1(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_daily_trend_cache_refresh_v1(timestamptz)
  TO service_role, postgres;

-- Run two minutes after the dashboard snapshot job (*/5), avoiding simultaneous heavy scans.
DO $schedule$
DECLARE
  v_jobid bigint;
BEGIN
  FOR v_jobid IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'verix2_admin_daily_trend_cache_refresh'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  PERFORM cron.schedule(
    'verix2_admin_daily_trend_cache_refresh',
    '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
    'SELECT public.verix2_admin_daily_trend_cache_refresh_v1(now());'
  );
END;
$schedule$;
