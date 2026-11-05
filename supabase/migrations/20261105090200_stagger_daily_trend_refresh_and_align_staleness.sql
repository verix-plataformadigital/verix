-- Keep the 30-day partial-today chart current without running alongside the dashboard refresh.
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
        c.refreshed_at < now() - interval '40 minutes'
    )
  FROM public.verix2_admin_daily_trend_cache c
  WHERE c.singleton = true;
$function$;

-- Dashboard refresh runs at :00/:30; trend refresh runs seven minutes later.
SELECT cron.alter_job(job_id := 6, schedule := '7,37 * * * *', active := true);
