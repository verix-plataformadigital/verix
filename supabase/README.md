# VÉRIX Supabase

The production Supabase project is mirrored here for version control.

## Edge Functions

- telemetry-v2
- stats-v2
- admin-auth-v2
- hourly-history-v2 (legacy; retained only for compatibility while old clients are retired)

## Database

Migrations in this directory are the source of truth for changes made after the current production baseline. The existing production schema predates this repository mirror; keep the production snapshot and migration history synchronized before any destructive change.

## Release rule

1. Update source in GitHub.
2. Apply database migrations.
3. Deploy the Edge Function from the matching source.
4. Verify telemetry and Admin metrics.
5. Only then publish the VÉRIX build.
