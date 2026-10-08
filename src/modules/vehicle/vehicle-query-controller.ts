import type {
  AsfOutcome
} from "../insurance/asf-classifier";
import type {
  AsfServiceError,
  AsfServiceRequest,
  AsfServiceResult
} from "../insurance/asf-service";
import type { TelemetryEventName } from "../../services/telemetry/telemetry-contract";

export type VehicleLookupViewState =
  | { readonly status: "idle"; readonly queryId: null; readonly outcome: null; readonly error: null }
  | { readonly status: "loading"; readonly queryId: string; readonly outcome: null; readonly error: null }
  | { readonly status: "success"; readonly queryId: string; readonly outcome: AsfOutcome; readonly error: null }
  | { readonly status: "error"; readonly queryId: string; readonly outcome: null; readonly error: AsfServiceError };

export interface VehicleAsfClient {
  query(request: AsfServiceRequest): Promise<AsfServiceResult>;
}

export interface VehicleTelemetryClient {
  newQueryId(): string;
  track(
    event: TelemetryEventName,
    module: string | null,
    metadata?: Readonly<Record<string, unknown>>
  ): unknown;
}

export interface VehicleLookupStore {
  setBusy(isBusy: boolean): void;
  setQueryId(queryId: string | null): void;
}

export interface VehicleQueryControllerOptions {
  readonly asf: VehicleAsfClient;
  readonly telemetry: VehicleTelemetryClient;
  readonly store: VehicleLookupStore;
  readonly now?: () => Date;
}

export interface VehicleQueryRequest {
  readonly plate: string;
  readonly date: string;
}

export class VehicleQueryController {
  private readonly now: () => Date;
  private sequence = 0;
  private viewState: VehicleLookupViewState = {
    status: "idle",
    queryId: null,
    outcome: null,
    error: null
  };

  constructor(private readonly options: VehicleQueryControllerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  get snapshot(): VehicleLookupViewState {
    return this.viewState;
  }

  async lookup(request: VehicleQueryRequest): Promise<VehicleLookupViewState> {
    const queryId = this.options.telemetry.newQueryId();
    const sequence = ++this.sequence;

    this.viewState = {
      status: "loading",
      queryId,
      outcome: null,
      error: null
    };

    this.options.store.setBusy(true);
    this.options.store.setQueryId(queryId);

    this.options.telemetry.track("vehicle_lookup", "consulta", { queryId });
    this.options.telemetry.track("vehicle_insurance_pending", "consulta", { queryId });

    let result: AsfServiceResult;

    try {
      result = await this.options.asf.query({
        matricula: request.plate,
        date: request.date
      });
    } catch {
      result = {
        ok: false,
        error: {
          kind: "network",
          message: "Falha inesperada na comunicação com o serviço ASF."
        }
      };
    }

    if (sequence !== this.sequence) {
      return this.viewState;
    }

    this.options.store.setBusy(false);

    if (!result.ok) {
      this.viewState = {
        status: "error",
        queryId,
        outcome: null,
        error: result.error
      };

      this.options.telemetry.track("vehicle_insurance_error", "consulta", {
        queryId,
        errorType: result.error.kind
      });

      return this.viewState;
    }

    this.viewState = {
      status: "success",
      queryId,
      outcome: result.value,
      error: null
    };

    if (result.value.kind === "insured") {
      this.options.telemetry.track("vehicle_insurance_yes", "consulta", {
        queryId,
        source: "asf-relay"
      });
    } else {
      this.options.telemetry.track("vehicle_insurance_no", "consulta", {
        queryId,
        source: "asf-relay"
      });
    }

    return this.viewState;
  }

  todayAsfDate(): string {
    const date = this.now();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  }
}
