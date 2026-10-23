-- Reduce expensive Admin-wide recalculations while keeping live-presence KPIs fresh.
CREATE OR REPLACE FUNCTION public.verix2_admin_live_presence(p_now timestamp with time zone DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
SET work_mem TO '4MB'
AS $function$
WITH presence AS (
  SELECT
    session_id,
    max(occurred_at) FILTER (WHERE event IN ('app_open','heartbeat')) AS last_presence,
    max(occurred_at) FILTER (WHERE event='session_close') AS last_close
  FROM public.verix2_events
  WHERE session_id IS NOT NULL
    AND event IN ('app_open','heartbeat','session_close')
    AND occurred_at >= p_now - interval '2 minutes'
    AND occurred_at <= p_now + interval '30 seconds'
  GROUP BY session_id
),
all_start AS (
  SELECT public.verix2_all_start(p_now) AS start_at
),
active_10m AS (
  SELECT installation_id
  FROM public.verix2_installations
  WHERE last_seen >= p_now - interval '10 minutes'
  UNION
  SELECT installation_id
  FROM public.verix2_sessions
  WHERE last_seen >= p_now - interval '10 minutes'
  UNION
  SELECT e.installation_id
  FROM public.verix2_events e, all_start b
  WHERE e.occurred_at >= p_now - interval '10 minutes'
    AND e.occurred_at >= b.start_at
    AND e.occurred_at < p_now
)
SELECT jsonb_build_object(
  'online_now', (
    SELECT count(*)
    FROM presence p
    WHERE p.last_presence >= p_now - interval '90 seconds'
      AND (p.last_close IS NULL OR p.last_presence > p.last_close)
  ),
  'active_10m', (SELECT count(*) FROM active_10m)
);
$function$;

REVOKE ALL ON FUNCTION public.verix2_admin_live_presence(timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_admin_live_presence(timestamp with time zone) TO service_role;

-- Avoid rewriting the full dashboard cache more often than every five minutes.
-- Keep a previous successful payload available if a refresh briefly fails.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_dashboard_cached(timestamp with time zone, boolean)'::regprocedure)
    INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'verix2_admin_dashboard_cached function was not found';
  END IF;

  IF position('interval ''4 minutes 50 seconds''' in v_definition) = 0 THEN
    IF position('interval ''45 seconds''' in v_definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected cache TTL in verix2_admin_dashboard_cached; refusing an unsafe rewrite';
    END IF;
    v_definition := replace(v_definition, 'interval ''45 seconds''', 'interval ''4 minutes 50 seconds''');
  END IF;

  IF position('interval ''10 minutes''' in v_definition) = 0 THEN
    v_definition := replace(v_definition, 'interval ''5 minutes''', 'interval ''10 minutes''');
  END IF;

  EXECUTE v_definition;
END
$migration$;

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

  PERFORM cron.alter_job(v_job_id, '*/5 * * * *', NULL, NULL, NULL, true);
END
$migration$;