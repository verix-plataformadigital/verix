import { describe, expect, it, vi } from "vitest";
import { AsfService } from "../../src/modules/insurance/asf-service";

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

function request() {
  return {
    matricula: "12-AB-34",
    date: "2026/10/08",
    installationId: "install-1",
    buildId: "1.5-sec-20261008-a",
    clientToken: "token"
  } as const;
}

describe("ASF service adapter", () => {
  it("envia o contrato do relay sem expor detalhes GraphQL à UI", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(insuredResponse), { status: 200 })
    );

    const service = new AsfService({ relayUrl: "https://example.invalid/asf", fetchImpl });
    const result = await service.query(request());

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://example.invalid/asf");
    expect(init?.headers).toMatchObject({
      "X-Verix-Build-Id": "1.5-sec-20261008-a",
      "X-Verix-Client-Token": "token"
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

    const service = new AsfService({ relayUrl: "https://example.invalid/asf", fetchImpl });
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

    const service = new AsfService({
      relayUrl: "https://example.invalid/asf",
      fetchImpl,
      timeoutMs: 1
    });

    const result = await service.query(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
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
