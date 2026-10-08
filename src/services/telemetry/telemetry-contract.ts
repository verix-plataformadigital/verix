export const TELEMETRY_EVENTS = [
  "app_open",
  "heartbeat",
  "vehicle_lookup",
  "vehicle_insurance_pending",
  "vehicle_insurance_yes",
  "vehicle_insurance_no",
  "vehicle_insurance_error",
  "imt_loaded",
  "module_open",
  "history_open",
  "history_reopen",
  "external_tool_open",
  "alcohol_lookup",
  "cinemometer_operation_start",
  "cinemometer_speed_entry",
  "cinemometer_calculation",
  "cinemometer_copy_code",
  "cinemometer_copy_text",
  "cinemometer_copy_location",
  "cinemometer_profile_select",
  "cinemometer_profile_new",
  "cinemometer_profile_duplicate",
  "cinemometer_profile_delete",
  "cinemometer_profile_save",
  "legislation_category_open",
  "legislation_search",
  "legislation_copy",
  "legislation_favorite_toggle"
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[number];

export interface TelemetryEvent {
  readonly eventId: string;
  readonly installationId: string;
  readonly sessionId?: string;
  readonly tabId?: string;
  readonly queryId?: string;
  readonly event: TelemetryEventName;
  readonly module?: string;
  readonly occurredAt: string;
  readonly appVersion: string;
  readonly deviceType?: string;
  readonly browser?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TelemetryBatch {
  readonly events: readonly TelemetryEvent[];
}
