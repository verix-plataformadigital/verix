import { DefaultConnectivityService } from "../services/connectivity/connectivity.service";

export async function bootstrap(root: HTMLElement): Promise<void> {
  root.textContent = "VÉRIX — núcleo de reengenharia carregado.";

  const connectivity = new DefaultConnectivityService();
  const snapshot = await connectivity.probe();

  root.dataset.connectivity = snapshot.state;
  root.dataset.backendReachable = String(snapshot.backendReachable);
}
