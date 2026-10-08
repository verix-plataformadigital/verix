import { describe, expect, it, vi } from "vitest";
import { AsfService } from "../../src/modules/insurance/asf-service";
import type { GateAuthorization } from "../../src/services/security/gate-contract";

const insuredResponse = {
  data: {
    mobishoutEntry: {
      noone: {
        entry: {
          licenseNumber: {
            nodes: [{
              id: "1",
              entity: "Seguradora",
              startDate: "2026-01-01",
              endDate: "2027-01-01",
              policy: "P1",
              license: "12AB34",
              code: "OK",
              logo: null
            }]
          }
        }
      }
    }
  }
};

function createGate(): GateAuthorization {
  return {
    getToken: vi.fn().mockResolvedValue("v1.token"),
    getIdentity: vi.fn().mockReturnValue({
      installationId: "install-1",
      sessionId: "session-1",
      tabId: "tab-1",
      buildId: "1.5-sec-20261008-a"
    }),
    clear: vi.fn()
  };
}

function request() {
  return {
    matricula: "12-AB-34",
    date: "2026/10/08"
  } as const;
}

describe("ASF service adapter", () => {
  it("envia o contrato do relay sem expor detalhes GraphQL à UI", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(insuredResponse), { status: 200 })
    );

    const gate = createGate();
    const service = new AsfService({ relayUrl: "https://example.invalid/asf", fetchImpl, gate });
    const result = await service.query(request());

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://example.invalid/asf");
    expect(init?.headers).toMatchObject({
      "X-Verix-Build-Id": "1.5-sec-20261008-a",
      "X-Verix-Client-Token": "v1.token"
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      matricula: "12AB34",
      date: "2026/10/08",
      installationId: "install-1"
    });
  });

  it("mantém sem seguro separado de erro GraphQL", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          mobishoutEntry: {
            noone: {
              entry: {
                licenseNumber: {
                  nodes: [{
                    id: "1",
                    entity: "Seguradora",
                    startDate: null,
                    endDate: null,
                    policy: null,
                    license: null,
                    code: null,
                    logo: null
                  }]
                }
              }
            }
          }
        }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: [{ message: "upstream failed" }]
      }), { status: 200 }));

    const gate = createGate();
    const service = new AsfService({ relayUrl: "https://example.invalid/asf", fetchImpl, gate });
    const noRecord = await service.query(request());
    const graphqlError = await service.query(request());

    expect(noRecord.ok).toBe(true);
    if (noRecord.ok) expect(noRecord.value.kind).toBe("no-record");

    expect(graphqlError.ok).toBe(false);
    if (!graphqlError.ok) expect(graphqlError.error.kind).toBe("graphql");
  });

  it("classifica timeout sem o confundir com HTTP", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })
    );

    const gate = createGate();
    const service = new AsfService({
      relayUrl: "https://example.invalid/asf",
      fetchImpl,
      timeoutMs: 1,
      gate
    });

    const result = await service.query(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("timeout");
  });

  it("classifica 429 como rate limit e preserva Retry-After", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("limited", { status: 429, headers: { "Retry-After": "3" } })
    );

    const gate = createGate();
    const service = new AsfService({
      relayUrl: "https://example.invalid/asf",
      fetchImpl,
      gate
    });

    const result = await service.query(request());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("rate-limited");
      if (result.error.kind === "rate-limited") {
        expect(result.error.retryAfterMs).toBe(3000);
      }
    }
  });

  it("limpa o token em memória quando o relay recusa autorização", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("denied", { status: 401 })
    );
    const gate = createGate();
    const service = new AsfService({
      relayUrl: "https://example.invalid/asf",
      fetchImpl,
      gate
    });

    const result = await service.query(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("auth");
    expect(gate.clear).toHaveBeenCalledTimes(1);
  });

  it("rejeita input antes de fazer pedido", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const service = new AsfService({ relayUrl: "https://example.invalid/asf", fetchImpl });
    const result = await service.query({
      ...request(),
      matricula: "ABCDE"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-input");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
