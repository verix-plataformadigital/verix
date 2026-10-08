import { AppShell } from "./ui/app-shell";
import { AppStore } from "./state/app-store";
import { DefaultConnectivityService } from "../services/connectivity/connectivity.service";
import { TelemetryService } from "../services/telemetry/telemetry-service";
import { TelemetryScheduler } from "../services/telemetry/telemetry-scheduler";
import { runtimeConfig } from "../config/runtime-config";

function browserStorage(
  kind: "local" | "session"
): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export async function bootstrap(root: HTMLElement): Promise<void> {
  const store = new AppStore();
  const shell = new AppShell({ root, store });
  shell.mount();

  const telemetry = new TelemetryService({
    endpoint: runtimeConfig.telemetryEndpoint,
    appVersion: runtimeConfig.appVersion,
    buildId: runtimeConfig.buildId,
    localStorage: browserStorage("local"),
    sessionStorage: browserStorage("session")
  });

  const scheduler = new TelemetryScheduler({
    telemetry,
    lifecycle: typeof document !== "undefined" ? document : null
  });

  scheduler.start();

  const connectivity = new DefaultConnectivityService();
  const snapshot = await connectivity.probe();
  store.setConnectivity(snapshot.state);

  root.dataset.buildId = runtimeConfig.buildId;
  root.dataset.installationId = telemetry.installationId;
}
