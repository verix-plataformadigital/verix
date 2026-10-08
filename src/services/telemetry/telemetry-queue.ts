import type { TelemetryEvent } from "./telemetry-contract";

export interface TelemetryQueueOptions {
  readonly maxSize?: number;
}

export class TelemetryQueue {
  private readonly maxSize: number;
  private events: TelemetryEvent[] = [];

  constructor(options: TelemetryQueueOptions = {}) {
    this.maxSize = options.maxSize ?? 300;
  }

  hydrate(serialized: string | null): void {
    if (!serialized) {
      this.events = [];
      return;
    }

    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!Array.isArray(parsed)) {
        this.events = [];
        return;
      }

      this.events = parsed.filter(isTelemetryEvent).slice(-this.maxSize);
    } catch {
      this.events = [];
    }
  }

  serialize(): string {
    return JSON.stringify(this.events);
  }

  enqueue(event: TelemetryEvent): void {
    this.events.push(event);
    this.events = this.events.slice(-this.maxSize);
  }

  peek(limit: number): readonly TelemetryEvent[] {
    return this.events.slice(0, Math.max(0, limit));
  }

  acknowledge(eventIds: readonly string[]): number {
    if (eventIds.length === 0) return 0;

    let removed = 0;
    while (removed < eventIds.length && this.events[removed]?.eventId === eventIds[removed]) {
      removed += 1;
    }

    if (removed > 0) this.events.splice(0, removed);
    return removed;
  }

  get size(): number {
    return this.events.length;
  }
}

function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;

  return (
    typeof item.eventId === "string" &&
    typeof item.installationId === "string" &&
    typeof item.event === "string" &&
    typeof item.buildId === "string" &&
    typeof item.occurredAt === "string" &&
    typeof item.appVersion === "string"
  );
}
