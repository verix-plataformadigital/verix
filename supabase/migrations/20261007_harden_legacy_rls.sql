-- Make legacy telemetry tables explicitly unreadable/writable by public roles.
-- These tables are frozen; current telemetry uses verix2_* tables.
-- Existing admin/reporting SQL functions run as postgres and are unaffected.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events','installations','sessions','period_resets','verix_metric_resets'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "verix_legacy_deny_public" ON public.%I', t);
    EXECUTE format('CREATE POLICY "verix_legacy_deny_public" ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;
