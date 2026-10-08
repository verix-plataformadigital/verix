import type { AppState } from "./app-state";
import { INITIAL_APP_STATE, type VerixModule } from "./app-state";

export type AppStateListener = (state: AppState) => void;

export class AppStore {
  private state: AppState = INITIAL_APP_STATE;
  private readonly listeners = new Set<AppStateListener>();

  get snapshot(): AppState {
    return this.state;
  }

  subscribe(listener: AppStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setModule(module: VerixModule): void {
    this.update({ activeModule: module });
  }

  setBusy(isBusy: boolean): void {
    this.update({ isBusy });
  }

  setConnectivity(connectivity: AppState["connectivity"]): void {
    this.update({ connectivity });
  }

  setQueryId(currentQueryId: string | null): void {
    this.update({ currentQueryId });
  }

  private update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}
