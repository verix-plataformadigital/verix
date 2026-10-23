import { describe, expect, it, vi } from "vitest";
import { GateService } from "../../src/services/security/gate-service";

const identity = {
  installationId: "i-1",
  sessionId: "s-1",
  tabId: "t-1",
  buildId: "1.5-sec-20261008-a"
} as const;

describe("GateService", () => {
  it("obtém token e reutiliza-o enquanto ainda é válido", async () => {
    let now = 1_000_000;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, token: "v1.token", expires_in: 900 }),
        { status: 200 }
      )
    );
    const service = new GateService({
      endpoint: "https://example.invalid/gate",
      identity,
      fetchImpl,
      now: () => now
    });

    await expect(service.getToken()).resolves.toBe("v1.token");
    now += 60_000;
    await expect(service.getToken()).resolves.toBe("v1.token");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("faz refresh quando entra na margem de 30 segundos", async () => {
    let now = 1_000_000;
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true, token: "v1.a", expires_in: 900 }),
        { status: 200 }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true, token: "v1.b", expires_in: 900 }),
        { status: 200 }
      ));

    const service = new GateService({
      endpoint: "https://example.invalid/gate",
      identity,
      fetchImpl,
      now: () => now
    });

    await expect(service.getToken()).resolves.toBe("v1.a");
    now += 871_000;
    await expect(service.getToken()).resolves.toBe("v1.b");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("partilha um único pedido quando duas chamadas chegam simultaneamente", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = () => resolve(new Response(
        JSON.stringify({ ok: true, token: "v1.shared", expires_in: 900 }),
        { status: 200 }
      ));
    });
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(pending);
    const service = new GateService({
      endpoint: "https://example.invalid/gate",
      identity,
      fetchImpl
    });

    const first = service.getToken();
    const second = service.getToken();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "v1.shared",
      "v1.shared"
    ]);
  });
});
