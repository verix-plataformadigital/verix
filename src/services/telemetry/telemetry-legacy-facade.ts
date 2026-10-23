import type { TelemetryEventName } from "./telemetry-contract";

export interface TelemetryFacadeSource {
  readonly installationId: string;
  readonly endpoint: string;
  readonly queueSize: number;
  newQueryId(): string;
  track(
    event: TelemetryEventName,
    module: string | null,
    metadata?: Readonly<Record<string, unknown>>
  ): unknown;
  flush(): Promise<unknown>;
  flushBeacon(): number;
}

export interface VerixTelemetryLegacyFacade {
  readonly version: 2;
  readonly enabled: boolean;
  readonly installationId: string;
  readonly endpoint: string;
  readonly queueSize: number;
  newQueryId(): string;
  track(
    event: TelemetryEventName,
    module?: string | null,
    metadata?: Readonly<Record<string, unknown>>
  ): unknown;
  flush(): Promise<unknown>;
  flushBeacon(): number;
}

export function createTelemetryLegacyFacade(
  service: TelemetryFacadeSource,
  enabled = true
): VerixTelemetryLegacyFacade {
  return {
    version: 2,
    enabled,
    get installationId() { return service.installationId; },
    get endpoint() { return service.endpoint; },
    get queueSize() { return service.queueSize; },
    newQueryId: () => service.newQueryId(),
    track: (event, module = null, metadata) => service.track(event, module, metadata),
    flush: () => service.flush(),
    flushBeacon: () => service.flushBeacon()
  };
}
