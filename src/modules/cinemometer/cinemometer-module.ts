import type { TelemetryService } from "../../services/telemetry/telemetry-service";
import { CinemometerContextPanel } from "./cinemometer-context-panel";
import type { CinemometerProfileService } from "./cinemometer-profile-service";
import { buildCinemometerOperationalText } from "./cinemometer-text";
import {
  calculateDeducedSpeedForCinemometer,
  classifyExcess,
  defaultSpeedLimit,
  emaForCinemometer,
  operationalCodeForVehicle,
  type CinemometerMode,
  type CinemometerType,
  type SpeedRegime,
  type VehicleType,
  type VerificationType
} from "./cinemometer-domain";

export interface CinemometerModuleOptions {
  readonly telemetry: Pick<TelemetryService, "track">;
  readonly profiles?: CinemometerProfileService;
  readonly contextCollapsed?: () => boolean;
  readonly onContextCollapsedChange?: (collapsed: boolean) => void;
}

const VEHICLES: readonly [VehicleType, string][] = [
  ["ligeiro_passageiros_sem", "Ligeiro passageiros — sem reboque"],
  ["ligeiro_passageiros_com", "Ligeiro passageiros — com reboque"],
  ["ligeiro_mercadorias_sem", "Ligeiro mercadorias — sem reboque"],
  ["ligeiro_mercadorias_com", "Ligeiro mercadorias — com reboque"],
  ["motociclo_mais50_sem", "Motociclo >50 cm³ — sem carro lateral/reboque"],
  ["motociclo_mais50_com", "Motociclo >50 cm³ — com carro lateral/reboque"],
  ["motociclo_ate50", "Motociclo ≤50 cm³"],
  ["triciclo", "Motociclo — triciclo"],
  ["ciclomotor", "Ciclomotor / quadriciclo"],
  ["pesado_passageiros_sem", "Pesado passageiros — sem reboque"],
  ["pesado_passageiros_com", "Pesado passageiros — com reboque"],
  ["pesado_mercadorias_sem", "Pesado mercadorias — sem reboque"],
  ["pesado_mercadorias_com", "Pesado mercadorias — com reboque"],
  ["trator", "Trator agrícola/florestal"],
  ["maquina_agricola", "Máquina agrícola"],
  ["maquina_industrial", "Máquina industrial"]
];

const REGIMES: readonly [SpeedRegime, string][] = [
  ["coexistencia", "Zona de coexistência"],
  ["local_geral", "Dentro da localidade — limite geral"],
  ["restante", "Restantes vias públicas — limite geral"],
  ["reservada", "Via reservada — limite geral"],
  ["autoestrada", "Autoestrada — limite geral"],
  ["local_placas", "Localidade — limite sinalizado"],
  ["fora_placas", "Fora da localidade — limite sinalizado"],
  ["auto_placas", "Autoestrada — limite sinalizado (100 km/h)"],
  ["especial", "Limite especial"],
  ["personalizado", "Velocidade personalizada"]
];

const TYPES: readonly [CinemometerType, string][] = [
  ["radar_fixo", "Radar fixo"],
  ["radar_movimento", "Radar em movimento"],
  ["sensor_estatico", "Sensores estáticos"],
  ["lidar_fixo", "Lidar fixo"],
  ["lidar_movimento", "Lidar em movimento"],
  ["perseguicao", "Cinemómetro de perseguição"],
  ["aeronave", "Cinemómetro em aeronave"],
  ["video_secao", "Vídeo por secção / velocidade média"],
  ["tratamento_imagem", "Tratamento de imagem"]
];

const MODES: readonly [CinemometerMode, string][] = [
  ["fixo", "Fixo / estático"],
  ["movimento", "Em movimento"],
  ["perseguicao", "Perseguição"],
  ["media", "Velocidade média"]
];

export class CinemometerModule {
  private root: HTMLElement | null = null;
  private readonly contextPanel: CinemometerContextPanel | null;

  constructor(private readonly options: CinemometerModuleOptions) {
    this.contextPanel = options.profiles
      ? new CinemometerContextPanel({
          profiles: options.profiles,
          telemetry: options.telemetry
        })
      : null;
  }

  mount(root: HTMLElement): void {
    this.root = root;
    this.render();
  }

