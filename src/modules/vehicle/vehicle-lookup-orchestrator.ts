import type { Result } from "../../shared/types/result";

export interface VehicleLookupRequest {
  readonly vehiclePlate: string;
  readonly trailerPlate: string;
}

export interface VehicleLookupTargets {
  readonly inspectionPlate: string;
  readonly libretePlate: string;
}

export interface VehicleLookupDependencies<TImt, TAsf> {
  readonly newQueryId: () => string;
  readonly startImtInspection: (plate: string, queryId: string) => Promise<TImt>;
  readonly startImtLivrete: (plate: string, queryId: string) => Promise<TImt>;
  readonly queryAsf: (plate: string, queryId: string) => Promise<TAsf>;
  readonly recordLookup?: (queryId: string) => void;
}

export interface VehicleLookupResult<TImt, TAsf> {
  readonly queryId: string;
  readonly targets: VehicleLookupTargets;
  readonly imtInspection: PromiseSettledResult<TImt>;
  readonly imtLivrete: PromiseSettledResult<TImt>;
  readonly asf: PromiseSettledResult<TAsf>;
}

export class VehicleLookupOrchestrator<TImt, TAsf> {
  constructor(
    private readonly dependencies: VehicleLookupDependencies<TImt, TAsf>
  ) {}

  execute(
    request: VehicleLookupRequest
  ): Result<Promise<VehicleLookupResult<TImt, TAsf>>, "missing-plate"> {
    if (!request.vehiclePlate.trim() && !request.trailerPlate.trim()) {
      return { ok: false, error: "missing-plate" };
    }

    const inspectionPlate = request.vehiclePlate.trim() || request.trailerPlate.trim();
    const libretePlate = request.trailerPlate.trim() || request.vehiclePlate.trim();
    const queryId = this.dependencies.newQueryId();

    this.dependencies.recordLookup?.(queryId);

    const imtInspection = this.dependencies.startImtInspection(
      inspectionPlate,
      queryId
    );
    const imtLivrete = this.dependencies.startImtLivrete(
      libretePlate,
      queryId
    );
    const asf = this.dependencies.queryAsf(inspectionPlate, queryId);

    return {
      ok: true,
      value: Promise.allSettled([imtInspection, imtLivrete, asf]).then(
        ([inspection, librete, insurance]) => ({
          queryId,
          targets: { inspectionPlate, libretePlate },
          imtInspection: inspection,
          imtLivrete: librete,
          asf: insurance
        })
      )
    };
  }
}
