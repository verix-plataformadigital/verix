import { describe, expect, it } from "vitest";
import { AppStore } from "../../src/app/state/app-store";

describe("AppStore", () => {
  it("mantém um único estado explícito", () => {
    const store = new AppStore();
    expect(store.snapshot.activeModule).toBe("main");
    expect(store.snapshot.currentQueryId).toBeNull();
  });

  it("notifica subscribers e permite unsubscribe", () => {
    const store = new AppStore();
    const states: string[] = [];
    const unsubscribe = store.subscribe((state) => {
      states.push(state.activeModule);
    });

    store.setModule("cinemometer");
    unsubscribe();
    store.setModule("history");

    expect(states).toEqual(["main", "cinemometer"]);
  });

  it("não muta o snapshot anterior", () => {
    const store = new AppStore();
    const before = store.snapshot;
    store.setBusy(true);
    expect(before.isBusy).toBe(false);
    expect(store.snapshot.isBusy).toBe(true);
  });
});
