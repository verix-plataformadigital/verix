import { describe, expect, it } from "vitest";
import {
  buildImtQueryTargets,
  buildImtRnsiUrl
} from "../../src/modules/imt/imt-url-builder";

describe("IMT RNSI URL builder", () => {
  it("constrói inspeção com matrícula do veículo", () => {
    expect(buildImtRnsiUrl("inspecao", "12-AB-34")).toBe(
      "http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_inspecao.php?Matricula=12AB34"
    );
  });

  it("constrói livrete com matrícula normalizada e codificada", () => {
    expect(buildImtRnsiUrl("livrete", " AA-12-BC ")).toBe(
      "http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_livrete.php?Matricula=AA12BC"
    );
  });

  it("escolhe corretamente as matrículas-alvo", () => {
    expect(buildImtQueryTargets("12-AB-34", "VC-1234")).toEqual({
      inspecao: "12AB34",
      livrete: "VC1234"
    });

    expect(buildImtQueryTargets("", "VC-1234")).toEqual({
      inspecao: "VC1234",
      livrete: "VC1234"
    });
  });
});
