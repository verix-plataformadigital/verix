-- Explicit default-deny policies for private VÉRIX operational tables.
-- These tables are accessed only through privileged server-side functions.
-- The policies do not grant new privileges and do not change service_role flows.
DO $$
BEGIN
  IF to_regclass('public.verix2_admin_dashboard_cache') IS NOT NULL THEN
    ALTER TABLE public.verix2_admin_dashboard_cache ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS verix2_admin_dashboard_cache_deny_public
      ON public.verix2_admin_dashboard_cache;
    CREATE POLICY verix2_admin_dashboard_cache_deny_public
      ON public.verix2_admin_dashboard_cache
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
    REVOKE ALL ON TABLE public.verix2_admin_dashboard_cache
      FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regclass('public.verix_insurance_no_cases') IS NOT NULL THEN
    ALTER TABLE public.verix_insurance_no_cases ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS verix_insurance_no_cases_deny_public
      ON public.verix_insurance_no_cases;
    CREATE POLICY verix_insurance_no_cases_deny_public
      ON public.verix_insurance_no_cases
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
    REVOKE ALL ON TABLE public.verix_insurance_no_cases
      FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regclass('verix_internal.pg_stat_statements_history') IS NOT NULL THEN
    ALTER TABLE verix_internal.pg_stat_statements_history ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS pg_stat_statements_history_deny_public
      ON verix_internal.pg_stat_statements_history;
    CREATE POLICY pg_stat_statements_history_deny_public
      ON verix_internal.pg_stat_statements_history
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
    REVOKE ALL ON TABLE verix_internal.pg_stat_statements_history
      FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;
