\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.verix2_installations (
  installation_id text PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  app_version text, device_type text, browser text, os text
);
CREATE TABLE public.verix2_sessions (
  session_id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES public.verix2_installations(installation_id) ON DELETE CASCADE,
  tab_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.verix2_events (
  event_id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES public.verix2_installations(installation_id) ON DELETE CASCADE,
  session_id text REFERENCES public.verix2_sessions(session_id) ON DELETE SET NULL,
  tab_id text, query_id text, event text NOT NULL, module text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  app_version text, device_type text, browser text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX verix2_vehicle_lookup_query_uq
  ON public.verix2_events(query_id)
  WHERE event = 'vehicle_lookup' AND query_id IS NOT NULL;
CREATE UNIQUE INDEX verix2_imt_confirmed_query_uq
  ON public.verix2_events(query_id)
  WHERE event = 'imt_loaded' AND query_id IS NOT NULL
    AND metadata ->> 'resultConfirmed' = 'true';

-- Seed the currently deployed trigger body. The migration under test must repair its
-- invalid OLD.first_seen access for verix2_sessions before updating session presence.
CREATE OR REPLACE FUNCTION public.verix2_keep_seen_monotonic()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $function$
BEGIN
  IF OLD.last_seen IS NOT NULL AND (NEW.last_seen IS NULL OR NEW.last_seen < OLD.last_seen) THEN
    NEW.last_seen := OLD.last_seen;
  END IF;
  IF OLD.first_seen IS NOT NULL AND (NEW.first_seen IS NULL OR NEW.first_seen > OLD.first_seen) THEN
    NEW.first_seen := OLD.first_seen;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER verix2_installations_seen_monotonic
BEFORE UPDATE ON public.verix2_installations
FOR EACH ROW EXECUTE FUNCTION public.verix2_keep_seen_monotonic();
CREATE TRIGGER verix2_sessions_seen_monotonic
BEFORE UPDATE ON public.verix2_sessions
FOR EACH ROW EXECUTE FUNCTION public.verix2_keep_seen_monotonic();

ALTER TABLE public.verix2_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verix2_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verix2_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY verix2_installations_deny_public ON public.verix2_installations
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY verix2_sessions_deny_public ON public.verix2_sessions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY verix2_events_deny_public ON public.verix2_events
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.verix2_installations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.verix2_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.verix2_events TO service_role;
