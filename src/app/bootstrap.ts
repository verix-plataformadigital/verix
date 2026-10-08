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
import { CinemometerModule } from "../modules/cinemometer/cinemometer-module";
import { CinemometerProfileService } from "../modules/cinemometer/cinemometer-profile-service";
import { LegislationModule } from "../modules/legislation/legislation-module";
import { AlcoholModule } from "../modules/alcohol/alcohol-module";
import { SettingsService } from "../modules/settings/settings-service";
import { SettingsModule } from "../modules/settings/settings-module";
import { ToolsModule } from "../modules/tools/tools-module";
import { InformationModule } from "../modules/information/information-module";
import { ImtService, browserImtWindowAdapter } from "../modules/imt/imt-service";

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
  const cinemometerProfiles = new CinemometerProfileService(localStorage);
  const cinemometerModule = new CinemometerModule({
    telemetry,
    profiles: cinemometerProfiles
  });
  const legislationModule = new LegislationModule({ telemetry, storage: localStorage });
  const alcoholModule = new AlcoholModule({ telemetry });
  const settings = new SettingsService(localStorage);
  settings.applyToDocument(document);
  const settingsModule = new SettingsModule({ settings, telemetry });
  const toolsModule = new ToolsModule({ telemetry });
  const informationModule = new InformationModule({ telemetry });
  const imt = new ImtService(browserImtWindowAdapter());
  const vehicleModule = new VehicleModule({
    asf,
    imt,
    telemetry,
    store,
    history,
    historyEnabled: () => settings.snapshot().history
  });

  const historyModule = new HistoryModule({
    history,
    telemetry,
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
      if (module === "cinemometer") {
        cinemometerModule.mount(workspace);
        return true;
      }
      if (module === "legislation") {
        legislationModule.mount(workspace);
        return true;
      }
      if (module === "alcohol") {
        alcoholModule.mount(workspace);
        return true;
      }
      if (module === "settings") {
        settingsModule.mount(workspace);
        return true;
      }
      if (module === "tools") {
        toolsModule.mount(workspace);
        return true;
      }
      if (module === "information") {
        informationModule.mount(workspace);
        return true;
      }
      return false;
    }
  });

  shell.mount();
  scheduler.start();

  // navigator.onLine is only a browser/network heuristic. Probe the gate
  // endpoint's CORS preflight so the UI can distinguish network from backend.
  const connectivity = new DefaultConnectivityService({
    probeUrl: runtimeConfig.gateEndpoint,
    probeMethod: "OPTIONS"
  });
  const snapshot = await connectivity.probe();
  store.setConnectivity(snapshot.state);
  store.setBackendReachable(snapshot.backendReachable);

  root.dataset.buildId = runtimeConfig.buildId;
  root.dataset.installationId = telemetry.installationId;
}
