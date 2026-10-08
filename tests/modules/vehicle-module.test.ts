import { describe, expect, it } from "vitest";
import { buildImtRnsiUrl } from "../../src/modules/imt/imt-url-builder";

describe("RNSI URL compatibility", () => {
  it("mantém o destino de inspeção esperado", () => {
    expect(buildImtRnsiUrl("inspecao", "12-AB-34")).toBe(
      "http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_inspecao.php?Matricula=12AB34"
    );
  });

  it("mantém o destino de livrete esperado", () => {
    expect(buildImtRnsiUrl("livrete", "VC 12-34")).toBe(
      "http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_livrete.php?Matricula=VC1234"
    );
  });
});
