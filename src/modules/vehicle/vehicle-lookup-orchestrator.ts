import type { Result } from "../../shared/types/result";

export interface VehicleLookupRequest {
  readonly vehiclePlate: string;
  readonly trailerPlate: string;
  readonly asfDate: string;
}

export interface VehicleLookupTargets {
  readonly inspectionPlate: string;
  readonly livretePlate: string;
}

export interface VehicleLookupDependencies<TImt, TAsf> {
  readonly newQueryId: () => string;
  readonly startImtInspection: (plate: string, queryId: string) => Promise<TImt>;
  readonly startImtLivrete: (plate: string, queryId: string) => Promise<TImt>;
  readonly queryAsf: (
    plate: string,
    queryId: string,
    asfDate: string
  ) => Promise<TAsf>;
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
    request: VehicleLookupRequest,
    queryIdOverride?: string
  ): Result<Promise<VehicleLookupResult<TImt, TAsf>>, "missing-plate"> {
    if (!request.vehiclePlate.trim() && !request.trailerPlate.trim()) {
      return { ok: false, error: "missing-plate" };
    }

    const inspectionPlate =
      request.vehiclePlate.trim() || request.trailerPlate.trim();
    const livretePlate =
      request.trailerPlate.trim() || request.vehiclePlate.trim();
    const queryId = queryIdOverride ?? this.dependencies.newQueryId();

    const safeAsync = <T>(operation: () => Promise<T>): Promise<T> => {
      try {
        return Promise.resolve(operation());
      } catch (error) {
        return Promise.reject(error);
      }
    };

    const asf = safeAsync(() =>
      this.dependencies.queryAsf(
        inspectionPlate,
        queryId,
        request.asfDate
      )
    );

    const imtInspection = safeAsync(() =>
      this.dependencies.startImtInspection(inspectionPlate, queryId)
    );
    const imtLivrete = safeAsync(() =>
      this.dependencies.startImtLivrete(livretePlate, queryId)
    );

    return {
      ok: true,
      value: Promise.allSettled([imtInspection, imtLivrete, asf]).then(
        ([inspection, librete, insurance]) => ({
          queryId,
          targets: { inspectionPlate, livretePlate },
          imtInspection: inspection,
          imtLivrete: librete,
          asf: insurance
        })
      )
    };
  }
}
