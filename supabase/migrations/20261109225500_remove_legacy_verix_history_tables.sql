-- VÉRIX counter-only cutover: remove legacy event, session, plate and Admin-history storage.
-- Applied to production after the new Admin dashboard and counter endpoints were deployed.
-- Keep verix_lifetime_counters, expiring hashed dedupe state, rate limits and build registry.

DO $$
DECLARE j record;
BEGIN
  FOR j IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'verix2_daily_cleanup',
      'verix_insurance_no_cases_expiry',
      'verix2_admin_dashboard_cache_refresh',
      'verix2_admin_daily_trend_cache_refresh',
      'verix_events_compaction_once',
      'verix_events_compaction_disable',
      'verix_compaction_prepare_timeout',
      'verix_timeout_reset_watchdog'
    )
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END;
$$;

DROP VIEW IF EXISTS verix_admin.asf_errors_24h;

DROP TABLE IF EXISTS public.verix2_events;
DROP TABLE IF EXISTS public.verix2_sessions;
DROP TABLE IF EXISTS public.verix2_installations;
DROP TABLE IF EXISTS public.verix_insurance_no_cases;

DROP TABLE IF EXISTS public.verix2_admin_dashboard_cache;
DROP TABLE IF EXISTS public.verix2_admin_v3_cache;
DROP TABLE IF EXISTS public.verix2_admin_daily_trend_cache;
DROP TABLE IF EXISTS public.verix2_admin_error_stats_exclusions;
DROP TABLE IF EXISTS public.verix2_dashboard_state;
DROP TABLE IF EXISTS public.verix_metric_resets;
DROP TABLE IF EXISTS public.period_resets;
