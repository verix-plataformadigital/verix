# VÉRIX admin telemetry v3

## Production status

The additive Edge Function `admin-telemetry-v3` is deployed to Supabase project `onilkakbgpklxvxuxmks` (version 1). The current Admin UI still uses `stats-v2`; it has **not** been switched to this endpoint. This rollout therefore publishes the new API without replacing existing dashboard behavior.

## Design

- TypeScript/Deno Edge Function; read-only, no event ingestion and no database schema changes.
- Calls `verix2_admin_dashboard_v3` and `verix2_admin_live_presence` in parallel.
- Separates strict online presence (90-second lease, server receipt and client occurrence timestamps) from hourly activity.
- Uses the existing signed admin-token contract and keeps the service-role key server-side.
- Applies an 8-second timeout to each RPC, `Cache-Control: no-store`, restrictive CORS origins, safe count validation, and generic client-facing upstream errors.

## Endpoint

`GET /functions/v1/admin-telemetry-v3?view=dashboard`

Requires the existing admin bearer token in `Authorization`. The platform JWT gateway check is disabled for this function because the handler validates the application's own signed token, matching the existing `stats-v2` pattern.

## Remaining rollout work

1. Run authenticated acceptance tests using the Admin UI's real session/token.
2. Compare payloads and confirm the online count against the live-presence RPC.
3. Integrate the response into the Admin UI with a fallback to `stats-v2`, then test GitHub Pages build and smoke tests.
4. Identify and resolve the source still calling the obsolete `/functions/v1/telemetry` path; do not create an alias until the caller is identified.
5. Do not change the ASF engine as part of this work.
