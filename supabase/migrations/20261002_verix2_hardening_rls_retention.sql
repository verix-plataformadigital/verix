-- Mirrors production migration: verix2_hardening_rls_retention_20261002.sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['verix2_events','verix2_installations','verix2_sessions','verix2_rate_limits','verix2_dashboard_state'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "verix2_deny_public" ON public.%I', t);
    EXECUTE format('CREATE POLICY "verix2_deny_public" ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;
DROP INDEX IF EXISTS public.period_resets_reset_at_idx;
DROP INDEX IF EXISTS public.events_item_id_idx;
DROP INDEX IF EXISTS public.events_module_open_occurred_idx;
DROP INDEX IF EXISTS public.sessions_installation_last_seen_idx;
CREATE OR REPLACE FUNCTION public.verix2_cleanup_old_data(p_before timestamptz DEFAULT now() - interval '90 days')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE deleted_events bigint := 0; deleted_rate_limits bigint := 0;
BEGIN
 DELETE FROM public.verix2_events WHERE occurred_at < p_before; GET DIAGNOSTICS deleted_events = ROW_COUNT;
 DELETE FROM public.verix2_rate_limits WHERE window_start < now() - interval '24 hours'; GET DIAGNOSTICS deleted_rate_limits = ROW_COUNT;
 RETURN jsonb_build_object('ok',true,'before',p_before,'deleted_events',deleted_events,'deleted_rate_limits',deleted_rate_limits);
END; $$;
REVOKE ALL ON FUNCTION public.verix2_cleanup_old_data(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_cleanup_old_data(timestamptz) TO service_role;
