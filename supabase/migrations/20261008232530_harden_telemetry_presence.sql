-- VÉRIX telemetry hardening
-- Make presence/activity metrics resilient to missing heartbeat/app_open events
-- and prevent last_seen from moving backwards when queued events arrive out of order.

DO $$
DECLARE
  d text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO d
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='verix2_admin_analytics'
    AND pg_get_function_identity_arguments(p.oid)='p_now timestamp with time zone'
  LIMIT 1;

  IF d IS NULL THEN
    RAISE EXCEPTION 'verix2_admin_analytics not found';
  END IF;

  d := replace(
    d,
    'WHERE event=''vehicle_lookup'' AND query_id IS NOT NULL',
    'WHERE event IN(''vehicle_lookup'',''vehicle_insurance_pending'',''vehicle_insurance_yes'',''vehicle_insurance_no'',''vehicle_insurance_error'') AND query_id IS NOT NULL'
  );

  d := replace(
    d,
    '''online_now'',count(DISTINCT installation_id) FILTER(WHERE event IN(''heartbeat'',''app_open'') AND occurred_at >= p_now-interval ''5 minutes''),
    ''active_10m'',count(DISTINCT installation_id) FILTER(WHERE event IN(''heartbeat'',''app_open'') AND occurred_at >= p_now-interval ''10 minutes''),
    ''unique_24h'',count(DISTINCT installation_id) FILTER(WHERE event IN(''heartbeat'',''app_open'') AND occurred_at >= b.s24),
    ''unique_7d'',count(DISTINCT installation_id) FILTER(WHERE event IN(''heartbeat'',''app_open'') AND occurred_at >= b.s7),
    ''unique_30d'',count(DISTINCT installation_id) FILTER(WHERE event IN(''heartbeat'',''app_open''))',
    '''online_now'',(SELECT count(DISTINCT installation_id) FROM (
      SELECT installation_id FROM public.verix2_installations WHERE last_seen >= p_now-interval ''5 minutes''
      UNION SELECT installation_id FROM public.verix2_sessions WHERE last_seen >= p_now-interval ''5 minutes''
      UNION SELECT installation_id FROM ev WHERE occurred_at >= p_now-interval ''5 minutes''
    ) active5),
    ''active_10m'',(SELECT count(DISTINCT installation_id) FROM (
      SELECT installation_id FROM public.verix2_installations WHERE last_seen >= p_now-interval ''10 minutes''
      UNION SELECT installation_id FROM public.verix2_sessions WHERE last_seen >= p_now-interval ''10 minutes''
      UNION SELECT installation_id FROM ev WHERE occurred_at >= p_now-interval ''10 minutes''
    ) active10),
    ''unique_24h'',count(DISTINCT installation_id) FILTER(WHERE occurred_at >= b.s24),
    ''unique_7d'',count(DISTINCT installation_id) FILTER(WHERE occurred_at >= b.s7),
    ''unique_30d'',count(DISTINCT installation_id)'
  );

  d := replace(
    d,
    'count(DISTINCT installation_id) FILTER(WHERE event IN(''heartbeat'',''app_open'')) users',
    'count(DISTINCT installation_id) users'
  );

  -- replace() silently returns the original function text when a source fragment
  -- no longer matches. Assert the resulting definition contains the required
  -- predicates before executing it; accepting an unchanged, incomplete rewrite
  -- would leave presence/insurance metrics stale without failing the migration.
  IF position($guard$'online_now',(SELECT count(DISTINCT installation_id) FROM ($guard$ IN d) = 0
    OR position($guard$'active_10m',(SELECT count(DISTINCT installation_id) FROM ($guard$ IN d) = 0
    OR position($guard$SELECT installation_id FROM public.verix2_sessions WHERE last_seen >= p_now-interval '5 minutes'$guard$ IN d) = 0
    OR position($guard$SELECT installation_id FROM ev WHERE occurred_at >= p_now-interval '5 minutes'$guard$ IN d) = 0
    OR position($guard$SELECT installation_id FROM public.verix2_sessions WHERE last_seen >= p_now-interval '10 minutes'$guard$ IN d) = 0
    OR position($guard$WHERE event IN('vehicle_lookup','vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND query_id IS NOT NULL$guard$ IN d) = 0
  THEN
    RAISE EXCEPTION 'verix2_admin_analytics rewrite did not retain required presence and query predicates';
  END IF;

  EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION public.verix2_keep_seen_monotonic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.last_seen IS NOT NULL
     AND (NEW.last_seen IS NULL OR NEW.last_seen < OLD.last_seen) THEN
    NEW.last_seen := OLD.last_seen;
  END IF;

  -- These tables have different row shapes: installations use first_seen,
  -- while sessions use started_at. Never dereference a column that is absent
  -- from the triggering table's OLD/NEW record.
  IF TG_TABLE_NAME = 'verix2_installations' THEN
    IF OLD.first_seen IS NOT NULL
       AND (NEW.first_seen IS NULL OR NEW.first_seen > OLD.first_seen) THEN
      NEW.first_seen := OLD.first_seen;
    END IF;
  ELSIF TG_TABLE_NAME = 'verix2_sessions' THEN
    IF OLD.started_at IS NOT NULL
       AND (NEW.started_at IS NULL OR NEW.started_at > OLD.started_at) THEN
      NEW.started_at := OLD.started_at;
    END IF;
  ELSE
    RAISE EXCEPTION 'verix2_keep_seen_monotonic used on unsupported table: %', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$function$;

drop trigger if exists verix2_installations_seen_monotonic on public.verix2_installations;
create trigger verix2_installations_seen_monotonic
before update on public.verix2_installations
for each row execute function public.verix2_keep_seen_monotonic();

drop trigger if exists verix2_sessions_seen_monotonic on public.verix2_sessions;
create trigger verix2_sessions_seen_monotonic
before update on public.verix2_sessions
for each row execute function public.verix2_keep_seen_monotonic();
