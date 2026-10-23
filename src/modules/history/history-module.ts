import type { HistoryRecord, HistoryService } from "./history-service";
import type { TelemetryService } from "../../services/telemetry/telemetry-service";

export interface HistoryModuleOptions {
  readonly history: HistoryService;
  readonly telemetry?: Pick<TelemetryService, "track">;
  readonly onReopen: (record: HistoryRecord) => void;
}

export class HistoryModule {
  private root: HTMLElement | null = null;

  constructor(private readonly options: HistoryModuleOptions) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.options.telemetry?.track("history_open", "history");
    this.render();
  }

  private render(): void {
    if (!this.root) return;

    const section = document.createElement("section");
    section.className = "history-module";
    section.setAttribute("aria-label", "Histórico de consultas");

    const head = document.createElement("div");
    head.className = "history-module-head";

    const title = document.createElement("div");
    const kicker = document.createElement("span");
    kicker.className = "verix-overline";
    kicker.textContent = "REGISTO LOCAL";

    const h2 = document.createElement("h2");
    h2.textContent = "Histórico";
    title.append(kicker, h2);

    const controls = document.createElement("div");
    controls.className = "history-module-controls";

    const count = document.createElement("span");
    count.className = "history-count";
    count.textContent = `${this.options.history.list().length} / ${100} REGISTOS`;

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "history-clear";
    clear.textContent = "LIMPAR";
    clear.addEventListener("click", () => {
      this.options.history.removeAll();
      this.render();
    });

    controls.append(count, clear);
    head.append(title, controls);

    const list = document.createElement("div");
    list.className = "history-list";

    const records = this.options.history.list();
    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty-v2";
      empty.textContent =
        "Ainda não existem consultas registadas neste equipamento.";
      list.append(empty);
    } else {
      records.forEach((record, index) => {
        list.append(this.row(record, index));
      });
    }

    section.append(head, list);
    this.root.replaceChildren(section);
  }

  private row(record: HistoryRecord, index: number): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-row-v2";
    button.addEventListener("click", () => {
      this.options.telemetry?.track("history_reopen", "history", {
        queryId: record.id
      });
      this.options.onReopen(record);
    });

    const indexEl = document.createElement("span");
    indexEl.className = "history-index-v2";
    indexEl.textContent = `#${String(index + 1).padStart(2, "0")}`;

    const plates = document.createElement("span");
    plates.className = "history-plates-v2";
    plates.append(this.plate(record.veiculo, false));
    if (record.reboque) plates.append(this.plate(record.reboque, true));

    const insurance = document.createElement("span");
    insurance.className =
      `history-insurance-v2 history-insurance-v2-${record.seguro}`;
    insurance.textContent =
      record.seguro === "sim"
        ? "SEGURO"
        : record.seguro === "nao"
          ? "SEM SEGURO"
          : record.seguro === "pendente"
            ? "A VERIFICAR"
            : "DESCONHECIDO";

    const date = document.createElement("time");
    date.className = "history-date-v2";
    date.dateTime = record.data;
    date.textContent = formatHistoryDate(record.data);

    const action = document.createElement("span");
    action.className = "history-action-v2";
    action.textContent = "REABRIR →";

    button.append(indexEl, plates, insurance, date, action);
    button.setAttribute(
      "aria-label",
      `Reabrir consulta ${record.veiculo || record.reboque || "sem matrícula"}`
    );

    return button;
  }

  private plate(value: string, trailer: boolean): HTMLElement {
    const item = document.createElement("span");
    item.className = trailer
      ? "plate-mini-v2 plate-trailer-v2"
      : "plate-mini-v2";
    item.textContent = value;
    return item;
  }
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(date);
}
