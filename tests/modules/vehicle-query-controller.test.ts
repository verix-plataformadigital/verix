import { describe, expect, it, vi } from "vitest";
import { VehicleQueryController } from "../../src/modules/vehicle/vehicle-query-controller";

function createController(
  asfResult: any,
  overrides: any = {}
) {
  const track = vi.fn();
  const setBusy = vi.fn();
  const setQueryId = vi.fn();
  const controller = new VehicleQueryController({
    asf: {
      query: vi.fn().mockResolvedValue(asfResult)
    },
    telemetry: {
      newQueryId: vi.fn(() => "q-1"),
      track
    },
    store: {
      setBusy,
      setQueryId
    },
    ...overrides
  });
  return { controller, track, setBusy, setQueryId };
}

describe("VehicleQueryController", () => {
  it("emite lookup, pending e resultado seguro", async () => {
    const { controller, track, setBusy, setQueryId } = createController({
      ok: true,
      value: { kind: "insured", node: { license: "12AB34", entity: "Seguradora", policy: "P1", startDate: null, endDate: null, code: "OK", id: "1", logo: null } }
    });

    await controller.lookup({ plate: "12AB34", date: "2026/10/08" });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(setQueryId).toHaveBeenCalledWith("q-1");
    expect(track).toHaveBeenCalledWith("vehicle_lookup", "consulta", { queryId: "q-1" });
    expect(track).toHaveBeenCalledWith("vehicle_insurance_pending", "consulta", { queryId: "q-1" });
    expect(track).toHaveBeenCalledWith("vehicle_insurance_yes", "consulta", { queryId: "q-1", source: "asf-relay" });
    expect(controller.snapshot.status).toBe("success");
  });

  it("mantém o erro ASF separado do resultado sem seguro", async () => {
    const { controller, track } = createController({
      ok: false,
      error: { kind: "rate-limited", status: 429, retryAfterMs: 3000, message: "limitado" }
    });

    await controller.lookup({ plate: "12AB34", date: "2026/10/08" });

    expect(controller.snapshot.status).toBe("error");
    expect(track).toHaveBeenCalledWith(
      "vehicle_insurance_error",
      "consulta",
      { queryId: "q-1", errorType: "rate-limited" }
    );
  });

  it("gera data ASF no formato do contrato", () => {
    let current = new Date(2026, 9, 8);
    const { controller } = createController({ ok: true, value: { kind: "no-record" } }, { now: () => current });
    expect(controller.todayAsfDate()).toBe("2026/10/08");
  });
});
