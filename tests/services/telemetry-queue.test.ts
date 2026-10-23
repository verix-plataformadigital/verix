import { describe, expect, it } from "vitest";
import { TelemetryQueue } from "../../src/services/telemetry/telemetry-queue";

const event = (id: string) => ({
  eventId: id,
  installationId: "install",
  event: "heartbeat" as const,
  buildId: "2.0",
  occurredAt: "2026-10-08T18:00:00.000Z",
  appVersion: "2.0.0",
  metadata: {}
});

describe("TelemetryQueue", () => {
  it("limita a fila aos eventos mais recentes", () => {
    const q = new TelemetryQueue({ maxSize: 2 });
    q.enqueue(event("1"));
    q.enqueue(event("2"));
    q.enqueue(event("3"));

    expect(q.size).toBe(2);
    expect(q.peek(2).map((x) => x.eventId)).toEqual(["2", "3"]);
  });

  it("remove apenas o prefixo efetivamente enviado", () => {
    const q = new TelemetryQueue();
    q.enqueue(event("1"));
    q.enqueue(event("2"));
    q.enqueue(event("3"));

    expect(q.acknowledge(["2"])).toBe(0);
    expect(q.acknowledge(["1", "2"])).toBe(2);
    expect(q.peek(2).map((x) => x.eventId)).toEqual(["3"]);
  });

  it("descarta JSON de fila inválido", () => {
    const q = new TelemetryQueue();
    q.enqueue(event("1"));
    q.hydrate("{bad");

    expect(q.size).toBe(0);
  });

  it("ignora itens hidratados sem o envelope mínimo", () => {
    const q = new TelemetryQueue();
    q.hydrate(JSON.stringify([{ eventId: "1" }]));

    expect(q.size).toBe(0);
  });
});
