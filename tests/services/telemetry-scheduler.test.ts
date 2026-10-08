import { describe, expect, it, vi } from "vitest";
import { TelemetryScheduler, type TelemetrySchedulerClient } from "../../src/services/telemetry/telemetry-scheduler";

function createClient(overrides: Partial<TelemetrySchedulerClient> = {}) {
  const client: TelemetrySchedulerClient = {
    track: vi.fn(),
    flush: vi.fn().mockResolvedValue({ ok: true, sent: 1 }),
    flushBeacon: vi.fn().mockReturnValue(1),
    shouldFlushImmediately: vi.fn().mockReturnValue(false),
    ...overrides
  };
  return client;
}

describe("TelemetryScheduler", () => {
  it("emite app_open e inicia heartbeat/flush periódicos", async () => {
    vi.useFakeTimers();
    try {
      const lifecycle = new EventTarget();
      const telemetry = createClient();
      const scheduler = new TelemetryScheduler({
        telemetry,
        lifecycle,
        heartbeatMs: 45_000,
        flushMs: 15_000
      });

      scheduler.start();
      expect(telemetry.track).toHaveBeenCalledWith("app_open", "app");

      await vi.advanceTimersByTimeAsync(45_000);
      expect(telemetry.track).toHaveBeenCalledWith("heartbeat", null);
      expect(telemetry.track).toHaveBeenCalledTimes(2);

      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("usa flushBeacon no pagehide", () => {
    const lifecycle = new EventTarget();
    const telemetry = createClient();
    const scheduler = new TelemetryScheduler({ telemetry, lifecycle });

    scheduler.start();
    lifecycle.dispatchEvent(new Event("pagehide"));

    expect(telemetry.flushBeacon).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("agenda retry quando o backend falha", async () => {
    vi.useFakeTimers();
    try {
      const telemetry = createClient({
        flush: vi.fn()
          .mockResolvedValueOnce({ ok: false, sent: 0, retryAfterMs: null })
          .mockResolvedValueOnce({ ok: true, sent: 2 })
      });
      const scheduler = new TelemetryScheduler({
        telemetry,
        retryDelaysMs: [2_000, 5_000]
      });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(telemetry.flush).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(telemetry.flush).toHaveBeenCalledTimes(2);

      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("respeita Retry-After do servidor quando existe", async () => {
    vi.useFakeTimers();
    try {
      const telemetry = createClient({
        flush: vi.fn()
          .mockResolvedValueOnce({ ok: false, sent: 0, retryAfterMs: 7_000 })
          .mockResolvedValueOnce({ ok: true, sent: 1 })
      });
      const scheduler = new TelemetryScheduler({ telemetry, retryDelaysMs: [1_000] });

      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(telemetry.flush).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(6_999);
      expect(telemetry.flush).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await vi.runOnlyPendingTimersAsync();
      expect(telemetry.flush).toHaveBeenCalledTimes(2);

      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("não duplica timers quando start é chamado duas vezes", () => {
    vi.useFakeTimers();
    try {
      const telemetry = createClient();
      const scheduler = new TelemetryScheduler({
        telemetry,
        heartbeatMs: 1_000,
        flushMs: 2_000
      });

      scheduler.start();
      scheduler.start();
      expect(telemetry.track).toHaveBeenCalledTimes(1);

      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
