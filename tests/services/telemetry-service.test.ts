import { describe, expect, it, vi } from "vitest";
import { TelemetryService } from "../../src/services/telemetry/telemetry-service";

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

function createService(overrides: Partial<ConstructorParameters<typeof TelemetryService>[0]> = {}) {
  return new TelemetryService({
    endpoint: "https://example.invalid/telemetry",
    appVersion: "2.0.0",
    buildId: "2.0",
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    createId: () => "id-" + Math.random().toString(36).slice(2),
    ...overrides
  });
}

describe("TelemetryService", () => {
  it("preserva identidade entre instâncias com os mesmos stores", () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    const serviceA = createService({ localStorage: local, sessionStorage: session });
    const serviceB = createService({ localStorage: local, sessionStorage: session });

    expect(serviceB.installationId).toBe(serviceA.installationId);
    expect(serviceB.sessionId).toBe(serviceA.sessionId);
    expect(serviceB.tabId).toBe(serviceA.tabId);
  });

  it("cria evento com build id e persiste-o na fila", () => {
    const local = new MemoryStorage();
    const service = createService({ localStorage: local });
    const item = service.track("vehicle_lookup", "consulta");

    expect(item.buildId).toBe("2.0");
    expect(item.installationId).toBe(service.installationId);
    expect(service.queueSize).toBe(1);
    expect(local.getItem("VERIX_T2_QUEUE")).toContain("vehicle_lookup");
  });

  it("faz flush imediato para eventos críticos", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 204 })
    );
    const service = createService({ fetchImpl });

    service.track("vehicle_lookup", "consulta");

    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(service.queueSize).toBe(0);
    });

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.keepalive).toBe(false);
  });

  it("não força flush imediato para eventos normais", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 204 })
    );
    const service = createService({ fetchImpl });

    service.track("module_open", "consulta");
    await Promise.resolve();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(service.queueSize).toBe(1);
  });

  it("remove lote somente depois de resposta 2xx", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const service = createService({ fetchImpl });

    service.track("module_open", "consulta");
    const result = await service.flush();

    expect(result).toEqual({ ok: true, sent: 1 });
    expect(service.queueSize).toBe(0);
  });

  it("mantém lote quando backend falha", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("no", { status: 503 })
    );
    const service = createService({ fetchImpl });

    service.track("heartbeat", null);
    const result = await service.flush();

    expect(result.ok).toBe(false);
    expect(service.queueSize).toBe(1);
  });

  it("permite lote normal superior ao limite de beacon/keepalive", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("ok", { status: 200 })
    );
    const service = createService({ fetchImpl, batchSize: 5 });
    const metadata = { value: "x".repeat(20_000) };

    for (let i = 0; i < 5; i += 1) {
      service.track("module_open", "consulta", metadata);
    }

    const result = await service.flush();
    expect(result).toEqual({ ok: true, sent: 5 });
    expect(service.queueSize).toBe(0);

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.keepalive).toBe(false);
  });

  it("impede flushes concorrentes", async () => {
    const local = new MemoryStorage();
    let release: (() => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = () => resolve(new Response("ok", { status: 200 }));
    });
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(pending);
    const service = createService({
      localStorage: local,
      fetchImpl,
      createId: () => String(Math.random())
    });

    service.track("app_open", null);
    const first = service.flush();
    const second = service.flush();
    expect(second).toBe(first);
    release?.();
    await expect(first).resolves.toEqual({ ok: true, sent: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(String(init?.body)).toContain('"events"');
  });

  it("continua funcional quando o storage local recusa escrita", async () => {
    class FailingStorage {
      getItem(): string | null { return null; }
      setItem(): void { throw new Error("quota"); }
      removeItem(): void { throw new Error("quota"); }
    }

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("ok", { status: 200 })
    );
    const service = createService({
      localStorage: new FailingStorage(),
      fetchImpl
    });

    service.track("module_open", "consulta");
    expect(service.queueSize).toBe(1);

    const result = await service.flush();
    expect(result).toEqual({ ok: true, sent: 1 });
  });
});
