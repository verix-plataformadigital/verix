-- Give PostgREST's schema introspection enough time on the constrained Nano compute.
-- Existing PostgREST pool connections may need a reconnect before this role setting applies.
ALTER ROLE authenticator SET statement_timeout = '30s';

-- Rebuild PostgREST configuration and schema metadata after the role change.
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
