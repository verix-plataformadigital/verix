-- Minimal restricted register of ASF "no record" lookup results.
-- This stores only the registration plate and query date/time for 90 days.
CREATE TABLE IF NOT EXISTS public.verix_insurance_no_cases (
  event_id text PRIMARY KEY,
  matricula text NOT NULL CHECK (matricula ~ '^[A-Z0-9]{6,8}$'),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);
COMMENT ON TABLE public.verix_insurance_no_cases IS
  'Restricted 90-day list of vehicle plates for which ASF returned no record. Not proof by itself that a vehicle has no insurance.';
CREATE INDEX IF NOT EXISTS verix_insurance_no_cases_occurred_idx
  ON public.verix_insurance_no_cases (occurred_at DESC);
CREATE INDEX IF NOT EXISTS verix_insurance_no_cases_expiry_idx
  ON public.verix_insurance_no_cases (expires_at);
ALTER TABLE public.verix_insurance_no_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verix_insurance_no_cases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.verix_insurance_no_cases TO service_role;
DO $cleanup$
DECLARE existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job
  WHERE jobname = 'verix_insurance_no_cases_expiry' LIMIT 1;
  IF existing_job_id IS NOT NULL THEN PERFORM cron.unschedule(existing_job_id); END IF;
  PERFORM cron.schedule(
    'verix_insurance_no_cases_expiry',
    '13 3 * * *',
    'DELETE FROM public.verix_insurance_no_cases WHERE expires_at <= now();'
  );
END
$cleanup$;
