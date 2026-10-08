import type { TelemetryService } from "../../services/telemetry/telemetry-service";
import type { AsfService, AsfServiceError } from "../insurance/asf-service";
import { normalizePlate } from "../../shared/validators/vehicle";
import type { ImtService } from "../imt/imt-service";
import { VehicleQueryController } from "./vehicle-query-controller";
import type { HistoryRecord, HistoryService } from "../history/history-service";

export interface VehicleModuleOptions {
  readonly asf: AsfService;
  readonly imt: ImtService;
  readonly telemetry: TelemetryService;
  readonly store: {
    setBusy(isBusy: boolean): void;
    setQueryId(queryId: string | null): void;
  };
  readonly history: HistoryService;
}

export class VehicleModule {
  private readonly controller: VehicleQueryController;
  private root: HTMLElement | null = null;
  private lastPlate = "";
  private lastTrailer = "";
  private lastDate = this.isoToday();
  private localNotice = "";

  constructor(private readonly options: VehicleModuleOptions) {
    this.controller = new VehicleQueryController({
      asf: options.asf,
      telemetry: options.telemetry,
      store: options.store,
      onQueryStarted: (queryId, request) => {
        options.history.add(request.plate, this.lastTrailer, queryId);
      }
    });
  }

  mount(root: HTMLElement): void {
    this.root = root;
    this.render();
  }

  reopen(record: HistoryRecord): void {
    this.lastPlate = record.veiculo;
    this.lastTrailer = record.reboque;
    this.lastDate = this.isoDateFromHistory(record.data);
    this.localNotice = "";
    this.render();
  }

  private render(): void {
    if (!this.root) return;

    const section = document.createElement("section");
    section.className = "vehicle-module";
    section.setAttribute("aria-label", "Consulta de veículo");

    const heading = document.createElement("div");
    heading.className = "verix-workspace-heading";

    const overline = document.createElement("span");
    overline.className = "verix-overline";
    overline.textContent = "CONSULTA OPERACIONAL";

    const title = document.createElement("h2");
    title.textContent = "Consulta de veículo";

    const description = document.createElement("p");
    description.textContent = "Seguro ASF e acesso direto aos canais IMT/RNSI do posto.";

    heading.append(overline, title, description);

    const form = document.createElement("form");
    form.className = "vehicle-query-form";

    const mainField = this.field(
      "MATRÍCULA DO VEÍCULO",
      "vehicle-plate",
      "AA-00-AA"
    );
    const trailerField = this.field(
      "REBOQUE / SEMIRREBOQUE",
      "vehicle-trailer",
      "Opcional"
    );

    const plateInput = mainField.input;
    const trailerInput = trailerField.input;
    plateInput.value = this.lastPlate;
    trailerInput.value = this.lastTrailer;

    const dateField = document.createElement("label");
    dateField.className = "vehicle-field";
    const dateLabel = document.createElement("span");
    dateLabel.textContent = "DATA DA CONSULTA ASF";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = this.lastDate;
    dateInput.autocomplete = "off";
    dateField.append(dateLabel, dateInput);

    const actions = document.createElement("div");
    actions.className = "vehicle-query-actions";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "vehicle-submit";
    submit.textContent =
      this.controller.snapshot.status === "loading"
        ? "A CONSULTAR…"
        : "CONSULTAR VEÍCULO";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "vehicle-clear";
    clear.textContent = "LIMPAR";
    clear.addEventListener("click", () => {
      this.lastPlate = "";
      this.lastTrailer = "";
      this.lastDate = this.isoToday();
      this.localNotice = "";
      this.render();
    });

    actions.append(submit, clear);

    form.append(mainField.wrapper, trailerField.wrapper, dateField, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit(
        plateInput.value,
        trailerInput.value,
        dateInput.value,
        submit
      );
    });

    if (this.localNotice) {
      const notice = document.createElement("div");
      notice.className = "vehicle-local-notice";
      notice.setAttribute("role", "alert");
      notice.textContent = this.localNotice;
      section.append(notice);
    }

