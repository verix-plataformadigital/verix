import {
  type SettingsDensity,
  type SettingsProfile,
  type SettingsScale,
  type SettingsTheme,
  SettingsService
} from './settings-service';
import type { TelemetryService } from '../../services/telemetry/telemetry-service';

export interface SettingsModuleOptions {
  readonly settings: SettingsService;
  readonly telemetry?: Pick<TelemetryService, 'track'>;
}

export class SettingsModule {
  private root: HTMLElement | null = null;

  constructor(private readonly options: SettingsModuleOptions) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.options.settings.applyToDocument(document);
    this.options.telemetry?.track('module_open', 'definicoes');
    this.render();
  }

  private render(): void {
    if (!this.root) return;
    const section = document.createElement('section');
    section.className = 'settings-module';
    section.setAttribute('aria-label', 'Definições');

    const kicker = document.createElement('span');
    kicker.className = 'verix-overline';
    kicker.textContent = 'PREFERÊNCIAS LOCAIS';

    const title = document.createElement('h2');
    title.textContent = 'Definições';

    const description = document.createElement('p');
    description.textContent =
      'Preferências guardadas neste equipamento. Nenhuma destas opções é enviada para o backend.';

    const profile = this.fieldset('PERFIL DE UTILIZAÇÃO');
    profile.append(this.select('Perfil', [
      ['escudo', 'Escudo — equilíbrio operacional'],
      ['fiscalizacao', 'Fiscalização — máximo conteúdo'],
      ['leitura', 'Leitura — maior conforto'],
      ['posto', 'Posto — ecrã pequeno']
    ], this.options.settings.snapshot().profile, value => {
      const state = this.options.settings.setProfile(value as SettingsProfile);
      this.options.settings.applyToDocument(document);
      this.options.telemetry?.track('module_open', 'definicoes', { action: 'profile_change', profile: state.profile });
      this.render();
    }));

    const appearance = this.fieldset('APRESENTAÇÃO');
    appearance.append(
      this.select('Tema', [['dark', 'Escuro'], ['light', 'Claro']], this.options.settings.snapshot().theme, value => this.update({ theme: value as SettingsTheme })),
      this.select('Densidade', [
        ['compact', 'Compacta'],
        ['normal', 'Normal'],
        ['comfortable', 'Confortável']
      ], this.options.settings.snapshot().density, value => this.update({ density: value as SettingsDensity })),
      this.select('Escala', [
        ['auto', 'Automática'],
        ['80', '80%'],
        ['90', '90%'],
        ['100', '100%'],
        ['110', '110%'],
        ['120', '120%']
      ], this.options.settings.snapshot().scale, value => this.update({ scale: value as SettingsScale }))
    );

    const behavior = this.fieldset('COMPORTAMENTO');
    behavior.append(
      this.toggle('HUD', this.options.settings.snapshot().hud, value => this.update({ hud: value })),
      this.toggle('Transições', this.options.settings.snapshot().transitions, value => this.update({ transitions: value })),
      this.toggle('Histórico local', this.options.settings.snapshot().history, value => this.update({ history: value })),
      this.toggle('Radar do cinemómetro recolhido', this.options.settings.snapshot().cinRadarCollapsed, value => this.update({ cinRadarCollapsed: value }))
    );

    const diagnosis = this.fieldset('DIAGNÓSTICO LOCAL');
    const summary = document.createElement('div');
    summary.className = 'settings-summary';
    summary.textContent = this.options.settings.localSummary();

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'settings-reset';
    reset.textContent = 'REPOR PREFERÊNCIAS';
    reset.addEventListener('click', () => {
      this.options.settings.reset();
      this.options.settings.applyToDocument(document);
      this.options.telemetry?.track('module_open', 'definicoes', { action: 'reset_preferences' });
      this.render();
    });

    diagnosis.append(summary, reset);
    section.append(kicker, title, description, profile, appearance, behavior, diagnosis);
    this.root.replaceChildren(section);
  }

  private fieldset(title: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'settings-fieldset';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading);
    return section;
  }

  private select(
    label: string,
    options: readonly (readonly [string, string])[],
    value: string,
    change: (value: string) => void
  ): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'settings-control';
    const name = document.createElement('span');
    name.textContent = label;
    const select = document.createElement('select');
    select.value = value;
    for (const [optionValue, text] of options) {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = text;
      select.append(option);
    }
    select.addEventListener('change', () => change(select.value));
    wrapper.append(name, select);
    return wrapper;
  }

  private toggle(label: string, value: boolean, change: (value: boolean) => void): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'settings-toggle';
    const text = document.createElement('span');
    text.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => change(input.checked));
    wrapper.append(text, input);
    return wrapper;
  }

  private update(patch: Parameters<SettingsService['update']>[0]): void {
    this.options.settings.update(patch);
    this.options.settings.applyToDocument(document);
    this.render();
  }
}
