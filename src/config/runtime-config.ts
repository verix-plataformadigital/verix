export interface VerixRuntimeConfig {
  readonly buildId: string;
  readonly appVersion: string;
  readonly telemetryEndpoint: string;
  readonly gateEndpoint: string;
  readonly asfRelayEndpoint: string;
}

declare const __VERIX_BUILD_ID__: string;

export const runtimeConfig: VerixRuntimeConfig = {
  buildId: __VERIX_BUILD_ID__,
  // Keep the product version aligned with the current production runtime. Build IDs are internal release identities.
  appVersion: "1.5",
  telemetryEndpoint:
    "https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/telemetry-v2",
  gateEndpoint:
    "https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/verix-gate-v1",
  asfRelayEndpoint:
    "https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/asf-proxy-v1"
};
