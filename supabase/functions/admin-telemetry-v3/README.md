# VÉRIX admin telemetry v3

## Production status

The additive Edge Function `admin-telemetry-v3` is deployed in Supabase project `onilkakbgpklxvxuxmks`. PR #152 connects the Admin dashboard to it, pending the deployment workflow and authenticated browser acceptance checks.

## Design

- TypeScript/Deno Edge Function; read-only, no event ingestion and no database schema changes.
- Calls `verix2_admin_dashboard_v3` and `verix2_admin_live_presence` in parallel.
- Separates strict server-observed online sessions (90-second lease, receipt and occurrence timestamps) from hourly activity.
- Uses the existing signed admin-token contract and keeps the service-role key server-side.
- Applies an 8-second timeout to each RPC, `Cache-Control: no-store`, restrictive CORS origins, safe count validation, and generic client-facing upstream errors.
- Exposes a testable request handler and has automated Deno tests for auth expiry/invalid tokens, CORS, supported routes, payload contract and upstream failure handling.

## Endpoint

`GET /functions/v1/admin-telemetry-v3?view=dashboard`

Requires the existing admin bearer token in `Authorization`. The platform JWT gateway check is disabled for this function because the handler validates the application's own signed token, matching the existing `stats-v2` pattern.

## Dashboard contract

The new Admin block is independent from the existing Realtime presence cards. It displays server-observed sessions that sent `app_open` or `heartbeat` in the last 90 seconds, consultation requests recorded during the last hour, and installations seen during the last hour. Sessions, installations, tabs and people are not interchangeable units.

The dashboard polls the endpoint on the existing 10-second refresh cadence. On API failure it clears server-derived values rather than presenting old counts as current. The existing `stats-v2` endpoint remains responsible for historical analytics, consultation outcomes and the other Admin pages.

## Still required for full acceptance

1. After deployment, log in through the real Admin page and confirm the server telemetry status becomes `API confirmada`.
2. Compare `online_sessions` and `online_installations` with the direct `verix2_admin_live_presence` RPC result.
3. Inspect Supabase invocation logs for status, latency and RPC failures.
4. Identify the source still calling the obsolete `/functions/v1/telemetry` path; do not create an alias until the caller is identified.
5. Do not change the ASF engine as part of this work.
