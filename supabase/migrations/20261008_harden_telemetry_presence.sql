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

  EXECUTE d;
END $$;

create or replace function public.verix2_keep_seen_monotonic()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.last_seen is not null and (new.last_seen is null or new.last_seen < old.last_seen) then
    new.last_seen := old.last_seen;
  end if;
  if old.first_seen is not null and (new.first_seen is null or new.first_seen > old.first_seen) then
    new.first_seen := old.first_seen;
  end if;
  return new;
end;
$$;

drop trigger if exists verix2_installations_seen_monotonic on public.verix2_installations;
create trigger verix2_installations_seen_monotonic
before update on public.verix2_installations
for each row execute function public.verix2_keep_seen_monotonic();

drop trigger if exists verix2_sessions_seen_monotonic on public.verix2_sessions;
create trigger verix2_sessions_seen_monotonic
before update on public.verix2_sessions
for each row execute function public.verix2_keep_seen_monotonic();
