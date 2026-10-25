# VÉRIX Cloudflare IP diagnostic probe

This is an isolated, test-only Cloudflare Worker. It is not connected to the VÉRIX production frontend or the ASF function.

## Scope

- `GET /health`: authenticated health check.
- `GET /ip`: authenticated request to the fixed endpoint `https://api.ipify.org?format=json`.
- The Worker does not accept a caller-supplied upstream URL.
- No credentials should be committed to Git.
- The IP returned is the egress address observed by IPify for that request. Cloudflare does not guarantee that it changes on each call.

## Deploy

1. From the Cloudflare dashboard, create a Worker named `verix-cloudflare-ip-probe`.
2. Paste `worker.js` into the Worker editor, or deploy with Wrangler from this directory.
3. In Worker **Settings → Variables and Secrets**, add `PROBE_TOKEN` as a secret with a long random value. Do not use a token already used elsewhere.
4. Deploy the Worker and copy its `workers.dev` URL.
5. Call it with an authorization header:
   `curl -H "Authorization: Bearer $PROBE_TOKEN" "https://YOUR-WORKER-URL/ip"`
6. Repeat several times and compare `observedEgressIp`, `elapsedMs` and status codes.

## Test from Supabase

After the Worker is deployed, a separate Supabase diagnostic function can call `/ip` using a Supabase secret containing the Worker URL and another secret containing `PROBE_TOKEN`. That follow-up has not been wired in here.

## Important limitation

This checks connectivity and egress behavior only. It does not rotate identities, does not call ASF, and must not be used to evade a destination service's access controls or rate limits.