  private render(): void {
    if (!this.root) return;

    const section = document.createElement("section");
    section.className = "cin-module";
    section.setAttribute("aria-label", "Cinemómetro");

    const head = document.createElement("div");
    head.className = "cin-module-head";

    const kicker = document.createElement("span");
    kicker.className = "verix-overline";
    kicker.textContent = "FISCALIZAÇÃO / CÁLCULO";

    const title = document.createElement("h2");
    title.textContent = "Cinemómetro";

    const note = document.createElement("p");
    note.textContent =
      "O EMA é determinado pelo tipo de cinemómetro e pela verificação metrológica. Até 100 km/h aplica-se o valor absoluto; acima de 100 km/h aplica-se a percentagem regulamentar.";

    head.append(kicker, title, note);

    let contextRoot: HTMLDivElement | null = null;
    if (this.contextPanel) {
      const collapsed = this.options.contextCollapsed?.() ?? false;
      const contextToggle = document.createElement("button");
      contextToggle.type = "button";
      contextToggle.className = "cin-context-toggle";
      contextToggle.textContent = collapsed ? "MOSTRAR FICHA OPERACIONAL" : "RECOLHER FICHA OPERACIONAL";
      contextToggle.setAttribute("aria-controls", "cin-context-panel");
      contextToggle.setAttribute("aria-expanded", String(!collapsed));

      contextRoot = document.createElement("div");
      contextRoot.id = "cin-context-panel";
      contextRoot.className = "cin-context-host";
      contextRoot.hidden = collapsed;
      this.contextPanel.mount(contextRoot);

      contextToggle.addEventListener("click", () => {
        if (!contextRoot) return;
        const nextCollapsed = !contextRoot.hidden;
        contextRoot.hidden = nextCollapsed;
        contextToggle.setAttribute("aria-expanded", String(!nextCollapsed));
        contextToggle.textContent = nextCollapsed
          ? "MOSTRAR FICHA OPERACIONAL"
          : "RECOLHER FICHA OPERACIONAL";
        this.options.onContextCollapsedChange?.(nextCollapsed);
      });

      head.append(contextToggle);
    }

    const form = document.createElement("form");
    form.className = "cin-form";

    const type = this.selectField("TIPO DE CINEMÓMETRO", TYPES, "radar_fixo");
    const operator = this.options.profiles?.operatorSession();
    const verificationDefault =
      this.options.profiles?.list()[0]?.verificacao ?? "primeira";
    const verification = this.selectField(
      "VERIFICAÇÃO",
      [
        ["primeira", "Primeira verificação"],
        ["periodica", "Verificação periódica / extraordinária"]
      ] as const,
      verificationDefault
    );
    const operatorMode =
      operator?.modo && MODES.some(([value]) => value === operator.modo)
        ? operator.modo
        : "fixo";
    const mode = this.selectField("MODO OPERACIONAL", MODES, operatorMode);
    const vehicle = this.selectField(
      "VEÍCULO",
      VEHICLES,
      "ligeiro_passageiros_sem"
    );
    const operatorRegime =
      operator?.regime && REGIMES.some(([value]) => value === operator.regime)
        ? operator.regime as SpeedRegime
        : "autoestrada";
    const regime = this.selectField(
      "ENQUADRAMENTO",
      REGIMES,
      operatorRegime
    );

    const limit = document.createElement("label");
    limit.className = "cin-field";
    const limitText = document.createElement("span");
    limitText.textContent = "LIMITE DE VELOCIDADE";
    const limitInput = document.createElement("input");
    limitInput.type = "number";
    limitInput.min = "1";
    limitInput.max = "300";
    limitInput.inputMode = "numeric";
    limitInput.placeholder = "Automático";
    limit.append(limitText, limitInput);

    const recorded = document.createElement("label");
    recorded.className = "cin-field";
    const recordedText = document.createElement("span");
    recordedText.textContent = "VELOCIDADE REGISTADA";
    const recordedInput = document.createElement("input");
    recordedInput.type = "number";
    recordedInput.min = "1";
    recordedInput.max = "400";
    recordedInput.inputMode = "numeric";
    recordedInput.required = true;
    recordedInput.placeholder = "km/h";
    recorded.append(recordedText, recordedInput);

    const actions = document.createElement("div");
    actions.className = "cin-actions";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "cin-submit";
    submit.textContent = "CALCULAR";
    const reset = document.createElement("button");
    reset.type = "reset";
    reset.className = "cin-reset";
    reset.textContent = "LIMPAR";
    actions.append(submit, reset);

    const result = document.createElement("div");
    result.className = "cin-result-v2";
    result.setAttribute("aria-live", "polite");

    const refreshLimit = (): void => {
      const v = vehicle.input.value as VehicleType;
      const r = regime.input.value as SpeedRegime;
      const auto = defaultSpeedLimit(v, r);
      limitInput.value = auto === null ? "" : String(auto);
      limitInput.placeholder = auto === null ? "Introduza o limite" : "Automático";
    };

    vehicle.input.addEventListener("change", refreshLimit);
    regime.input.addEventListener("change", refreshLimit);
    refreshLimit();

    form.addEventListener("reset", () => {
      result.replaceChildren();
      window.setTimeout(refreshLimit, 0);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const typeValue = type.input.value as CinemometerType;
      const verificationValue = verification.input.value as VerificationType;
      const modeValue = mode.input.value as CinemometerMode;
      const vehicleValue = vehicle.input.value as VehicleType;
      const regimeValue = regime.input.value as SpeedRegime;
      const recordedSpeed = Number(recordedInput.value);
      const configuredLimit = Number(limitInput.value);
      const automaticLimit = defaultSpeedLimit(vehicleValue, regimeValue);
      const speedLimit =
        Number.isFinite(configuredLimit) && configuredLimit > 0
          ? configuredLimit
          : automaticLimit;

      if (!speedLimit || !Number.isFinite(speedLimit)) {
        result.replaceChildren(this.errorCard("Introduza um limite de velocidade válido."));
        return;
      }

      const deduced = calculateDeducedSpeedForCinemometer(
        recordedSpeed,
        typeValue,
        verificationValue
      );

      if (deduced === null) {
        result.replaceChildren(this.errorCard("Introduza uma velocidade registada válida."));
        return;
      }

      const excess = Math.max(0, deduced - speedLimit);
      const classification = classifyExcess(excess, vehicleValue, regimeValue);
      const code = operationalCodeForVehicle(
        classification,
        vehicleValue,
        regimeValue
      );
      const [absolute, percent] = emaForCinemometer(
        typeValue,
        verificationValue
      );

      if (this.options.profiles) {
        const currentOperator =
          this.options.profiles.operatorSession() ?? {
            posto: "",
            numero: "",
            nome: "",
            modo: "fixo" as const,
            veiculo: "",
            regime: "",
            limite: ""
          };
        this.options.profiles.saveOperator({
          ...currentOperator,
          modo: modeValue,
          veiculo: vehicleValue,
          regime: regimeValue,
          limite: String(speedLimit)
        });
      }

      const context = this.contextPanel?.snapshot();
      const operationalText = buildCinemometerOperationalText({
        recordedSpeed,
        deducedSpeed: deduced,
        speedLimit,
        mode: modeValue,
        marca: context?.profile?.marca,
        modelo: context?.profile?.modelo,
        serie: context?.profile?.serie,
        ansr: context?.profile?.ansr,
        ipq: context?.profile?.ipq,
        dataipq: context?.profile?.dataipq,
        certtipo: context?.profile?.certtipo,
        cert: context?.profile?.cert,
        operadorNumero: context?.operator?.numero,
        operadorNome: context?.operator?.nome,
        operadorPosto: context?.operator?.posto
      });

      this.options.telemetry.track("cinemometer_operation_start", "cinemometro");
      this.options.telemetry.track("cinemometer_calculation", "cinemometro", {
        modo: modeValue,
        veiculo: vehicleValue,
        enquadramento: regimeValue,
        verificacao: verificationValue,
        tipo_cinemometro: typeValue,
        velocidade_registada: recordedSpeed,
        velocidade_deduzida: deduced,
        limite: speedLimit,
        excesso: excess,
        gravidade: classification.gravidade,
        coima: classification.coima,
        pontos: classification.pontos,
        inibicao: classification.inibicao,
        codigo: code,
        aparelho_marca: context?.profile?.marca ?? null,
        aparelho_modelo: context?.profile?.modelo ?? null,
        aparelho_serie: context?.profile?.serie ?? null,
        aparelho_configurado: Boolean(context?.profile),
        operador_nome: context?.operator?.nome ?? null,
        operador_numero: context?.operator?.numero ?? null,
        operador_posto: context?.operator?.posto ?? null,
        operador_identificado: Boolean(
          context?.operator?.nome ||
          context?.operator?.numero ||
          context?.operator?.posto
        )
      });

      result.replaceChildren(
        this.resultCard(
          recordedSpeed,
          deduced,
          speedLimit,
          excess,
          classification.gravidade,
          classification.coima,
          classification.pontos,
          classification.inibicao,
          code,
          absolute,
          percent,
          operationalText
        )
      );
    });

    form.append(
      type.wrapper,
      verification.wrapper,
      mode.wrapper,
      vehicle.wrapper,
      regime.wrapper,
      limit,
      recorded,
      actions
    );

    section.append(head);
    if (contextRoot) section.append(contextRoot);
    section.append(form, result);
    this.root.replaceChildren(section);
  }

