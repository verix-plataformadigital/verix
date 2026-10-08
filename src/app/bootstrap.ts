import { AppShell } from "./ui/app-shell";
import { AppStore } from "./state/app-store";
import { DefaultConnectivityService } from "../services/connectivity/connectivity.service";
import { GateService } from "../services/security/gate-service";
import { AsfService } from "../modules/insurance/asf-service";
import { VehicleModule } from "../modules/vehicle/vehicle-module";
import { TelemetryService } from "../services/telemetry/telemetry-service";
import { TelemetryScheduler } from "../services/telemetry/telemetry-scheduler";
import { runtimeConfig } from "../config/runtime-config";
import { HistoryService } from "../modules/history/history-service";
import { HistoryModule } from "../modules/history/history-module";

function browserStorage(kind: "local" | "session"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export async function bootstrap(root: HTMLElement): Promise<void> {
  const store = new AppStore();

  const localStorage = browserStorage("local");
  const sessionStorage = browserStorage("session");

  const telemetry = new TelemetryService({
    endpoint: runtimeConfig.telemetryEndpoint,
    appVersion: runtimeConfig.appVersion,
    buildId: runtimeConfig.buildId,
    localStorage,
    sessionStorage
  });

  const scheduler = new TelemetryScheduler({
    telemetry,
    lifecycle: typeof document !== "undefined" ? document : null
  });

  const gate = new GateService({
    endpoint: runtimeConfig.gateEndpoint,
    identity: {
      installationId: telemetry.installationId,
      sessionId: telemetry.sessionId,
      tabId: telemetry.tabId,
      buildId: runtimeConfig.buildId
    }
  });

  const asf = new AsfService({
    relayUrl: runtimeConfig.asfRelayEndpoint,
    gate
  });

  const history = new HistoryService(localStorage);
  const vehicleModule = new VehicleModule({
    asf,
    telemetry,
    store,
    history
  });

  const historyModule = new HistoryModule({
    history,
    onReopen: (record) => {
      store.setModule("vehicle");
      vehicleModule.reopen(record);
    }
  });

  const shell = new AppShell({
    root,
    store,
    moduleRenderer: (workspace, module) => {
      if (module === "vehicle") {
        vehicleModule.mount(workspace);
        return true;
      }
      if (module === "history") {
        historyModule.mount(workspace);
        return true;
      }
      return false;
    }
  });

  shell.mount();
  scheduler.start();

  const connectivity = new DefaultConnectivityService();
  const snapshot = await connectivity.probe();
  store.setConnectivity(snapshot.state);
  store.setBackendReachable(snapshot.backendReachable);

  root.dataset.buildId = runtimeConfig.buildId;
  root.dataset.installationId = telemetry.installationId;
}
