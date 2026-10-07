# VÉRIX Security Policy

## Repository security

The VÉRIX source repository is intended to be private. Production releases must be generated from this repository and must not expose source maps, secrets, service-role keys, or development credentials.

## Client-side security model

The VÉRIX browser client is treated as an untrusted environment. Client-side checks are anti-tamper and anti-copy measures, not a trust boundary. Sensitive authorization and access decisions are enforced server-side.

Production clients use:

- a server-registered build identifier;
- short-lived signed client authorization;
- strict origin checks for supported web deployments;
- server-side build revocation;
- protected backend relays;
- no source maps in production releases.

## Secrets

Never place the following in the client or repository:

- Supabase service-role keys;
- administrator secrets;
- signing secrets;
- API credentials;
- private certificates or signing keys.

Use Supabase/Cloudflare/GitHub secret stores for server-side credentials.

## Release security

A production release should be:

1. minified;
2. obfuscated without renaming externally referenced globals;
3. generated reproducibly from the private source;
4. published without source maps;
5. associated with a unique build identifier;
6. signed where the Windows distribution supports it.

Obfuscation increases reverse-engineering cost; it does not make JavaScript confidential.

## Incident response

If a build, credential, signing key, or backend authorization mechanism is suspected to be compromised:

1. revoke the affected VÉRIX build;
2. rotate the affected server secret;
3. invalidate active client tokens;
4. publish a clean build;
5. review backend and telemetry logs for abuse.

Do not disclose a newly discovered credential in an issue, pull request, commit message, or chat transcript.
