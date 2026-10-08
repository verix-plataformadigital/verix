import { describe, expect, it } from "vitest";
import { VehicleLookupOrchestrator } from "../../src/modules/vehicle/vehicle-lookup-orchestrator";

describe("vehicle lookup orchestration", () => {
  it("arranca IMT inspeção, IMT livrete e ASF no mesmo ciclo", async () => {
    const calls: string[] = [];
    const orchestrator = new VehicleLookupOrchestrator({
      newQueryId: () => "q-1",
      startImtInspection: async (plate) => {
        calls.push("imt-inspecao:" + plate);
        return "inspection";
      },
      startImtLivrete: async (plate) => {
        calls.push("imt-livrete:" + plate);
        return "livrete";
      },
      queryAsf: async (plate, queryId, asfDate) => {
        calls.push("asf:" + plate + ":" + queryId + ":" + asfDate);
        return "asf";
      },
      recordLookup: (queryId) => calls.push("telemetry:" + queryId)
    });

    const result = orchestrator.execute({
      vehiclePlate: "12-AB-34",
      trailerPlate: "VC-1234",
      asfDate: "2026/10/08"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(calls).toEqual([
      "telemetry:q-1",
      "imt-inspecao:12-AB-34",
      "imt-livrete:VC-1234",
      "asf:12-AB-34:q-1:2026/10/08"
    ]);

    await expect(result.value).resolves.toMatchObject({
      queryId: "q-1",
      targets: {
        inspectionPlate: "12-AB-34",
        libretePlate: "VC-1234"
      }
    });
  });

  it("continua as restantes consultas quando um canal falha", async () => {
    const calls: string[] = [];
    const orchestrator = new VehicleLookupOrchestrator({
      newQueryId: () => "q-2",
      startImtInspection: async () => {
        calls.push("inspection");
        throw new Error("RNSI");
      },
      startImtLivrete: async () => {
        calls.push("livrete");
        return "ok";
      },
      queryAsf: async (_plate, _queryId, _asfDate) => {
        calls.push("asf");
        return "ok";
      }
    });

    const result = orchestrator.execute({
      vehiclePlate: "12AB34",
      trailerPlate: "",
      asfDate: "2026/10/08"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const settled = await result.value;
    expect(settled.imtInspection.status).toBe("rejected");
    expect(settled.imtLivrete.status).toBe("fulfilled");
    expect(settled.asf.status).toBe("fulfilled");
    expect(calls).toEqual(["inspection", "livrete", "asf"]);
  });

  it("exige pelo menos uma matrícula", () => {
    const orchestrator = new VehicleLookupOrchestrator({
      newQueryId: () => "q-3",
      startImtInspection: async () => "ok",
      startImtLivrete: async () => "ok",
      queryAsf: async () => "ok"
    });

    const result = orchestrator.execute({
      vehiclePlate: " ",
      trailerPlate: "",
      asfDate: "2026/10/08"
    });

    expect(result).toEqual({ ok: false, error: "missing-plate" });
  });
});
