-- Restrict the optional auxiliary admin aggregate when it exists in this database.
-- It is not part of every installation's migration history, so this migration must remain replay-safe.
DO $$
BEGIN
  IF to_regprocedure('public.verix2_admin_auxiliary_fast(timestamp with time zone)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.verix2_admin_auxiliary_fast(timestamp with time zone) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.verix2_admin_auxiliary_fast(timestamp with time zone) TO service_role';
  END IF;
END
$$;
