-- Restore the narrowly scoped write privileges required by server-side counter-only ingestion.
-- RLS remains enabled and anon/authenticated retain no table access.
GRANT SELECT, INSERT, UPDATE ON TABLE public.verix_daily_error_types TO service_role;
