import { describe, expect, it } from "vitest";
import {
  HISTORY_KEY,
  HISTORY_LIMIT,
  HistoryService
} from "../../src/modules/history/history-service";

function storage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  };
}

describe("HistoryService", () => {
  it("mantém no máximo 100 registos", () => {
    const s = storage();
    let tick = 0;
    const service = new HistoryService(
      s,
      () => new Date(2026, 0, ++tick),
      () => String(tick)
    );

    for (let i = 0; i < HISTORY_LIMIT + 4; i++) {
      service.add(`AA00${String(i).padStart(2, "0")}`, "", `q-${i}`);
    }

    expect(service.list()).toHaveLength(HISTORY_LIMIT);
    expect(service.list()[0]?.id).toBe("q-103");
  });

  it("atualiza por queryId e protege pesquisas repetidas", () => {
    const s = storage();
    const service = new HistoryService(
      s,
      () => new Date("2026-10-08T19:00:00Z"),
      () => "hist-1"
    );

    service.add("12AA34", "", "q-old");
    service.add("12AA34", "", "q-new");

    expect(service.updateInsurance("q-old", "12AA34", "sim")).toBe(true);
    expect(service.list()[1]?.seguro).toBe("sim");
    expect(service.list()[0]?.seguro).toBe("pendente");
  });

  it("persiste e limpa o histórico local", () => {
    const s = storage();
    const service = new HistoryService(
      s,
      () => new Date("2026-10-08T19:00:00Z"),
      () => "1"
    );

    service.add("99ZZ99", "", "q-1");
    expect(s.values.has(HISTORY_KEY)).toBe(true);

    service.removeAll();
    expect(service.list()).toHaveLength(0);
    expect(s.values.has(HISTORY_KEY)).toBe(false);
  });

  it("persists the selected ASF date and tolerates older records without it", () => {
    const s = storage();
    const service = new HistoryService(
      s,
      () => new Date("2026-10-08T19:00:00Z"),
      () => "hist-date"
    );

    service.add("12AB34", "", "q-date", "2026/01/31");
    const reloaded = new HistoryService(s);

    expect(reloaded.list()[0]).toMatchObject({
      id: "q-date",
      dataConsultaAsf: "2026/01/31"
    });
  });

});