  private resultCard(
    recorded: number,
    deduced: number,
    limit: number,
    excess: number,
    gravity: string,
    fine: string,
    points: string,
    ban: string,
    code: string,
    absolute: number,
    percent: number,
    operationalText: string
  ): HTMLElement {
    const card = document.createElement("article");
    card.className = `cin-result-card-v2 cin-result-${gravity.toLowerCase().replaceAll(" ", "-")}`;

    const title = document.createElement("strong");
    title.textContent = excess > 0 ? gravity.toUpperCase() : "SEM INFRAÇÃO";

    const grid = document.createElement("div");
    grid.className = "cin-result-grid-v2";

    this.resultValue(grid, "REGISTADA", `${recorded} km/h`);
    this.resultValue(grid, "DEDUZIDA", `${deduced} km/h`);
    this.resultValue(grid, "LIMITE", `${limit} km/h`);
    this.resultValue(grid, "EXCESSO", `${excess} km/h`);
    this.resultValue(grid, "COIMA", fine);
    this.resultValue(grid, "PONTOS", points);
    this.resultValue(grid, "INIBIÇÃO", ban);
    this.resultValue(grid, "CÓDIGO", code);

    const ema = document.createElement("small");
    ema.className = "cin-ema-note";
    ema.textContent = `EMA: ${absolute} km/h até 100 km/h · ${percent}% acima de 100 km/h`;

    const copyRow = document.createElement("div");
    copyRow.className = "cin-copy-row";

    const copyCode = document.createElement("button");
    copyCode.type = "button";
    copyCode.className = "cin-copy-button";
    copyCode.textContent = "COPIAR CÓDIGO";
    copyCode.disabled = excess <= 0 || code === "—";
    copyCode.addEventListener("click", () => {
      void this.copyValue(code, "cinemometer_copy_code", copyCode);
    });

    const copyText = document.createElement("button");
    copyText.type = "button";
    copyText.className = "cin-copy-button";
    copyText.textContent = "COPIAR TEXTO";
    copyText.disabled = !operationalText;
    copyText.addEventListener("click", () => {
      void this.copyValue(operationalText, "cinemometer_copy_text", copyText);
    });

    copyRow.append(copyCode, copyText);

    const textArea = document.createElement("textarea");
    textArea.className = "cin-operational-text";
    textArea.readOnly = true;
    textArea.value = operationalText;
    textArea.setAttribute("aria-label", "Texto operacional");

    card.append(title, grid, ema, copyRow, textArea);
    return card;
  }

