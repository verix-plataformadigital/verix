export type VerixModule =
  | "main"
  | "vehicle"
  | "insurance"
  | "imt"
  | "history"
  | "cinemometer"
  | "legislation"
  | "alcohol"
  | "settings";

export interface AppState {
  readonly activeModule: VerixModule;
  readonly isBusy: boolean;
  readonly connectivity: "unknown" | "online" | "offline" | "backend-offline" | "timeout" | "network-error";
  readonly currentQueryId: string | null;
}

export const INITIAL_APP_STATE: AppState = {
  activeModule: "main",
  isBusy: false,
  connectivity: "unknown",
  currentQueryId: null
};
