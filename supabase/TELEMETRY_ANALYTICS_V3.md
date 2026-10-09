# VÉRIX Telemetry Analytics v3

## Why this exists

The Admin panel must distinguish raw telemetry events from user actions and operational outcomes. The analytics layer must not silently infer a cause when telemetry is incomplete, duplicated, sampled or emitted by a legacy build.

## Event semantics

- **Heartbeat** is presence/liveness. It is counted separately and excluded from action totals.
- **Installation** is a technical browser/app installation identifier, not a person.
- **Session** is a client session identifier. Duration is derived from the first/last event timestamps where available; the parent session row is checked for stale timestamps.
- **ASF query** is identified by `query_id`. A confirmed start has a `vehicle_lookup`; a start inferred from `vehicle_insurance_pending` is explicitly counted as inferred.
- **Valid terminal result** is a single outcome type (`vehicle_insurance_yes`, `vehicle_insurance_no` or `vehicle_insurance_error`) at or after the start. Repeated terminal events are counted as quality signals, not extra queries. Conflicting outcomes are not assigned a result. Terminal events without a known start are reported as orphans.
- **Cinemómetro measurement** uses `operation_id`, installation and session to pair a calculation with its speed-entry event. The pair is deduplicated only when the recorded speed matches and the events are within three seconds. If no operation ID exists, the grouping basis is exposed as session/event rather than pretending it is a confirmed operation.
- **Telemetry schema** marks the instrumentation generation independently of the application version. Older events are labelled `legacy`; new client events use schema `3`.

## Time windows

- The 24-hour window is resettable and ends at the report timestamp.
- Seven-day and 30-day windows are rolling windows ending at the report timestamp; a reset of the 24-hour comparison does not truncate them.
- Cohort metrics are assigned to the time a query started. Event-time error counts and terminal events are separate measures and must not be presented as if they were the same denominator.

## Coverage and interpretation

- Overall ASF diagnostic coverage is measured over terminal outcomes; error-only diagnostic coverage is measured separately.
- Client and Cinemómetro detail coverage are reported by application version and telemetry schema, so a legacy build cannot make a newer build look complete (or vice versa).
- A sample is marked as sampled when the exact server count exceeds the number of detail rows returned. Detail samples are not used as global totals.
- Empty data is shown as unavailable/insufficient, not silently interpreted as zero or as proof that no issue exists.
- Cinemómetro telemetry added by schema 3 includes only operational measurement fields needed for aggregate analysis. It omits operator identifiers and device serials from the new `cin` snapshot. ASF diagnostic metadata has a separate historical schema and should be reviewed independently for data minimization.

## Ingestion integrity

The `verix2_ingest_events(jsonb)` RPC is intended to insert installations, sessions and event rows in one transaction. Event IDs and query IDs are still deduplicated at the ingestion boundary, and the database applies uniqueness constraints as a second line of defence. Session presence timestamps are monotonic.

The Edge Function allowlist and database allowlist must match. The Node contract test checks this, alongside the critical metric wiring.

## Deployment order

Do not publish the updated Admin ahead of its backend contract.

1. Validate the migration in a disposable Supabase branch/staging database.
2. Apply `20261009025000_telemetry_pipeline_rebuild.sql`.
3. Deploy `telemetry-v2` (atomic ingestion and schema preservation).
4. Deploy `stats-v2` (canonical analytics RPC and detail sampling).
5. Publish the Admin changes and verify version/schema coverage after new events arrive.

The migration and Edge Function changes are not applied to production by this repository change alone. Existing historical events are not rewritten; the new analytics layer corrects their interpretation where the source fields permit it and exposes historical gaps explicitly.
