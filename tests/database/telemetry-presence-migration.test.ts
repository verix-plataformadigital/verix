import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261008232530_harden_telemetry_presence.sql", import.meta.url),
  "utf8"
);

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("telemetry presence migration safeguards", () => {
  it("keeps PostgreSQL dollar-quote delimiters balanced", () => {
    expect(occurrences(migration, "$$") % 2).toBe(0);
    expect(occurrences(migration, "$guard$") % 2).toBe(0);
    // Six independent POSITION guards must each have an opening and closing tag.
    expect(occurrences(migration, "$guard$")).toBe(12);
  });

  it("rejects a rewrite that loses required online and insurance query predicates", () => {
    const doStart = migration.indexOf("DO $$");
    const triggerFunction = migration.indexOf("create or replace function public.verix2_keep_seen_monotonic()");
    expect(doStart).toBeGreaterThanOrEqual(0);
    expect(triggerFunction).toBeGreaterThan(doStart);

    const rewrite = migration.slice(doStart, triggerFunction);
    const guardAt = rewrite.indexOf("IF position(");
    const executeAt = rewrite.indexOf("EXECUTE d;");
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(executeAt).toBeGreaterThan(guardAt);
    expect(rewrite).toContain("RAISE EXCEPTION 'verix2_admin_analytics rewrite did not retain required presence and query predicates'");

    for (const required of [
      "'online_now',(SELECT count(DISTINCT installation_id) FROM (",
      "'active_10m',(SELECT count(DISTINCT installation_id) FROM (",
      "SELECT installation_id FROM public.verix2_sessions WHERE last_seen >= p_now-interval '5 minutes'",
      "SELECT installation_id FROM ev WHERE occurred_at >= p_now-interval '5 minutes'",
      "SELECT installation_id FROM public.verix2_sessions WHERE last_seen >= p_now-interval '10 minutes'",
      "WHERE event IN('vehicle_lookup','vehicle_insurance_pending','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') AND query_id IS NOT NULL"
    ]) {
      expect(rewrite).toContain(required);
    }

    expect(rewrite.indexOf("EXECUTE d;")).toBeGreaterThan(rewrite.indexOf("IF position("));
    expect(rewrite).toContain("END $$;");
  });
});
