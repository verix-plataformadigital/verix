DO $$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.verix2_dashboard_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  reset_24h_at timestamptz,
  reset_all_at timestamptz
);

CREATE TABLE public.verix2_installations (
  installation_id text PRIMARY KEY,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  app_version text,
  device_type text,
  browser text,
  os text
);

CREATE TABLE public.verix2_sessions (
  session_id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES public.verix2_installations(installation_id),
  tab_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.verix2_events (
  event_id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES public.verix2_installations(installation_id),
  session_id text REFERENCES public.verix2_sessions(session_id),
  tab_id text,
  query_id text,
  event text NOT NULL,
  module text,
  occurred_at timestamptz NOT NULL,
  app_version text,
  device_type text,
  browser text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.verix2_all_start(p_now timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT greatest(
    coalesce((SELECT reset_all_at FROM public.verix2_dashboard_state WHERE singleton=true),
             '1970-01-01T00:00:00Z'::timestamptz),
    '1970-01-01T00:00:00Z'::timestamptz
  );
$$;

INSERT INTO public.verix2_dashboard_state(singleton,reset_24h_at,reset_all_at)
VALUES(true, now()-interval '24 hours', now()-interval '45 days');
