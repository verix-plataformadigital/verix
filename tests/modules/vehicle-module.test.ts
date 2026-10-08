import { describe, expect, it } from "vitest";
import { buildRnsiUrl } from "../../src/modules/vehicle/vehicle-module";

describe("RNSI URL builder", () => {
  it("constrói a consulta de inspeção com matrícula normalizada", () => {
    expect(buildRnsiUrl("rnsi-inspecao", "12-AB-34"))
      .toBe("http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_inspecao.php?Matricula=12AB34");
  });

  it("constrói a consulta de livrete com matrícula codificada", () => {
    expect(buildRnsiUrl("rnsi-livrete", "VC 12-34"))
      .toBe("http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_livrete.php?Matricula=VC1234");
  });
});
