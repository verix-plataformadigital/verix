import { describe, expect, it, vi } from "vitest";
import { DefaultConnectivityService } from "../../src/services/connectivity/connectivity.service";

describe("DefaultConnectivityService", () => {
  it("não inventa backendReachable sem um probe real", async () => {
    const service = new DefaultConnectivityService({
      browserOnline: () => true
    });

    const snapshot = await service.probe();
    expect(snapshot.state).toBe("online");
    expect(snapshot.backendReachable).toBeNull();
  });

  it("distingue browser offline de backend indisponível", async () => {
    const service = new DefaultConnectivityService({
      browserOnline: () => false
    });

    await expect(service.probe()).resolves.toMatchObject({
      state: "offline",
      backendReachable: false
    });
  });

  it("usa o método configurado no probe do backend", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const service = new DefaultConnectivityService({
      probeUrl: "https://backend.example/health",
      probeMethod: "OPTIONS",
      fetchImpl,
      browserOnline: () => true
    });

    await service.probe();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("OPTIONS");
  });

  it("considera backend acessível quando o probe devolve HTTP 2xx", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const service = new DefaultConnectivityService({
      probeUrl: "https://backend.example/health",
      fetchImpl,
      browserOnline: () => true
    });

    await expect(service.probe()).resolves.toMatchObject({
      state: "online",
      backendReachable: true
    });
  });

  it("considera backend indisponível quando o probe responde erro HTTP", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const service = new DefaultConnectivityService({
      probeUrl: "https://backend.example/health",
      fetchImpl,
      browserOnline: () => true
    });

    await expect(service.probe()).resolves.toMatchObject({
      state: "backend-offline",
      backendReachable: false
    });
  });

  it("distingue timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })
    );
    const service = new DefaultConnectivityService({
      probeUrl: "https://backend.example/health",
      fetchImpl,
      timeoutMs: 1,
      browserOnline: () => true
    });

    await expect(service.probe()).resolves.toMatchObject({
      state: "timeout",
      backendReachable: false
    });
  });
});
