# VÉRIX Admin availability incident — 2026-10-30

## Confirmed production findings

- Supabase project state was ACTIVE_HEALTHY; that did not imply the PostgREST Data API was healthy.
- Production PostgREST logs identify version 14.5.
- Between 16:10 and 17:09 UTC, logs contained 9,157 PGRST002 schema-cache failures, 1,713 HTTP 503 responses and 237 HTTP 504 responses for `verix2_consume_rate_limit`.
- PostgreSQL/PostgREST logs also recorded SQLSTATE 57014 statement timeouts.
- A direct `EXPLAIN ANALYZE` measurement of `SELECT name FROM pg_timezone_names` took 54.6 seconds and returned 1,196 rows. The PostgREST schema-cache load had an approximately 58-second statement timeout. This is a credible bottleneck on this managed Postgres environment.
- The official PostgREST v16.0 changelog records that `Prefer: timezone` no longer requires the schema cache (issue #5100); earlier versions needed timezone-name metadata and could incur slow filesystem lookups. Production was on PostgREST 14.5 at the time of the incident.
- The database's `extensions.pgrst_ddl_watch()` event trigger sends `NOTIFY pgrst, 'reload schema'` for CREATE/ALTER TABLE operations outside `pg_temp`, including operations in the `realtime` schema.
- `pg_stat_statements` shows repeated CREATE/ALTER operations on `realtime.messages_*` partitions, including repeated owner changes to `supabase_realtime_admin`. This is structurally capable of triggering repeated schema-cache reloads and matches the pattern described in Supabase issue #50043. The available logs did not establish a precise timestamp-by-timestamp correlation, so this is a strong additional lead for Supabase to investigate, not a proven sole cause.
- The rate-limit RPC also performed a full-table DELETE on every request. The rate-limit table showed 513,221 sequential scans and 60,230,544 tuples read since the last statistics reset. The successful daily cleanup job already removes expired rows, making per-request cleanup redundant.

## Required Supabase platform action

Ask Supabase to:
1. Upgrade/backport the PostgREST v16.0 #5100 timezone/schema-cache improvement to the managed PostgREST service.
2. Investigate the repeated Realtime partition maintenance DDL and its interaction with `pgrst_ddl_watch`, as seen in Supabase issue #50043.
3. Confirm whether the managed Realtime partition maintenance can avoid emitting redundant schema reloads for internal `realtime.messages_*` partitions.
4. Confirm the underlying cause of the observed schema-cache timeouts and whether any managed-service remediation has been applied.

Do not shadow `pg_catalog.pg_timezone_names`, change the authenticator search path, or disable/alter Supabase-managed event triggers as a workaround.

## Recovery observed on 30 October

- The Admin cache refresh cron (job 5) succeeded at 17:50, 17:55 and 18:00 UTC after earlier repeated `job startup timeout` failures.
- The 18:00 UTC refresh completed in approximately 15 seconds.
- At 18:00 UTC, a read through `verix2_admin_dashboard_v3(now(), false)` returned the cached dashboard in 35.3 ms. The cache payload was generated at 18:00:00 UTC and refreshed at 18:00:15 UTC.
- The latest 15-minute log query at approximately 18:00 UTC returned no PGRST002 or statement-timeout events; recent `admin-auth-v2` v20 and `stats-v2` v102 calls returned HTTP 200/204.
- This demonstrates temporary recovery of the database/API path and cache refresh, not an end-to-end verification of the browser Admin or a permanent resolution of the managed PostgREST issue.

## Admin source cleanup in this PR

- Reduce duplicate presence and server-telemetry cards on the overview.
- Remove the duplicate hourly graph from the overview; retain the hourly graph in Utilização.
- Remove the three-minute in-progress-style metric and use the server-confirmed last-hour consultation count.
- Align the operational no-record list's interface text with the 90-day backend retention.
- Remove duplicate mobile CSS declarations.

The updated `admin_v2.html` is on this draft PR branch only. It has not been published to GitHub Pages or deployed as a new Admin release.

## Rate-limit optimization — applied

Migration `remove_rate_limit_per_request_full_scan_20261030` was successfully applied in production. It removes the full-table DELETE from every `verix2_consume_rate_limit` invocation; the existing daily cleanup job remains responsible for expired rows.

A production smoke test with limit 2 returned `true, true, false`, preserving the intended rate-limit behavior. The live function definition was checked after migration and contains no per-request DELETE.

## Scope

No ASF relay, ASF lookup logic, or published operational VÉRIX 1.4 assets were modified.
