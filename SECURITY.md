# VÉRIX Security Policy

## 1. Source repository confidentiality

The VÉRIX source repository **should remain private in the final production architecture**. While this repository is public, the complete clear-text source can be inspected and copied; obfuscation does not make it confidential.

While the repository is public, anyone can download the full clear-text `verix-app.html` and `admin_v2.html`. Client-side obfuscation becomes almost useless if the original source is public.

**Temporary state:** the repository is currently public so GitHub Pages can serve the current production site on this account. The intended final architecture is a private source repository publishing only the obfuscated `dist/` output to a separate public production repository.

## 2. GitHub Pages (only production channel)

This project deploys **only** to GitHub Pages.

On every push to `main` (or via manual trigger), the workflow `.github/workflows/deploy-pages.yml`:

1. Runs the secure build (`npm run build:secure`)
2. Publishes **only** the contents of `dist/` (obfuscated)
3. Never publishes the clear-text source files from the repository root

**One-time setup required:**
1. Go to **Settings → Pages**
2. Under **Build and deployment → Source**, choose **GitHub Actions**
3. Save

After that, every push to `main` runs the secure build and integrity checks before the live site is updated.

Live URL will be:
`https://verix-plataformadigital.github.io/verix/`

## 3. Client-side security model

The browser client is treated as an **untrusted environment**.

Client-side protections (obfuscation, domain lock, self-defending code, debug protection, disabled console) raise the cost of reverse-engineering. They are **not** a trust boundary.

All real authorization and sensitive logic must stay server-side:

- short-lived signed tokens (`verix-gate-v1`)
- build identifier validation
- origin checks
- rate limiting
- ASF / external service relays (never call them directly from the browser with secrets)
- admin authentication (`admin-auth-v2`)

## 4. What the secure build does

The release pipeline uses two profiles deliberately:

- **Standard scripts:** compacting, string-array transformations, domain lock and selected anti-debug protections.
- **Critical legacy runtime:** conservative compatibility profile. Control-flow flattening, self-defending and debug-protection are disabled for the large operational script so that runtime semantics remain deterministic.
- **Telemetry/security runtime:** excluded from heavy obfuscation and checked explicitly after packaging.
- No source maps are published.
- Every production build receives a unique `build_id`, injected into the client and bound to the short-lived signed gate token.
- The Pages deployment is gated by release integrity checks before the artifact is published.

Obfuscation increases reverse-engineering cost. It does **not** make JavaScript confidential. The real trust boundary remains the server-side gate, rate limiting and ASF relay.

## 5. Secrets — never in the client or repository

Never commit or embed:

- Supabase service-role keys
- `VERIX_ADMIN_PASSWORD` / `VERIX_ADMIN_SECRET`
- `VERIX_GATE_SECRET`
- any API credentials or private certificates

Store them only in Supabase / GitHub Secrets.

## 6. Windows portable host

The Windows host disables DevTools, context menu and downloads. Navigation is locked to the production VÉRIX host, with an explicit allow-list for the official external services opened by the application (ASF, ERRU/IMT, INEM and Waze). Keep shipping only the WebView2 host.

## 7. Incident response

If a build, credential, or authorization mechanism is suspected compromised:

1. Revoke the affected build ID (server-side)
2. Rotate the affected secret
3. Invalidate active client / admin tokens
4. Push a new commit to `main` (triggers a clean secure deploy)
5. Review telemetry and logs for abuse

Do **not** disclose a newly discovered credential in an issue, PR, commit message, or chat.

## 8. Hard limits of client-side protection

Anyone determined enough can still capture traffic or reconstruct logic given enough time.

Therefore the real protection is:

1. **Private source repository**
2. **Server-side enforcement**
3. **Only obfuscated assets served on GitHub Pages**