    section.append(heading, form, this.renderResult(), this.renderImtActions());
    this.root.replaceChildren(section);
  }

  private async submit(
    plate: string,
    trailer: string,
    isoDate: string,
    submit: HTMLButtonElement
  ): Promise<void> {
    const normalizedPlate = normalizePlate(plate);
    if (!/^[A-Z0-9]{6,8}$/.test(normalizedPlate)) {
      this.showLocalError("Introduza uma matrícula válida.");
      return;
    }

    this.lastPlate = plate;
    this.lastTrailer = trailer;
    this.lastDate = isoDate || this.isoToday();
    this.localNotice = "";

    submit.disabled = true;
    submit.textContent = "A CONSULTAR…";

    const result = await this.controller.lookup({
      plate: normalizedPlate,
      date: isoDateToAsfDate(isoDate)
    });

    if (result.queryId) {
      this.options.history.updateInsurance(
        result.queryId,
        normalizedPlate,
        result.status === "success" && result.outcome.kind === "insured"
          ? "sim"
          : result.status === "success"
            ? "nao"
            : "desconhecido"
      );
    }

    if (!this.root) return;
    this.render();
    this.focusResult();
  }

  private renderResult(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "vehicle-result-wrap";

    const state = this.controller.snapshot;

    if (state.status === "idle") {
      const intro = document.createElement("div");
      intro.className = "vehicle-result vehicle-result-idle";
      intro.textContent =
        "Introduza a matrícula e execute uma consulta para obter o estado do seguro através do relay ASF V2.";
      wrap.append(intro);
      return wrap;
    }

    if (state.status === "loading") {
      const loading = document.createElement("div");
      loading.className = "vehicle-result vehicle-result-loading";
      loading.setAttribute("role", "status");
      loading.textContent = "A consultar o estado do seguro…";
      wrap.append(loading);
      return wrap;
    }

    if (state.status === "error") {
      const card = document.createElement("div");
      card.className = "vehicle-result vehicle-result-error";

      const title = document.createElement("strong");
      title.textContent = this.errorTitle(state.error.kind);

      const detail = document.createElement("p");
      detail.textContent = this.errorMessage(state.error);

      const meta = document.createElement("small");
      meta.textContent = `Consulta ${state.queryId}`;

      card.append(title, detail, meta);
      wrap.append(card);
      return wrap;
    }

    const card = document.createElement("div");
    card.className =
      state.outcome.kind === "insured"
        ? "vehicle-result vehicle-result-insured"
        : "vehicle-result vehicle-result-no-record";

    const title = document.createElement("strong");
    title.textContent =
      state.outcome.kind === "insured"
        ? "SEGURO ENCONTRADO"
        : "SEM SEGURO REGISTADO";

    card.append(title);

    if (state.outcome.kind === "insured") {
      this.appendValue(card, "Matrícula", state.outcome.node.license);
      this.appendValue(card, "Seguradora", state.outcome.node.entity);
      this.appendValue(card, "Apólice", state.outcome.node.policy);
      this.appendValue(card, "Início", state.outcome.node.startDate);
      this.appendValue(card, "Fim", state.outcome.node.endDate);
      this.appendValue(card, "Código", state.outcome.node.code);
    } else {
      const text = document.createElement("p");
      text.textContent =
        "A resposta ASF foi válida, mas não contém um nó de seguro com valor de licença.";
      card.append(text);
    }

    const query = document.createElement("small");
    query.textContent = `Consulta ${state.queryId}`;
    card.append(query);

    wrap.append(card);
    return wrap;
  }

  private renderImtActions(): HTMLElement {
    const actions = document.createElement("section");
    actions.className = "vehicle-imt-actions";

    const title = document.createElement("div");
    title.className = "vehicle-imt-title";
    title.textContent = "RNSI / IMT";

    const note = document.createElement("p");
    note.textContent =
      "O RNSI do posto usa um endereço HTTP interno. A V2 não tenta carregá-lo dentro de HTTPS; abre o serviço externo no ambiente do posto e copia a matrícula.";

    const buttons = document.createElement("div");
    buttons.className = "vehicle-imt-buttons";

    const inspection = this.createImtButton(
      "ABRIR INSPEÇÃO",
      "rnsi-inspecao"
    );
    const librete = this.createImtButton(
      "ABRIR LIVRETE",
      "rnsi-livrete"
    );

    buttons.append(inspection, librete);
    actions.append(title, note, buttons);
    return actions;
  }

  private createImtButton(
    label: string,
    source: "rnsi-inspecao" | "rnsi-livrete"
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vehicle-imt-button";
    button.textContent = label;
    button.addEventListener("click", () => {
      const plate = normalizePlate(
        source === "rnsi-livrete" ? this.lastTrailer || this.lastPlate : this.lastPlate
      );

      const popup = this.options.imt.open(
        source === "rnsi-inspecao" ? "inspecao" : "livrete",
        plate
      );
      void copyText(plate);

      this.options.telemetry.track("external_tool_open", "consulta", {
        source,
        queryId: this.controller.snapshot.queryId
      });

      if (!popup) {
        this.showLocalError(
          "O browser bloqueou a abertura do RNSI. Permita pop-ups para o VÉRIX."
        );
      }
    });
    return button;
  }

  private field(label: string, id: string, placeholder: string): {
    wrapper: HTMLLabelElement;
    input: HTMLInputElement;
  } {
    const wrapper = document.createElement("label");
    wrapper.className = "vehicle-field";
    const text = document.createElement("span");
    text.textContent = label;

    const input = document.createElement("input");
    input.id = id;
    input.type = "text";
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;

    wrapper.append(text, input);
    return { wrapper, input };
  }

  private appendValue(parent: HTMLElement, label: string, value: string | null): void {
    const row = document.createElement("div");
    row.className = "vehicle-value";
    const key = document.createElement("span");
    key.textContent = label;
    const val = document.createElement("strong");
    val.textContent = value || "—";
    row.append(key, val);
    parent.append(row);
  }

  private errorTitle(kind: string): string {
    switch (kind) {
      case "auth":
        return "AUTORIZAÇÃO VÉRIX RECUSADA";
      case "rate-limited":
        return "SERVIÇO TEMPORARIAMENTE LIMITADO";
      case "timeout":
        return "TIMEOUT ASF";
      case "network":
        return "SEM COMUNICAÇÃO COM ASF";
      case "invalid-json":
      case "invalid-response":
        return "RESPOSTA ASF INVÁLIDA";
      default:
        return "ERRO NA CONSULTA ASF";
    }
  }

  private showLocalError(message: string): void {
    this.localNotice = message;
    this.render();
  }

  private errorMessage(error: AsfServiceError): string {
    return error.kind === "graphql"
      ? error.messages.join(" · ")
      : error.message;
  }

  private focusResult(): void {
    const result = this.root?.querySelector(".vehicle-result");
    if (result instanceof HTMLElement) {
      result.tabIndex = -1;
      result.focus({ preventScroll: false });
    }
  }

  private isoDateFromHistory(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return this.isoToday();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private isoToday(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

}

function isoDateToAsfDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  return `${match[1]}/${match[2]}/${match[3]}`;
}

async function copyText(value: string): Promise<void> {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    // Continue with a DOM fallback for browsers without Clipboard permission.
  }

  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "true");
  area.className = "vehicle-copy-buffer";
  document.body.append(area);
  area.select();

  try {
    document.execCommand("copy");
  } finally {
    area.remove();
  }
}
