import { AppShell } from "./ui/app-shell";
import { AppStore } from "./state/app-store";
import { DefaultConnectivityService } from "../services/connectivity/connectivity.service";

export async function bootstrap(root: HTMLElement): Promise<void> {
  const store = new AppStore();
  const shell = new AppShell({ root, store });
  shell.mount();

  const connectivity = new DefaultConnectivityService();
  const snapshot = await connectivity.probe();

  store.setConnectivity(snapshot.state);
}
