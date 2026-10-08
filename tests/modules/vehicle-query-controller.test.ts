import { describe, expect, it, vi } from "vitest";
import { VehicleQueryController } from "../../src/modules/vehicle/vehicle-query-controller";
import type { AsfServiceError } from "../../src/modules/insurance/asf-service";
import type { AsfOutcome } from "../../src/modules/insurance/asf-classifier";

interface FakeAsf {
  query: ReturnType<typeof vi.fn>;
}

interface FakeTelemetry {
  newQueryId: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
}

interface FakeStore {
  setBusy: ReturnType<typeof vi.fn>;
  setQueryId: ReturnType<typeof vi.fn>;
}

function createController(
  asfResult:
    | { readonly ok: true; readonly value: AsfOutcome }
    | { readonly ok: false; readonly error: AsfServiceError },
  overrides: {
    readonly now?: () => Date;
    readonly queryId?: string;
  } = {}
) {
  const asf: FakeAsf = {
    query: vi.fn().mockResolvedValue(asfResult)
  };
  const telemetry: FakeTelemetry = {
    newQueryId: vi.fn(() => overrides.queryId ?? "q-1"),
    track: vi.fn()
  };
  const store: FakeStore = {
    setBusy: vi.fn(),
    setQueryId: vi.fn()
  };

  const controller = new VehicleQueryController({
    asf,
    telemetry,
    store,
    now: overrides.now
  });

  return { controller, asf, telemetry, store };
}

describe("VehicleQueryController", () => {
  it("emite lookup, pending e resultado seguro", async () => {
    const result = {
      kind: "insured" as const,
      node: {
        license: "12AB34",
        entity: "Seguradora",
        policy: "P1",
        startDate: null,
        endDate: null,
        code: "OK",
        id: "1",
        logo: null
      }
    };

    const { controller, telemetry, store } = createController({
      ok: true,
      value: result
    });

    await controller.lookup({ plate: "12AB34", date: "2026/10/08" });

    expect(store.setBusy).toHaveBeenCalledWith(true);
    expect(store.setBusy).toHaveBeenLastCalledWith(false);
    expect(store.setQueryId).toHaveBeenCalledWith("q-1");
    expect(telemetry.track).toHaveBeenCalledWith(
      "vehicle_lookup",
      "consulta",
      { queryId: "q-1" }
    );
    expect(telemetry.track).toHaveBeenCalledWith(
      "vehicle_insurance_pending",
      "consulta",
      { queryId: "q-1" }
    );
    expect(telemetry.track).toHaveBeenCalledWith(
      "vehicle_insurance_yes",
      "consulta",
      { queryId: "q-1", source: "asf-relay" }
    );
    expect(controller.snapshot.status).toBe("success");
  });

  it("mantém o erro ASF separado do resultado sem seguro", async () => {
    const { controller, telemetry } = createController({
      ok: false,
      error: {
        kind: "rate-limited",
        status: 429,
        retryAfterMs: 3000,
        message: "limitado"
      }
    });

    await controller.lookup({ plate: "12AB34", date: "2026/10/08" });

    expect(controller.snapshot.status).toBe("error");
    expect(telemetry.track).toHaveBeenCalledWith(
      "vehicle_insurance_error",
      "consulta",
      { queryId: "q-1", errorType: "rate-limited" }
    );
  });

  it("emite sem seguro quando ASF devolve no-record", async () => {
    const { controller, telemetry } = createController({
      ok: true,
      value: { kind: "no-record" }
    });

    await controller.lookup({ plate: "12AB34", date: "2026/10/08" });

    expect(controller.snapshot.status).toBe("success");
    expect(telemetry.track).toHaveBeenCalledWith(
      "vehicle_insurance_no",
      "consulta",
      { queryId: "q-1", source: "asf-relay" }
    );
  });

  it("ignora resposta de uma consulta antiga", async () => {
    let resolveFirst: ((value: { ok: true; value: AsfOutcome }) => void) | undefined;
    const first = new Promise<{ ok: true; value: AsfOutcome }>((resolve) => {
      resolveFirst = resolve;
    });

    const query = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ok: true, value: { kind: "no-record" } as const });

    const controller = new VehicleQueryController({
      asf: { query },
      telemetry: {
        newQueryId: vi.fn()
          .mockReturnValueOnce("q-old")
          .mockReturnValueOnce("q-new"),
        track: vi.fn()
      },
      store: {
        setBusy: vi.fn(),
        setQueryId: vi.fn()
      }
    });

    const oldPromise = controller.lookup({ plate: "11AA11", date: "2026/10/08" });
    await controller.lookup({ plate: "22BB22", date: "2026/10/08" });

    resolveFirst?.({
      ok: true,
      value: { kind: "insured", node: { license: "11AA11", entity: null, policy: null, startDate: null, endDate: null, code: null, id: null, logo: null } }
    });
    await oldPromise;

    expect(controller.snapshot.queryId).toBe("q-new");
    expect(controller.snapshot.status).toBe("success");
    if (controller.snapshot.status === "success") {
      expect(controller.snapshot.outcome.kind).toBe("no-record");
    }
  });

  it("gera data ASF no formato do contrato", () => {
    const current = new Date(2026, 9, 8);
    const { controller } = createController(
      { ok: true, value: { kind: "no-record" } },
      { now: () => current }
    );

    expect(controller.todayAsfDate()).toBe("2026/10/08");
  });
});
