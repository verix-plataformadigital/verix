import type { AppStore } from "../../app/state/app-store";
import type { TelemetryService } from "../../services/telemetry/telemetry-service";
import type { AsfOutcome } from "../insurance/asf-classifier";
import type { AsfService, AsfServiceError } from "../insurance/asf-service";

export type VehicleLookupViewState =
  | { readonly status: "idle"; readonly queryId: null; readonly outcome: null; readonly error: null }
  | { readonly status: "loading"; readonly queryId: string; readonly outcome: null; readonly error: null }
  | { readonly status: "success"; readonly queryId: string; readonly outcome: AsfOutcome; readonly error: null }
  | { readonly status: "error"; readonly queryId: string; readonly outcome: null; readonly error: AsfServiceError };

export interface VehicleQueryControllerOptions {
  readonly asf: Pick<AsfService, "query">;
  readonly telemetry: Pick<TelemetryService, "newQueryId" | "track">;
  readonly store: Pick<AppStore, "setBusy" | "setQueryId">;
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
    this.options.telemetry.track("vehicle_insurance_pending", "consulta", {
      queryId
    });

    const result = await this.options.asf.query({
      matricula: request.plate,
      date: request.date
    });

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
