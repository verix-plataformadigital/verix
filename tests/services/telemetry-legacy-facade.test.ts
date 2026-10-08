import { describe, expect, it, vi } from "vitest";
import { createTelemetryLegacyFacade } from "../../src/services/telemetry/telemetry-legacy-facade";

describe("legacy telemetry facade", () => {
  it("expõe o contrato mínimo esperado pelo runtime legado", async () => {
    const service = {
      installationId: "install-1",
      endpoint: "/telemetry",
      queueSize: 3,
      newQueryId: vi.fn(() => "q-1"),
      track: vi.fn(() => ({ eventId: "e-1" })),
      flush: vi.fn().mockResolvedValue({ ok: true, sent: 3 }),
      flushBeacon: vi.fn(() => 2)
    } as any;

    const facade = createTelemetryLegacyFacade(service);
    expect(facade.version).toBe(2);
    expect(facade.enabled).toBe(true);
    expect(facade.installationId).toBe("install-1");
    expect(facade.endpoint).toBe("/telemetry");
    expect(facade.queueSize).toBe(3);
    expect(facade.newQueryId()).toBe("q-1");
    facade.track("heartbeat", null);
    await expect(facade.flush()).resolves.toMatchObject({ sent: 3 });
    expect(facade.flushBeacon()).toBe(2);
  });
});
