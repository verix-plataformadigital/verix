# VÉRIX telemetry reconstruction — audit and contract

Status: in progress on `reengineering-v2`. This document and the analytics module are not a production cutover. Do not merge or deploy as part of this work until the dashboard integration and regression suite are complete.

## Evidence from the live database (read-only inspection, 2026-10-09)

- `verix2_events`: 68,105 rows, 2026-09-24 10:51:59 UTC through 2026-10-08 20:58:18 UTC.
- `events` (legacy): 54,982 rows, 2026-09-19 through 2026-09-22. These are different schemas and time ranges; adding them into one undifferentiated KPI is not valid.
- V2 contains 40,700 `heartbeat` events. These are liveness signals, not user counts or lookup counts.
- V2 contains 4,730 `vehicle_lookup`, 5,017 `vehicle_insurance_pending`, 2,290 `vehicle_insurance_yes`, 1,909 `vehicle_insurance_no`, 757 `vehicle_insurance_error` and 4,273 `imt_loaded` events.
- Of 4,273 `imt_loaded` events, only 4,177 distinct `query_id` values exist. The raw event total therefore overstates unique query associations by 96 events.
- Query-bearing events must be correlated by `query_id`. Events without it remain observable as uncorrelated events and must not be silently counted as unique queries.

## Canonical interpretation rules

1. **Event count** is the number of accepted event rows. Label it as events.
2. **Lookup started** is a distinct `query_id` with `vehicle_lookup`, not the number of rows across all lookup lifecycle events.
3. **Outcome** is one canonical state per query. A repeated identical terminal event increments duplicate diagnostics, not completed-query counts.
4. **Contradictory terminal outcomes** (for example both `vehicle_insurance_yes` and `vehicle_insurance_no` for one query) are classified as a data-integrity conflict and excluded from success/failure totals until investigated.
5. **Pending** is not a completed result. A pending event without a terminal result remains pending.
6. **Missing query ID** is a quality/coverage metric. It is not assigned a synthetic query identity during reporting.
7. **Active installation** is derived from the latest valid heartbeat per installation and a declared TTL. Heartbeat volume is never an active-user metric.
8. **IMT result** is counted at most once per query for query-level reporting, while raw IMT event volume remains separately available.
9. **Time windows** filter by event occurrence time in UTC. Window boundaries must be applied before correlation and aggregation.
10. **Legacy history** must remain a separately labelled series until a version-aware mapping and overlap policy are explicitly tested.

## Implementation

`src/services/telemetry/telemetry-analytics.ts` contains pure deterministic reducers for query lifecycle and heartbeat presence. `tests/services/telemetry/telemetry-analytics.test.ts` covers full lifecycle, duplicate terminal events, contradictory outcomes, missing IDs, pending state and heartbeat TTL.

## Remaining work before considering this complete

- Integrate these reducers into the `stats-v2` response and dashboard renderers; preserve existing response compatibility or version the contract deliberately.
- Add DB-backed fixture tests for timezone boundaries, repeated batches, delayed/out-of-order events, events with missing timestamps, session/installation identity changes and multiple final states.
- Reconcile event ingestion acknowledgements with actual inserted rows (idempotency) and distinguish duplicate delivery from a rejected event.
- Add dashboard labels/tooltips that distinguish raw events, unique queries, installations, sessions and active installations.
- Compare dashboard totals with independent SQL queries against the same UTC windows.
- Run unit tests, typecheck, edge-function typecheck, integration tests and browser smoke tests on the exact branch head.
- Keep production `main`, deployed Edge Functions and production schema unchanged until the PR is reviewed and all gates pass.

## External technical references reviewed

- Supabase Database Functions / RPC: https://supabase.com/docs/guides/database/functions
- Supabase Edge Functions architecture and idempotent short-lived execution: https://supabase.com/docs/guides/functions
- Google Analytics hierarchy and distinction between users, sessions and events: https://support.google.com/analytics/answer/11080067?hl=en
- Google Analytics custom event counting and event parameters: https://support.google.com/analytics/answer/12229021?hl=en-EN

These references support the general measurement and transaction design; the actual VÉRIX semantics are defined by the database schema and its event lifecycle, not copied from an analytics vendor.
