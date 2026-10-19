-- Explicitly deny direct API-role access to the private Admin V3 cache.
-- The cache is consumed by the SECURITY DEFINER Admin RPC; anon/authenticated
-- already have no table grants. This makes the intended denial explicit and
-- consistent with the other private verix2 tables without changing RPC behavior.
CREATE POLICY verix2_admin_v3_cache_deny_public
ON public.verix2_admin_v3_cache
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
