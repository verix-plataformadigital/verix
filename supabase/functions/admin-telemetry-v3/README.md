# VÉRIX admin telemetry v3

## Production status

The additive Edge Function `admin-telemetry-v3` is active in Supabase project `onilkakbgpklxvxuxmks`, version 2. The Admin dashboard integration is merged into `main` and the GitHub Pages build/deployment smoke tests succeeded on 22 October 2026.

The release pipeline and mocked contract tests are green. Authenticated browser acceptance is still pending: the production Admin session must call the endpoint and the displayed figures should be compared with the database RPC output before declaring real-world telemetry fully validated.

## Design

- TypeScript/Deno Edge Function; read-only, no event ingestion and no database schema changes.
- Calls `verix2_admin_dashboard_v3` and `verix2_admin_live_presence` in parallel.
- Separates strict server-observed online sessions (90-second lease, receipt and occurrence timestamps) from hourly activity.
- Uses the existing signed admin-token contract and keeps the service-role key server-side.
- Applies an 8-second timeout to each RPC, `Cache-Control: no-store`, restrictive CORS origins, safe count validation, and generic client-facing upstream errors.
- Exposes a testable request handler and has automated Deno tests for missing, invalid and expired tokens; CORS; supported routes; payload contract; and upstream failures.

## Endpoint

`GET /functions/v1/admin-telemetry-v3?view=dashboard`

Requires the existing Admin bearer token in `Authorization`. The platform JWT gateway check is disabled because the handler verifies the application's own signed token, matching the existing `stats-v2` pattern.

## Dashboard contract

The Admin block is independent from the existing Realtime presence cards. It displays server-observed sessions that sent `app_open` or `heartbeat` in the last 90 seconds, consultation requests recorded during the last hour, and installations seen during the last hour. Sessions, installations, tabs and people are not interchangeable units.

The dashboard polls the endpoint on the existing 10-second refresh cadence. On API failure it clears server-derived values rather than presenting old counts as current. The existing `stats-v2` endpoint remains responsible for historical analytics, consultation outcomes and the other Admin pages.

## Remaining acceptance work

1. Log in on the deployed Admin page and confirm the server telemetry status becomes `API confirmada`.
2. Compare `online_sessions` and `online_installations` shown by the API with the direct `verix2_admin_live_presence` RPC result.
3. Inspect Supabase invocation logs for HTTP status, latency and RPC failures once the real Admin client calls the endpoint.
4. Identify the source still calling the obsolete `/functions/v1/telemetry` path. No alias has been created, because its caller is not yet confirmed.
5. Keep the ASF engine and operational app source outside this telemetry task.
