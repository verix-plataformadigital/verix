export type ImtSource = "inspecao" | "livrete";

export interface ImtFrameRequest {
  readonly frameId: string;
  readonly overlayId: string;
  readonly url: string;
  readonly source: ImtSource;
  readonly sequence: number;
}

export type ImtLoadState =
  | "loading"
  | "loaded"
  | "offline"
  | "timeout"
  | "cancelled";

export interface ImtLoadResult {
  readonly state: ImtLoadState;
  readonly sequence: number;
}
