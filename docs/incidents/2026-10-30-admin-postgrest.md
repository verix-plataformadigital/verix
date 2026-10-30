# VÉRIX Admin availability incident — 2026-10-30

## Confirmed production findings

- Supabase project state: ACTIVE_HEALTHY; this does not imply the PostgREST Data API is healthy.
- PostgREST version in production logs: 14.5.
- Between 16:10 and 17:09 UTC, logs contained 9,157 PGRST002 schema-cache failures, 1,713 HTTP 503 responses and 237 HTTP 504 responses for `verix2_consume_rate_limit`.
- Postgres logs show repeated SQLSTATE 57014 statement timeouts from PostgREST's `authenticator` role.
- Direct measurement: `EXPLAIN (ANALYZE, BUFFERS, TIMING ON, FORMAT JSON) SELECT name FROM pg_timezone_names` took 54.6 seconds and returned 1,196 rows. PostgREST's schema-cache load is configured with a 58-second statement timeout, leaving almost no headroom.
- This matches PostgREST issue #5100: `pg_timezone_names` enumerates timezone files and can be very slow on network storage. PostgREST PR #5128 removed timezone names from the schema cache in v16; production is running PostgREST 14.5.

## Required platform action

Ask Supabase to upgrade the managed PostgREST service to a release containing the #5128 change, or apply an equivalent backport/disable timezone-name enumeration. Do not try to shadow `pg_catalog.pg_timezone_names` or change the authenticator search path as a workaround.

## Related Admin routing correction

The secure release builder emits the Admin PWA at `dist/admin/index.html`. The deployed `verix-admin-pwa` function previously proxied `/verix/admin-proxy/`, which did not match the build output. The function has been corrected to proxy `/verix/admin/` and deployed as version 7.

## Scope

No ASF relay, ASF lookup logic, or published operational VÉRIX 1.4 assets were modified.
