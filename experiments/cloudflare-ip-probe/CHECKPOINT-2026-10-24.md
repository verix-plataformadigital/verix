# VÉRIX checkpoint — Cloudflare IP probe experiment

**Checkpoint created:** 2026-10-24  
**Purpose:** Preserve a known rollback point before attempting to deploy the Cloudflare diagnostic Worker.

## Baseline / rollback anchor

- Production/default branch: `main`
- Baseline commit before this experiment: `b70390c03dea4020c8503817df2e9a91bdc2ca31`
- Baseline commit message: `Restore VÉRIX Admin V3 and telemetry from 22 Oct`
- Experiment branch: `experiment/cloudflare-ip-diagnostic`
- Pull request: [#169](https://github.com/verix-plataformadigital/verix/pull/169), draft, not merged at checkpoint review.
- The experiment must remain separate from `main` until explicitly reviewed.

## Supabase state observed at checkpoint

Project: `verix-telemetria` (`onilkakbgpklxvxuxmks`), region `eu-central-1`.

- `runtime-httpclient-probe`: version 2, JWT verification enabled. Diagnostic calls only to IPify; used to confirm that the custom client API is exposed in the Edge Runtime.
- `runtime-proxy-probe`: version 1, JWT verification enabled. Proxy test function; checks only the fixed IPify endpoint and expects secrets `PROXY_URL`, optionally `PROXY_USERNAME` and `PROXY_PASSWORD`.
- `asf-proxy-v1`: version 25 when inspected before this experiment. Do not edit or redeploy as part of this test.
- No change to `verix-app.html`, production frontend, existing telemetry functions, database schema, or ASF logic was made for this Cloudflare experiment.

## Experiment files

- `experiments/cloudflare-ip-probe/worker.js`
- `experiments/cloudflare-ip-probe/wrangler.toml`
- `experiments/cloudflare-ip-probe/README.md`

The Worker contacts only `https://api.ipify.org?format=json`, accepts no arbitrary target URL, and requires a `PROBE_TOKEN` secret. It does not guarantee a different egress IP per call and must not be used to bypass a destination service's access controls or rate limits.

## Current deployment status at checkpoint

- Worker code committed to the experiment branch.
- Cloudflare deployment had **not** yet been confirmed.
- No Cloudflare account/API token is accessible through the current connector, so publication must be done through an authorized Cloudflare credential or a GitHub Actions secret already configured by the repository owner.
- No production route points at the experimental Worker.

## Rollback procedure

1. Leave PR #169 unmerged or close it; do not merge the experiment into `main`.
2. If deployed, disable/delete only the Cloudflare Worker named `verix-cloudflare-ip-probe` in Cloudflare.
3. Remove only the experiment-specific secret `PROBE_TOKEN` from that Worker (and any experiment-only GitHub secrets if no longer needed).
4. Do not delete or modify `asf-proxy-v1`, `verix-app.html`, production telemetry, or production secrets.
5. Supabase diagnostic functions `runtime-httpclient-probe` and `runtime-proxy-probe` are separate diagnostics. Leave them in place unless separately deciding to remove them; they do not route the VÉRIX production ASF traffic.

## Success criteria before any production integration

- Worker successfully deployed and authenticated.
- Multiple sequential IPify tests return valid responses with measured timings.
- Results interpreted as observed Cloudflare egress behavior only; no assumption that IPs rotate.
- Any future integration is a separate change and must not modify ASF production code as part of this experiment.
