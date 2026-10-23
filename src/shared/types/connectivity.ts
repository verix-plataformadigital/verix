export type ConnectivityState =
  | "unknown"
  | "online"
  | "offline"
  | "backend-offline"
  | "timeout"
  | "api-error"
  | "auth-error"
  | "rate-limited"
  | "network-error"
  | "unknown-error";

export interface ConnectivitySnapshot {
  readonly state: ConnectivityState;
  readonly checkedAt: number;
  readonly backendReachable: boolean | null;
}