  private async copyValue(
    value: string,
    event: "cinemometer_copy_code" | "cinemometer_copy_text",
    button: HTMLButtonElement
  ): Promise<void> {
    if (!value || value === "—") return;

    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      copied = false;
    }

    if (copied) {
      const original = button.textContent;
      button.textContent = "✓ COPIADO";
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = original;
      }, 1400);
    }

    this.options.telemetry.track(event, "cinemometro", { copied });
  }

  private resultValue(parent: HTMLElement, label: string, value: string): void {
    const row = document.createElement("div");
    row.className = "cin-result-value-v2";
    const key = document.createElement("span");
    key.textContent = label;
    const val = document.createElement("strong");
    val.textContent = value;
    row.append(key, val);
    parent.append(row);
  }

  private selectField<T extends string>(
    label: string,
    values: readonly (readonly [T, string])[],
    selected: T
  ): { wrapper: HTMLLabelElement; input: HTMLSelectElement } {
    const wrapper = document.createElement("label");
    wrapper.className = "cin-field";
    const text = document.createElement("span");
    text.textContent = label;
    const input = document.createElement("select");

    for (const [value, description] of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = description;
      option.selected = value === selected;
      input.append(option);
    }

    wrapper.append(text, input);
    return { wrapper, input };
  }

  private errorCard(message: string): HTMLElement {
    const card = document.createElement("div");
    card.className = "cin-result-card-v2 cin-result-error";
    card.textContent = message;
    return card;
  }
}
