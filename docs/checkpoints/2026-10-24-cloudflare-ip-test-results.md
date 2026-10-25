# Cloudflare IP probe — results and recovery state

**Date:** 2026-10-24  
**Purpose:** Record the outcome of the isolated online test. This does not change the production VÉRIX app or ASF engine.

## Recovery point

- Production baseline branch: `main`
- Baseline SHA: `b70390c03dea4020c8503817df2e9a91bdc2ca31`
- Recovery branch: `checkpoint/pre-cloudflare-worker-2026-10-24`
- Experimental branch: `experiment/cloudflare-ip-diagnostic`
- Pull request: [#169](https://github.com/verix-plataformadigital/verix/pull/169) (keep unmerged unless separately approved).

## Online temporary deployment

- Workflow: [Cloudflare temporary IPify probe](https://github.com/verix-plataformadigital/verix/actions/runs/40127824877)
- Temporary Worker URL: `https://verix-cloudflare-ip-temp-probe.determined-particle.workers.dev/ip`
- It calls only the fixed destination `https://api.ipify.org?format=json`.
- The temporary account is not claimed. Per Cloudflare's documented temporary deployment flow, the account expires after about 60 minutes unless claimed. The claim URL was deliberately withheld from public workflow logs.
- This temporary Worker is not wired into VÉRIX or the ASF path.

## Result

Three sequential calls succeeded:

| Attempt | HTTP status | Observed egress IP | Elapsed time |
|---|---:|---|---:|
| 1 | 200 | `2a06:98c0:3600::103` | 406 ms |
| 2 | 200 | `2a06:98c0:3600::103` | 228 ms |
| 3 | 200 | `2a06:98c0:3600::103` | 55 ms |

**Interpretation:** The Worker deployed and can make outbound requests. All three calls observed the same egress IP; this test does not demonstrate per-request IP rotation, and Cloudflare Workers do not guarantee that each outbound request uses a different IP.

## Corrections made during testing

- Initial checks returned a Cloudflare HTML 404 immediately after deployment; added a short wait for route propagation and sanitized diagnostics.
- The next run reached the Worker but returned 502 because Cloudflare Workers do not support `redirect: "error"` in `fetch()`. Removed that unsupported option from both probe implementations.
- After the fix, the temporary deployment test passed with 3/3 responses at HTTP 200.
- A separate permanent-deployment workflow was attempted, but skipped because the GitHub repository lacks the Cloudflare secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_PROBE_TOKEN`.

## Rollback

1. Do not merge PR #169 into `main`.
2. To return to the recorded production state, use branch `checkpoint/pre-cloudflare-worker-2026-10-24` (SHA above) as the baseline; it preserves the production code tree as it stood before the experiment.
3. The temporary Cloudflare account expires automatically if unclaimed; no VÉRIX production routes point to it.
4. If a future permanent Worker is created, remove only that experiment-specific Worker and secrets to roll it back.
5. Do not alter `asf-proxy-v1`, `verix-app.html`, production telemetry, or production data as part of this test.

## Current status

- [x] Recovery baseline branch created.
- [x] Experiment code and workflow kept on `experiment/cloudflare-ip-diagnostic`.
- [x] Temporary Cloudflare Worker deployed online.
- [x] Three IPify requests returned HTTP 200.
- [x] Claim URL kept out of public logs.
- [ ] Permanent Cloudflare deployment: not configured, because account credentials are not available in GitHub Actions.
- [ ] VÉRIX integration: intentionally not implemented.
