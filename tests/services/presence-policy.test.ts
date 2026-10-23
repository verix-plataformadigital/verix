import { describe, expect, it } from "vitest";
import { countOnline, isOnline, ONLINE_TTL_MS } from "../../src/services/telemetry/presence-policy";

describe("presence policy", () => {
  const now = 1_000_000;

  it("considera online uma instalação dentro do TTL", () => {
    expect(isOnline(now - 1, now)).toBe(true);
    expect(isOnline(now - ONLINE_TTL_MS + 1, now)).toBe(true);
  });

  it("expira exatamente no limite do TTL", () => {
    expect(isOnline(now - ONLINE_TTL_MS, now)).toBe(false);
  });

  it("não considera atividade futura como presença válida", () => {
    expect(isOnline(now + 1, now)).toBe(false);
  });

  it("deduplica instalações quando existem vários registos ativos", () => {
    expect(countOnline([
      { installationId: "a", lastSeenMs: now - 1_000 },
      { installationId: "a", lastSeenMs: now - 2_000 },
      { installationId: "b", lastSeenMs: now - 3_000 },
      { installationId: "c", lastSeenMs: now - ONLINE_TTL_MS }
    ], now)).toBe(2);
  });

  it("rejeita números inválidos", () => {
    expect(isOnline(Number.NaN, now)).toBe(false);
    expect(isOnline(now, Number.NaN)).toBe(false);
    expect(isOnline(now, now, -1)).toBe(false);
  });
});
