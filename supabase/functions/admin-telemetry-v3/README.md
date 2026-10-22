# VÉRIX admin telemetry v3 — isolated candidate

## Safety boundary

This branch is a review candidate only. It is not deployed and must not be merged or published without explicit approval. It does not modify the operational app, the ASF engine, event ingestion, existing database objects, or the production stats-v2 function.

## What this changes

The current production stats-v2?detail=dashboard-v3 contract calls verix2_admin_live_summary_v1, which reports activity over time windows but does not return the strict online_now session count. The database already has verix2_admin_live_presence, which derives online sessions using a 90-second lease and validates both server receipt time and client occurrence time.

The candidate admin-telemetry-v3 endpoint calls the existing dashboard aggregate and authoritative live-presence RPC in parallel, then returns separate dashboard and presence objects. It is TypeScript/Deno, not an HTML rewrite. It is read-only and uses the service-role key only server-side.

## Before any deployment

1. Confirm the exact admin client and its authentication token contract.
2. Add automated tests for token expiry, malformed tokens, CORS origins, RPC timeouts/failures, and presence response validation.
3. Run Deno type-check and tests locally against a non-production Supabase project.
4. Resolve the legacy /functions/v1/telemetry traffic separately. Do not alias or re-enable it until the source is identified.
5. Compare response fields against the current admin UI and decide whether the UI should migrate to this contract. Do not change the production client in the same release.
6. Deploy only to a non-production Supabase project, run acceptance tests, then request explicit approval for any production rollout.

## Known limitation

This candidate fixes the identified API contract gap in isolation; it does not yet establish the caller of the legacy endpoint, and it is not a complete production replacement. It intentionally contains no event-ingestion code and makes no database schema changes.