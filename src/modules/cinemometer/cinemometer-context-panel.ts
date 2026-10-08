import type { TelemetryService } from '../../services/telemetry/telemetry-service';
import {
  type CinemometerOperatorSession,
  type CinemometerProfile,
  CinemometerProfileService
} from './cinemometer-profile-service';

export interface CinemometerContext {
  readonly profile: CinemometerProfile | null;
  readonly operator: CinemometerOperatorSession | null;
}

export interface CinemometerContextPanelOptions {
  readonly profiles: CinemometerProfileService;
  readonly telemetry: Pick<TelemetryService, 'track'>;
  readonly onChanged?: () => void;
}

export class CinemometerContextPanel {
  private root: HTMLElement | null = null;
  private activeProfileId: string | null = null;
  private profileDraft: CinemometerProfile | null = null;

  constructor(private readonly options: CinemometerContextPanelOptions) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.activeProfileId = this.options.profiles.list()[0]?.id ?? null;
    this.render();
  }

  snapshot(): CinemometerContext {
    const profile = this.activeProfileId
      ? this.options.profiles.list().find((item) => item.id === this.activeProfileId) ?? null
      : null;
    return {
      profile,
      operator: this.options.profiles.operatorSession()
    };
  }

  private render(): void {
    if (!this.root) return;

    const section = document.createElement('section');
    section.className = 'cin-context';
    section.setAttribute('aria-label', 'Ficha do cinemómetro e operador');

    const head = document.createElement('div');
    head.className = 'cin-context-head';
    const title = document.createElement('strong');
    title.textContent = 'FICHA OPERACIONAL';
    const count = document.createElement('span');
    count.textContent = this.options.profiles.list().length + ' cinemómetro(s) guardado(s)';
    head.append(title, count);

    const profileControls = document.createElement('div');
    profileControls.className = 'cin-context-profile-controls';
    const select = document.createElement('select');
    select.className = 'cin-context-profile-select';
    select.setAttribute('aria-label', 'Cinemómetro guardado');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = this.options.profiles.list().length ? 'Selecionar cinemómetro…' : 'Nenhum cinemómetro guardado';
    select.append(empty);
    for (const profile of this.options.profiles.list()) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = this.options.profiles.profileLabel(profile);
      option.selected = profile.id === this.activeProfileId;
      select.append(option);
    }
    select.addEventListener('change', () => {
      this.activeProfileId = select.value || null;
      this.profileDraft = null;
      this.options.telemetry.track('cinemometer_profile_select', 'cinemometro', { profileId: this.activeProfileId });
      this.render();
      this.options.onChanged?.();
    });

    const newButton = this.button('NOVO', () => {
      const profile = this.options.profiles.create();
      this.activeProfileId = profile.id;
      this.profileDraft = profile;
      this.options.telemetry.track('cinemometer_profile_new', 'cinemometro');
      this.render();
    });
    const duplicateButton = this.button('DUPLICAR', () => {
      const current = this.currentProfile();
      if (!current) return;
      const duplicate = this.options.profiles.duplicate(current);
      this.activeProfileId = duplicate.id;
      this.options.telemetry.track('cinemometer_profile_duplicate', 'cinemometro');
      this.render();
    });
    const deleteButton = this.button('APAGAR', () => {
      if (!this.activeProfileId) return;
      const removed = this.options.profiles.remove(this.activeProfileId);
      if (!removed) return;
      this.options.telemetry.track('cinemometer_profile_delete', 'cinemometro');
      this.activeProfileId = this.options.profiles.list()[0]?.id ?? null;
      this.render();
    });
    profileControls.append(select, newButton, duplicateButton, deleteButton);

    const profile = this.currentProfile();
    const profileFields = this.fieldGrid();
    const fields: Array<[keyof CinemometerProfile, string, string]> = [
      ['marca', 'Marca', 'Marca do aparelho'],
      ['modelo', 'Modelo', 'Modelo'],
      ['serie', 'N.º série', 'Número de série'],
      ['ansr', 'ANSR', 'Referência ANSR'],
      ['ipq', 'IPQ', 'Referência IPQ'],
      ['dataipq', 'Data IPQ', 'DD/MM/AAAA'],
      ['certtipo', 'Tipo certificado', 'Certificado / declaração'],
      ['cert', 'N.º certificado', 'Número']
    ];
    for (const [key, label, placeholder] of fields) {
      profileFields.append(this.textField(label, placeholder, String(profile?.[key] ?? ''), (value) => this.updateProfileDraft(key, value)));
    }

    const verification = this.selectField('Verificação', [
      ['primeira', 'Primeira verificação'],
      ['periodica', 'Periódica / extraordinária']
    ] as const, profile?.verificacao ?? 'primeira', (value) => this.updateProfileDraft('verificacao', value));
    profileFields.append(verification);

    const note = this.textField('Nota interna', 'Local / identificação interna', String(profile?.nota ?? ''), (value) => this.updateProfileDraft('nota', value));
    note.classList.add('cin-context-note');
    profileFields.append(note);

    const saveProfile = this.button('GUARDAR FICHA', () => {
      const current = this.currentProfile();
      if (!current) return;
      const draft = this.profileDraft ? { ...current, ...this.profileDraft, id: current.id } : current;
      this.options.profiles.save(draft);
      this.profileDraft = null;
      this.options.telemetry.track('cinemometer_profile_save', 'cinemometro', { profileId: draft.id });
      this.render();
      this.options.onChanged?.();
    });

    const operator = this.options.profiles.operatorSession();
    const operatorGrid = this.fieldGrid();
    operatorGrid.append(
      this.textField('Posto', 'Unidade / posto', operator?.posto ?? '', (value) => this.updateOperator({ posto: value })),
      this.textField('N.º operador', 'Número', operator?.numero ?? '', (value) => this.updateOperator({ numero: value })),
      this.textField('Nome', 'Nome operacional', operator?.nome ?? '', (value) => this.updateOperator({ nome: value }))
    );
    const saveOperator = this.button('GUARDAR SESSÃO', () => {
      const current = this.options.profiles.operatorSession() ?? { posto: '', numero: '', nome: '', modo: 'fixo' as const, veiculo: '', regime: '', limite: '' };
      this.options.profiles.saveOperator(current);
      this.options.onChanged?.();
    });

    section.append(head, profileControls, profileFields, saveProfile);
    const operatorTitle = document.createElement('h4');
    operatorTitle.textContent = 'OPERADOR';
    section.append(operatorTitle, operatorGrid, saveOperator);
    this.root.replaceChildren(section);
  }

  private currentProfile(): CinemometerProfile | null {
    if (this.profileDraft) return this.profileDraft;
    return this.activeProfileId
      ? this.options.profiles.list().find((item) => item.id === this.activeProfileId) ?? null
      : null;
  }

  private updateProfileDraft<K extends keyof CinemometerProfile>(key: K, value: CinemometerProfile[K]): void {
    const current = this.currentProfile();
    if (!current) return;
    this.profileDraft = { ...current, [key]: value };
  }

  private updateOperator(patch: Partial<CinemometerOperatorSession>): void {
    const current = this.options.profiles.operatorSession() ?? { posto: '', numero: '', nome: '', modo: 'fixo' as const, veiculo: '', regime: '', limite: '' };
    this.options.profiles.saveOperator({ ...current, ...patch });
  }

  private fieldGrid(): HTMLDivElement {
    const grid = document.createElement('div');
    grid.className = 'cin-context-grid';
    return grid;
  }

  private textField(label: string, placeholder: string, value: string, onChange: (value: string) => void): HTMLLabelElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'cin-context-field';
    const text = document.createElement('span');
    text.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = value;
    input.autocomplete = 'off';
    input.addEventListener('input', () => onChange(input.value));
    wrapper.append(text, input);
    return wrapper;
  }

  private selectField<T extends string>(label: string, options: readonly (readonly [T, string])[], value: T, onChange: (value: T) => void): HTMLLabelElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'cin-context-field';
    const text = document.createElement('span');
    text.textContent = label;
    const select = document.createElement('select');
    for (const [optionValue, description] of options) {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = description;
      option.selected = optionValue === value;
      select.append(option);
    }
    select.addEventListener('change', () => onChange(select.value as T));
    wrapper.append(text, select);
    return wrapper;
  }

  private button(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cin-context-button';
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }
}