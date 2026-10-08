// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { VehicleModule } from "../../src/modules/vehicle/vehicle-module";
import { ImtService } from "../../src/modules/imt/imt-service";
import { HistoryService } from "../../src/modules/history/history-service";
import { AsfService, type AsfServiceResult } from "../../src/modules/insurance/asf-service";
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
    const imtOpen = vi.fn(() => true);
    const imt = new ImtService({ open: imtOpen });

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
    return { root, history, asf, module, imtOpen };
  }

  it("usa os campos atuais nos botões RNSI e recusa matrículas vazias", async () => {
    const { root, imtOpen } = createModule(false);
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(".vehicle-imt-button"));
    const inspection = buttons[0];
    const livrete = buttons[1];
    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const trailer = root.querySelector<HTMLInputElement>("#vehicle-trailer");
    if (!inspection || !livrete || !plate || !trailer) return;

    inspection.click();
    expect(imtOpen).not.toHaveBeenCalled();
    expect(root.querySelector(".vehicle-local-notice")?.textContent).toContain("Introduza uma matrícula válida");

    plate.value = "12-AB-34";
    trailer.value = "VC-12-34";
    inspection.click();
    livrete.click();

    expect(imtOpen).toHaveBeenNthCalledWith(
      1,
      "http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_inspecao.php?Matricula=12AB34"
    );
    expect(imtOpen).toHaveBeenNthCalledWith(
      2,
      "http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_livrete.php?Matricula=VC1234"
    );
  });

  it("preserva a matrícula introduzida quando a validação mostra um erro local", () => {
    const { root } = createModule(false);
    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    if (!plate || !form) return;

    plate.value = "INVALIDA";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(root.querySelector<HTMLInputElement>("#vehicle-plate")?.value).toBe("INVALIDA");
    expect(root.querySelector(".vehicle-local-notice")?.textContent).toContain("Introduza uma matrícula válida");
  });

  it("não grava histórico quando a preferência está desligada", async () => {
    const { root, history, asf } = createModule(false);
    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    expect(plate).not.toBeNull();
    expect(form).not.toBeNull();
    if (!plate || !form) return;

    plate.value = "12-AB-34";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(asf.query).toHaveBeenCalled();
    expect(history.add).not.toHaveBeenCalled();
    expect(history.updateInsurance).not.toHaveBeenCalled();
  });

  it("coordena RNSI inspeção, RNSI livrete e ASF com o mesmo queryId", async () => {
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
      newQueryId: vi.fn(() => "q-coord"),
      track: vi.fn()
    };
    const imtOpen = vi.fn(() => true);
    const imt = new ImtService({ open: imtOpen });

    const module = new VehicleModule({
      asf,
      imt,
      telemetry,
      store: {
        setBusy: vi.fn(),
        setQueryId: vi.fn()
      },
      history
    });

    module.mount(root);

    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const trailer = root.querySelector<HTMLInputElement>("#vehicle-trailer");
    const date = root.querySelector<HTMLInputElement>('input[type="date"]');
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    if (!plate || !trailer || !date || !form) return;

    plate.value = "12-AB-34";
    trailer.value = "VC-12-34";
    date.value = "2026-10-08";

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(imtOpen).toHaveBeenCalledTimes(2);
    expect(imtOpen).toHaveBeenNthCalledWith(1, "http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_inspecao.php?Matricula=12AB34");
    expect(imtOpen).toHaveBeenNthCalledWith(2, "http://consultapsp.imtt.external.rnsi.local/veiculos/consulta_livrete.php?Matricula=VC1234");
    expect(asf.query).toHaveBeenCalledWith({
      matricula: "12AB34",
      date: "2026/10/08"
    });
    expect(telemetry.newQueryId).toHaveBeenCalledTimes(1);
  });

  it("uses one consistent fallback date when the ASF date control is empty", async () => {
    const { root, history, asf } = createModule(true);
    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const date = root.querySelector<HTMLInputElement>('input[type="date"]');
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    if (!plate || !date || !form) return;

    const defaultDate = date.value;
    expect(defaultDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const expectedAsfDate = defaultDate.replaceAll("-", "/");
    date.value = "";
    plate.value = "12-AB-34";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(asf.query).toHaveBeenCalledWith({
      matricula: "12AB34",
      date: expectedAsfDate
    });
    expect(history.add).toHaveBeenCalledWith("12AB34", "", "q-test", expectedAsfDate);
  });

  it("grava histórico quando a preferência está ligada", async () => {
    const { root, history } = createModule(true);
    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const date = root.querySelector<HTMLInputElement>('input[type="date"]');
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    if (!plate || !date || !form) return;

    plate.value = "12-AB-34";
    date.value = "2026-02-03";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(history.add).toHaveBeenCalledWith("12AB34", "", "q-test", "2026/02/03");
    expect(history.updateInsurance).toHaveBeenCalledWith("q-test", "12AB34", "nao");
  });

  it("reabre o histórico com a data ASF original e limpa resultados de outra consulta", async () => {
    const { root, module } = createModule(false);
    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const date = root.querySelector<HTMLInputElement>('input[type="date"]');
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    if (!plate || !date || !form) return;

    plate.value = "88-ZZ-88";
    date.value = "2026-10-08";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector(".vehicle-result-no-record")).not.toBeNull();

    module.reopen({
      id: "q-old-date",
      veiculo: "12AB34",
      reboque: "",
      data: "2026-10-08T19:00:00.000Z",
      dataConsultaAsf: "2026/01/31",
      seguro: "sim"
    });

    expect(root.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-01-31");
    expect(root.querySelector<HTMLInputElement>("#vehicle-plate")?.value).toBe("12AB34");
    expect(root.querySelector(".vehicle-result-idle")).not.toBeNull();
    expect(root.querySelector(".vehicle-result-no-record")).toBeNull();
  });


  it("does not restore a cleared result when an old ASF request finishes late", async () => {
    let resolveAsf: ((result: AsfServiceResult) => void) | undefined;
    const query = vi.fn<(request: { matricula: string; date: string }) => Promise<AsfServiceResult>>(
      () => new Promise((resolve) => { resolveAsf = resolve; })
    );
    const root = document.createElement("main");
    const history = {
      add: vi.fn(),
      updateInsurance: vi.fn()
    } as unknown as HistoryService;
    const telemetry = {
      newQueryId: vi.fn(() => "q-slow"),
      track: vi.fn()
    };
    const store = {
      setBusy: vi.fn(),
      setQueryId: vi.fn()
    };
    const module = new VehicleModule({
      asf: { query } as unknown as AsfService,
      imt: new ImtService({ open: vi.fn(() => false) }),
      telemetry,
      store,
      history
    });
    module.mount(root);

    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    if (!plate || !form) return;
    plate.value = "12-AB-34";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(root.querySelector(".vehicle-result-loading")).not.toBeNull();
    root.querySelector<HTMLButtonElement>(".vehicle-clear")?.click();
    expect(root.querySelector(".vehicle-result-idle")).not.toBeNull();
    expect(store.setQueryId).toHaveBeenLastCalledWith(null);

    resolveAsf?.({ ok: true, value: { kind: "no-record" } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector(".vehicle-result-idle")).not.toBeNull();
    expect(root.querySelector(".vehicle-result-no-record")).toBeNull();
    expect(root.querySelector<HTMLInputElement>("#vehicle-plate")?.value).toBe("");
    expect(root.querySelector(".vehicle-local-notice")).toBeNull();
  });

  
  it("does not show an RNSI warning from a query completed after reopening history", async () => {
    let resolveAsf: ((result: AsfServiceResult) => void) | undefined;
    const query = vi.fn<(request: { matricula: string; date: string }) => Promise<AsfServiceResult>>(
      () => new Promise((resolve) => { resolveAsf = resolve; })
    );
    const root = document.createElement("main");
    const history = {
      add: vi.fn(),
      updateInsurance: vi.fn()
    } as unknown as HistoryService;
    const telemetry = {
      newQueryId: vi.fn(() => "q-reopen-slow"),
      track: vi.fn()
    };
    const module = new VehicleModule({
      asf: { query } as unknown as AsfService,
      imt: new ImtService({ open: vi.fn(() => false) }),
      telemetry,
      store: { setBusy: vi.fn(), setQueryId: vi.fn() },
      history
    });
    module.mount(root);

    const plate = root.querySelector<HTMLInputElement>("#vehicle-plate");
    const form = root.querySelector<HTMLFormElement>(".vehicle-query-form");
    if (!plate || !form) return;
    plate.value = "88-ZZ-88";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(root.querySelector(".vehicle-result-loading")).not.toBeNull();

    module.reopen({
      id: "q-history",
      veiculo: "12AB34",
      reboque: "",
      data: "2026-10-08T19:00:00.000Z",
      dataConsultaAsf: "2026/01/31",
      seguro: "sim"
    });
    expect(root.querySelector<HTMLInputElement>("#vehicle-plate")?.value).toBe("12AB34");
    expect(root.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-01-31");
    expect(root.querySelector(".vehicle-result-idle")).not.toBeNull();

    resolveAsf?.({ ok: true, value: { kind: "no-record" } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector<HTMLInputElement>("#vehicle-plate")?.value).toBe("12AB34");
    expect(root.querySelector(".vehicle-result-idle")).not.toBeNull();
    expect(root.querySelector(".vehicle-local-notice")).toBeNull();
    expect(history.updateInsurance).not.toHaveBeenCalled();
  });

});
