import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261008235800_atomic_telemetry_ingest.sql", import.meta.url),
  "utf8"
);
const endpoint = readFileSync(
  new URL("../../supabase/functions/telemetry-v2/index.ts", import.meta.url),
  "utf8"
);

describe("atomic telemetry ingestion", () => {
  it("uses one invoker-rights RPC for the complete batch", () => {
    expect(endpoint).toMatch(/db\.rpc\(\s*"verix2_ingest_telemetry"\s*,\s*\{/);
    expect(endpoint).toContain("p_events: events");
    expect(endpoint).toContain("p_installations: [...installations.values()]");
    expect(endpoint).toContain("p_sessions: [...sessions.values()]");
    expect(endpoint).not.toContain('db.from("verix2_events").upsert(events');
    expect(endpoint).not.toContain('db.from("verix2_installations").upsert([...installations.values()]');
    expect(endpoint).not.toContain('db.from("verix2_sessions").upsert([...sessions.values()]');
  });

  it("branches shared monotonic trigger fields by table row shape", () => {
    expect(migration).toContain("IF TG_TABLE_NAME = 'verix2_installations' THEN");
    expect(migration).toContain("ELSIF TG_TABLE_NAME = 'verix2_sessions' THEN");
    expect(migration).toContain("NEW.first_seen := OLD.first_seen;");
    expect(migration).toContain("NEW.started_at := OLD.started_at;");
    expect(migration).toContain("NEW.last_seen := OLD.last_seen;");
  });

  it("creates foreign-key parents before events inside the same function", () => {
    expect(migration).toContain("SECURITY INVOKER");
    const installationInsert = migration.indexOf("INSERT INTO public.verix2_installations AS current_installation");
    const sessionInsert = migration.indexOf("INSERT INTO public.verix2_sessions AS current_session");
    const eventInsert = migration.indexOf("INSERT INTO public.verix2_events (");
    expect(installationInsert).toBeGreaterThanOrEqual(0);
    expect(sessionInsert).toBeGreaterThan(installationInsert);
    expect(eventInsert).toBeGreaterThan(sessionInsert);
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(migration).toContain("v_events_inserted := v_events_inserted + 1;");
    expect(migration).toContain("v_written_events := v_written_events || jsonb_build_array(");
  });

  it("rolls back duplicate-only parent writes and rejects session identity collisions", () => {
    expect(migration).toContain("IF v_events_inserted = 0 THEN");
    expect(migration).toContain("USING ERRCODE = 'PZ001'");
    expect(migration).toContain("WHEN SQLSTATE 'PZ001' THEN");
    expect(migration).toContain("telemetry session ID maps to multiple installation IDs in the batch");
    expect(migration).toContain("telemetry session ID conflicts with its stored installation ID");
    const sessionInsert = migration.indexOf("INSERT INTO public.verix2_sessions AS current_session");
    const postUpsertIdentityGuard = migration.indexOf(
      "telemetry session ID conflicts with its stored installation ID after upsert",
      sessionInsert
    );
    const eventInsert = migration.indexOf("INSERT INTO public.verix2_events (");
    expect(postUpsertIdentityGuard).toBeGreaterThan(sessionInsert);
    expect(eventInsert).toBeGreaterThan(postUpsertIdentityGuard);
  });

  it("grants execution only to service_role", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb)");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb, jsonb, jsonb)");
    expect(migration).toContain("TO service_role;");
  });
});
