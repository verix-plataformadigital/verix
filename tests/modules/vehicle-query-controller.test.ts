import { describe, expect, it, vi } from "vitest";
import { VehicleQueryController } from "../../src/modules/vehicle/vehicle-query-controller";
import type {
  AsfServiceError,
  AsfServiceRequest,
  AsfServiceResult
} from "../../src/modules/insurance/asf-service";
import type { AsfOutcome } from "../../src/modules/insurance/asf-classifier";
import type { TelemetryEventName } from "../../src/services/telemetry/telemetry-contract";

function createController(
  asfResult:
    | { readonly ok: true; readonly value: AsfOutcome }
    | { readonly ok: false; readonly error: AsfServiceError },
  overrides: { readonly now?: () => Date; readonly queryId?: string } = {}
) {
  const query = vi.fn<(request: AsfServiceRequest) => Promise<AsfServiceResult>>(
    async () => asfResult
  );
  const newQueryId = vi.fn<() => string>(() => overrides.queryId ?? "q-1");
  const track = vi.fn<
    (
      event: TelemetryEventName,
      module: string | null,
      metadata?: Readonly<Record<string, unknown>>
    ) => unknown
  >();
  const setBusy = vi.fn<(isBusy: boolean) => void>();
  const setQueryId = vi.fn<(queryId: string | null) => void>();

  const controller = new VehicleQueryController({
    asf: { query },
    telemetry: { newQueryId, track },
    store: { setBusy, setQueryId },
    ...(overrides.now ? { now: overrides.now } : {})
  });

  return { controller, query, track, setBusy, setQueryId };
}

describe("VehicleQueryController", () => {
  it("emite lookup, pending e resultado seguro", async () => {
    const result: AsfOutcome = {
      kind: "insured",
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

    const { controller, track, setBusy, setQueryId } = createController({
      ok: true,
      value: result
    });

    await controller.lookup({ plate: "12AB34", date: "2026/10/08" });

    expect(setBusy).toHaveBeenCalledWith(true);
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(setQueryId).toHaveBeenCalledWith("q-1");
    expect(track).toHaveBeenCalledWith(
      "vehicle_lookup",
      "consulta",
      { queryId: "q-1" }
    );
    expect(track).toHaveBeenCalledWith(
      "vehicle_insurance_pending",
      "consulta",
      { queryId: "q-1" }
    );
    expect(track).toHaveBeenCalledWith(
      "vehicle_insurance_yes",
      "consulta",
      { queryId: "q-1", source: "asf-relay" }
    );
    expect(controller.snapshot.status).toBe("success");
  });

  it("mantém o erro ASF separado do resultado sem seguro", async () => {
    const { controller, track } = createController({
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
    expect(track).toHaveBeenCalledWith(
      "vehicle_insurance_error",
      "consulta",
      { queryId: "q-1", errorType: "rate-limited" }
    );
  });

  it("emite sem seguro quando ASF devolve no-record", async () => {
    const { controller, track } = createController({
      ok: true,
      value: { kind: "no-record" }
    });

    await controller.lookup({ plate: "12AB34", date: "2026/10/08" });

    expect(controller.snapshot.status).toBe("success");
    expect(track).toHaveBeenCalledWith(
      "vehicle_insurance_no",
      "consulta",
      { queryId: "q-1", source: "asf-relay" }
    );
  });

  it("ignora resposta de uma consulta antiga", async () => {
    let resolveFirst: ((value: AsfServiceResult) => void) | undefined;

    const first = new Promise<AsfServiceResult>((resolve) => {
      resolveFirst = resolve;
    });

    const query = vi.fn<(request: AsfServiceRequest) => Promise<AsfServiceResult>>()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ok: true, value: { kind: "no-record" } });

    const controller = new VehicleQueryController({
      asf: { query },
      telemetry: {
        newQueryId: vi.fn<() => string>()
          .mockReturnValueOnce("q-old")
          .mockReturnValueOnce("q-new"),
        track: vi.fn<
          (
            event: TelemetryEventName,
            module: string | null,
            metadata?: Readonly<Record<string, unknown>>
          ) => unknown
        >()
      },
      store: {
        setBusy: vi.fn<(isBusy: boolean) => void>(),
        setQueryId: vi.fn<(queryId: string | null) => void>()
      }
    });

    const oldPromise = controller.lookup({
      plate: "11AA11",
      date: "2026/10/08"
    });
    await controller.lookup({
      plate: "22BB22",
      date: "2026/10/08"
    });

    resolveFirst?.({
      ok: true,
      value: {
        kind: "insured",
        node: {
          license: "11AA11",
          entity: null,
          policy: null,
          startDate: null,
          endDate: null,
          code: null,
          id: null,
          logo: null
        }
      }
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

  it("reset cancels in-flight lookups and returns the view to idle", async () => {
    let resolveLookup: ((value: AsfServiceResult) => void) | undefined;
    const query = vi.fn<(request: AsfServiceRequest) => Promise<AsfServiceResult>>(
      () => new Promise((resolve) => { resolveLookup = resolve; })
    );
    const setBusy = vi.fn<(isBusy: boolean) => void>();
    const setQueryId = vi.fn<(queryId: string | null) => void>();
    const controller = new VehicleQueryController({
      asf: { query },
      telemetry: {
        newQueryId: () => "q-reset",
        track: vi.fn<(event: TelemetryEventName, module: string | null, metadata?: Readonly<Record<string, unknown>>) => unknown>()
      },
      store: { setBusy, setQueryId }
    });

    const pending = controller.lookup({ plate: "12AB34", date: "2026/10/08" });
    expect(controller.snapshot.status).toBe("loading");

    controller.reset();
    expect(controller.snapshot).toEqual({
      status: "idle",
      queryId: null,
      outcome: null,
      error: null
    });
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(setQueryId).toHaveBeenLastCalledWith(null);

    resolveLookup?.({
      ok: true,
      value: {
        kind: "insured",
        node: {
          license: "12AB34",
          entity: null,
          policy: null,
          startDate: null,
          endDate: null,
          code: null,
          id: null,
          logo: null
        }
      }
    });
    await pending;

    expect(controller.snapshot.status).toBe("idle");
  });

});
