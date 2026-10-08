// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { VehicleModule } from "../../src/modules/vehicle/vehicle-module";
import { ImtService } from "../../src/modules/imt/imt-service";
import { HistoryService } from "../../src/modules/history/history-service";
import { AsfService } from "../../src/modules/insurance/asf-service";
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

describe("VehicleModule history preference", () => {
  function createModule(historyEnabled: boolean) {
    const root = document.createElement("main");
    const history = {
      add: vi.fn(),
      updateInsurance: vi.fn()
    } as unknown as HistoryService;
    const asf = {
      query: vi.fn(async () => ({
        ok: true as const,
        value: { kind: "no-record" as const }
      }))
    } as unknown as AsfService;
    const telemetry = {
      newQueryId: vi.fn(() => "q-test"),
      track: vi.fn()
    };
    const imt = new ImtService({ open: vi.fn(() => true) });

    const module = new VehicleModule({
      asf,
      imt,
      telemetry,
      store: {
        setBusy: vi.fn(),
        setQueryId: vi.fn()
      },
      history,
      historyEnabled: () => historyEnabled
    });

    module.mount(root);
    return { root, history, asf };
  }

  it("não grava histórico quando a preferência está desligada", async () => {
    const { root, history, asf } = createModule(false);
    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    expect(plate).not.toBeNull();
    expect(form).not.toBeNull();
    if (!plate || !form) return;

    plate.value = "12-AB-34";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(asf.query).toHaveBeenCalled();
    expect(history.add).not.toHaveBeenCalled();
    expect(history.updateInsurance).not.toHaveBeenCalled();
  });

  it("grava histórico quando a preferência está ligada", async () => {
    const { root, history } = createModule(true);
    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    if (!plate || !form) return;

    plate.value = "12-AB-34";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(history.add).toHaveBeenCalledWith("12AB34", "", "q-test");
    expect(history.updateInsurance).toHaveBeenCalledWith("q-test", "12AB34", "nao");
  });
});
