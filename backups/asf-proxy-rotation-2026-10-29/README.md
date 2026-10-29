# VÉRIX — backup técnico ASF + pool de proxies
**Snapshot date:** 2026-10-29  
**Branch:** `backup/asf-proxy-rotation-2026-10-29`  
**Production function:** `asf-proxy-v1`, Supabase deployment version **33** (ACTIVE)

## Why this backup exists
Snapshot of the work to route the VÉRIX ASF vehicle-insurance lookup through the configured Webshare proxy pool, while preserving the existing GraphQL request shape and separating diagnostics from production.

## Production state at snapshot
- Supabase project ref: `onilkakbgpklxvxuxmks`
- Function slug: `asf-proxy-v1`
- Supabase version: `33`, ACTIVE
- Supabase artifact SHA-256: `8f59236ff65eda14723c8c06544cca2a86ba64c33a1c56b91f9456dd126f5fae`
- GitHub source: `supabase/functions/asf-proxy-v1/index.ts`
- GitHub commit introducing proxy-pool routing: `c423fb68fc7791b338efb99c00df5df9b8cdeba3`
- GitHub file blob at snapshot: `d79c86277867f4b51cb3354bcb8e36c9ea6cca83`
- Previous direct-fetch artifact hash (old baseline, v30/v32): `f33f2750cfad8c4793a835f14c9bdbc81527f111e95fdaf2cc02d09cdb1beab7`

## What changed in production
The original ASF query construction and transport shape were retained:
- URL: `https://ext01.asf.com.pt/api/src/?query=<URL-encoded GraphQL>`
- HTTP method: `POST`
- Request body: `null`
- Existing authorization/build token checks, plate normalization, date validation, error classification, diagnostics and response body are retained.
- Upstream fetch now uses `Deno.createHttpClient({ proxy: ... })`.
- Proxy endpoints are read from the Supabase Edge Function secret `PROXY_URLS`; one endpoint per line (commas/semicolons are also parsed).
- Credentials are read from secrets `PROXY_USERNAME` and `PROXY_PASSWORD`.
- The cursor advances round-robin **per Edge Runtime isolate**. Serverless isolates have independent cursors, so this is not a globally coordinated round-robin scheduler and it does not promise an exact 1-to-10 sequence across all concurrent requests.
- If the pool is missing or malformed, the function fails closed with `503 proxy_pool_not_configured`; it does not silently fall back to a direct ASF connection.
- Added response headers `X-Verix-ASF-Route: proxy` and `X-Verix-ASF-Proxy-Index`, and includes proxy index/host in sanitized anomaly logs. Proxy password and username are not logged.

## Private configuration — do not put these values in GitHub
The following secrets must exist in Supabase Edge Function Secrets:
1. `PROXY_URLS` — ten proxy URLs, one per line, formatted as `http://IP:PORT`
2. `PROXY_USERNAME` — Webshare username
3. `PROXY_PASSWORD` — Webshare password

The actual endpoint list and credentials are deliberately **not stored in this public repository or this backup documentation**. The original uploaded file contains credentials; keep it private. If Webshare rotates the password or endpoint list, update the Supabase secrets only.

## Diagnostics preserved in the repository
- `supabase/functions/runtime-proxy-pool-probe/index.ts` — test the pool against the fixed IP-check destination `https://api.ipify.org?format=json`; no ASF requests.
- `supabase/functions/runtime-asf-proxy-single-probe/index.ts` — one synthetic request through the first configured proxy. Note: this probe is fixed to the first pool entry and does not alter the production function.
- `supabase/functions/runtime-httpclient-probe/index.ts` — direct/custom HTTP client egress diagnostic.
- `supabase/functions/asf-proxy-v1/index.ts` — production relay source at this snapshot.

## Recorded test results

### Webshare proxy pool connectivity
Tested using `runtime-proxy-pool-probe`:
- Result: `ok: true`
- Configured endpoints: 10
- Successful endpoints: 10
- Distinct exit IPs: 10
- Latency range: 288–1,252 ms
- Mean latency from the ten returned timings: 793 ms
- Destination: `https://api.ipify.org?format=json`

This proves all ten proxy endpoints authenticated and produced distinct visible egress IPs at the time of the test. It does not prove every proxy remains available indefinitely.

### Single-proxy ASF connectivity
Tested using `runtime-asf-proxy-single-probe`:
- Proxy: first configured endpoint, `45.38.107.97:6014`
- Synthetic test plate: `ZZZZZZ` (not a real vehicle lookup)
- ASF HTTP status: 200
- Content type: JSON
- Response size: 297 bytes
- Elapsed: 598 ms
- GraphQL errors: 0
- `hasGraphQLData`: true
- `nodesCount`: 1

This proves a single synthetic GraphQL request returned a JSON GraphQL response through the first proxy. It is **not proof** of the content's meaning, that all ten proxies are accepted by ASF, or that real VÉRIX lookups will remain successful over repeated queries. A user-side production test after deployment must be recorded separately.

## Restore procedure
1. Check that Supabase secrets `PROXY_URLS`, `PROXY_USERNAME`, `PROXY_PASSWORD` are set privately before deployment.
2. Retrieve source at this snapshot from `supabase/functions/asf-proxy-v1/index.ts` on this backup branch.
3. Deploy only to function slug `asf-proxy-v1` in project `onilkakbgpklxvxuxmks`, keeping `verify_jwt=false` (the function itself authenticates using its build/client token).
4. Immediately re-read the deployed function metadata and run one authorized, normal VÉRIX lookup. Confirm response status/headers and logs before further test traffic.
5. For rollback to the prior direct-fetch build, retrieve the prior version's source from Git history/deployment backup and verify the target hash before deploying. Do not replace the current source with an unverified reconstruction.

## Operational cautions
- Never commit actual proxy credentials or the endpoint list to the public repo.
- Do not share or paste Supabase service-role keys or other project secrets.
- Proxy providers can change endpoint availability or authentication; re-run the connectivity diagnostic when the pool is updated.
- A successful IP echo test is not equivalent to ASF authorization or availability.
- The diagnostic probes are separate from production. Keep them JWT-protected.
- This branch is an isolated recovery snapshot; it is not a claim that GitHub branch-protection rules were configured.
