import { describe, expect, it } from "vitest";
import { classifyAsfResponse } from "../../src/modules/insurance/asf-classifier";

describe("ASF response characterization", () => {
  it("classifica seguro quando existe um nó com license não nulo", () => {
    const result = classifyAsfResponse({
      data: {
        mobishoutEntry: {
          noone: {
            entry: {
              licenseNumber: {
                nodes: [
                  {
                    id: "1",
                    entity: "Seguradora",
                    startDate: "2026-01-01",
                    endDate: "2027-01-01",
                    policy: "P1",
                    license: "12AB34",
                    code: "OK",
                    logo: null
                  }
                ]
              }
            }
          }
        }
      }
    });

    expect(result.kind).toBe("insured");
  });

  it("não interpreta HTTP 200 sem licença como seguro", () => {
    const result = classifyAsfResponse({
      data: {
        mobishoutEntry: {
          noone: {
            entry: {
              licenseNumber: {
                nodes: [
                  {
                    id: "1",
                    entity: "Seguradora",
                    startDate: null,
                    endDate: null,
                    policy: null,
                    license: null,
                    code: null,
                    logo: null
                  }
                ]
              }
            }
          }
        }
      }
    });

    expect(result.kind).toBe("no-record");
  });

  it("classifica lista vazia como sem registo", () => {
    const result = classifyAsfResponse({
      data: {
        mobishoutEntry: {
          noone: {
            entry: {
              licenseNumber: { nodes: [] }
            }
          }
        }
      }
    });

    expect(result.kind).toBe("no-record");
  });

  it("distingue erro GraphQL de ausência de seguro", () => {
    const result = classifyAsfResponse({
      errors: [{ message: "upstream failed", path: ["mobishoutEntry"] }]
    });

    expect(result.kind).toBe("graphql-error");
    if (result.kind === "graphql-error") {
      expect(result.messages).toEqual(["upstream failed"]);
    }
  });

  it("rejeita uma resposta sem o caminho de dados esperado", () => {
    const result = classifyAsfResponse({ data: {} });
    expect(result.kind).toBe("invalid-response");
  });
});
