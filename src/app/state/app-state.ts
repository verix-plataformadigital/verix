import type { ConnectivityState } from "../../shared/types/connectivity";

export type VerixModule =
  | "main"
  | "vehicle"
  | "insurance"
  | "imt"
  | "history"
  | "cinemometer"
  | "legislation"
  | "alcohol"
  | "settings"
  | "tools";

export interface AppState {
  readonly activeModule: VerixModule;
  readonly isBusy: boolean;
  readonly connectivity: ConnectivityState;
  readonly backendReachable: boolean | null;
  readonly currentQueryId: string | null;
}

export const INITIAL_APP_STATE: AppState = {
  activeModule: "main",
  isBusy: false,
  connectivity: "unknown",
  backendReachable: null,
  currentQueryId: null
};
