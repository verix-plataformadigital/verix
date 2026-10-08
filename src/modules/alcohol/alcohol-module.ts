import {
  ALCOHOL_EMA_TABLE,
  ALCOHOL_GENERAL_THRESHOLD_TAS,
  ALCOHOL_SPECIAL_THRESHOLD_TAS,
  ALCOHOL_TAE_TO_TAS_FACTOR,
  type AlcoholEmaRow
} from './alcohol-data';
import {
  alcoholRegime,
  lookupAlcoholTas,
  penaltyBands,
  tasFromTae
} from './alcohol-domain';
import type { TelemetryService } from '../../services/telemetry/telemetry-service';

export interface AlcoholModuleOptions {
  readonly telemetry?: Pick<TelemetryService, 'track'>;
}

export class AlcoholModule {
  private root: HTMLElement | null = null;
  private query = '';
  private lastTrackedQuery = '';

  constructor(private readonly options: AlcoholModuleOptions = {}) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.options.telemetry?.track('module_open', 'alcool');
    this.render();
  }

  private render(): void {
    if (!this.root) return;
    const section = document.createElement('section');
    section.className = 'alcohol-module';
    section.setAttribute('aria-label', 'Álcool e deduções');

    const kicker = document.createElement('span');
    kicker.className = 'verix-overline';
    kicker.textContent = 'TAE / TAS / EMA';
    const title = document.createElement('h2');
    title.textContent = 'Álcool';
    const description = document.createElement('p');
    description.textContent = 'Consulta rápida da tabela EMA e do enquadramento da taxa de álcool no sangue.';

    const searchRow = document.createElement('div');
    searchRow.className = 'alcohol-search-row';
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'alcohol-search';
    input.placeholder = 'TAS: 0,50 · 0.50 · 50';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = this.query;
    input.setAttribute('aria-label', 'Consultar TAS');
    input.addEventListener('input', () => {
      this.query = input.value;
      this.render();
      const next = this.root?.querySelector<HTMLInputElement>('.alcohol-search');
      next?.focus();
      next?.setSelectionRange(this.query.length, this.query.length);
    });

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'alcohol-clear';
    clear.textContent = 'LIMPAR';
    clear.disabled = !this.query;
    clear.addEventListener('click', () => {
      this.query = '';
      this.render();
      this.root?.querySelector<HTMLInputElement>('.alcohol-search')?.focus();
    });
    searchRow.append(input, clear);

    const info = document.createElement('div');
    info.className = 'alcohol-info';
    info.textContent = `${ALCOHOL_EMA_TABLE.length} valores EMA · 1 mg/L TAE = ${ALCOHOL_TAE_TO_TAS_FACTOR.toLocaleString('pt-PT')} g/L TAS`;

    section.append(kicker, title, description, searchRow, info, this.renderLookup(), this.renderRegimes());

    if (this.query.trim() && this.query.trim() !== this.lastTrackedQuery) {
      this.lastTrackedQuery = this.query.trim();
      this.options.telemetry?.track('alcohol_lookup', 'alcool', {
        results: lookupAlcoholTas(this.query).length
      });
    }

    this.root.replaceChildren(section);
  }

  private renderLookup(): HTMLElement {
    const wrap = document.createElement('section');
    wrap.className = 'alcohol-lookup';
    const head = document.createElement('div');
    head.className = 'alcohol-lookup-head';
    const strong = document.createElement('strong');
    strong.textContent = 'TABELA EMA';
    const results = lookupAlcoholTas(this.query);
    const meta = document.createElement('span');
    meta.textContent = this.query.trim()
      ? `${results.length} correspondência${results.length === 1 ? '' : 's'}`
      : ALCOHOL_EMA_TABLE.length + ' valores';
    head.append(strong, meta);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'alcohol-table-wrap';
    const table = document.createElement('table');
    table.className = 'alcohol-table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    for (const label of ['TAE (mg/L)', 'TAS (g/L)', '1.ª verificação', 'Periódica']) {
      const th = document.createElement('th');
      th.textContent = label;
      trh.append(th);
    }
    thead.append(trh);

    const tbody = document.createElement('tbody');
    const rows = this.query.trim() ? results : ALCOHOL_EMA_TABLE;
    for (const row of rows) tbody.append(this.renderRow(row));
    if (!rows.length) {
      const empty = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'alcohol-empty';
      cell.textContent = 'Não foi encontrado um valor correspondente.';
      empty.append(cell);
      tbody.append(empty);
    }
    table.append(thead, tbody);
    tableWrap.append(table);
    wrap.append(head, tableWrap);

    if (results[0]) {
      const current = document.createElement('div');
      current.className = 'alcohol-current-regime';
      const regime = alcoholRegime(results[0].tas);
      current.textContent = `${regimeLabel(regime)} · TAS ${results[0].tas.toFixed(2).replace('.', ',')} g/L`;
      wrap.append(current);
    }
    return wrap;
  }

  private renderRow(row: AlcoholEmaRow): HTMLElement {
    const tr = document.createElement('tr');
    const values = [row.tae.toFixed(6), row.tas.toFixed(2), row.primeira?.toFixed(3) ?? '—', row.periodica?.toFixed(3) ?? '—'];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    return tr;
  }

  private renderRegimes(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'alcohol-regimes';
    wrap.append(
      this.regimeCard(
        'REGIME ESPECIAL',
        ALCOHOL_SPECIAL_THRESHOLD_TAS,
        penaltyBands(true),
        'Regime probatório, socorro/serviço urgente, transporte coletivo de crianças e jovens até aos 16 anos, táxi/TVDE, pesados e mercadorias perigosas.'
      ),
      this.regimeCard(
        'REGIME GERAL',
        ALCOHOL_GENERAL_THRESHOLD_TAS,
        penaltyBands(false),
        'Condutores não abrangidos pelo regime especial.'
      )
    );
    const box = document.createElement('div');
    box.className = 'alcohol-conversion';
    const label = document.createElement('strong');
    label.textContent = 'CONVERSÃO TAE → TAS';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.001';
    input.min = '0';
    input.placeholder = 'TAE mg/L';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'CONVERTER';
    const result = document.createElement('span');
    result.textContent = '—';
    button.addEventListener('click', () => {
      const tas = tasFromTae(Number(input.value));
      result.textContent = tas === null ? 'Valor inválido' : `${tas.toFixed(3)} g/L TAS`;
      this.options.telemetry?.track('alcohol_lookup', 'alcool', { mode: 'tae_to_tas', valid: tas !== null });
    });
    box.append(label, input, button, result);
    wrap.append(box);
    return wrap;
  }

  private regimeCard(
    title: string,
    threshold: number,
    bands: ReturnType<typeof penaltyBands>,
    description: string
  ): HTMLElement {
    const card = document.createElement('section');
    card.className = 'alcohol-regime-card';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const thresholdEl = document.createElement('span');
    thresholdEl.textContent = `≥ ${threshold.toFixed(2).replace('.', ',')} g/L`;
    const copy = document.createElement('p');
    copy.textContent = description;
    const bands = document.createElement('div');
    bands.className = 'alcohol-bands';
    for (const bandData of bands) {
      const band = document.createElement('div');
      band.className = 'alcohol-band';
      const p = document.createElement('b');
      p.textContent =
        bandData.severity.toUpperCase() +
        ' · ' +
        bandData.points +
        ' PONTOS';
      const f = document.createElement('span');
      f.textContent =
        bandData.minTas.toFixed(2).replace('.', ',') +
        ' a < ' +
        bandData.maxTasExclusive.toFixed(2).replace('.', ',') +
        ' g/L · ' +
        bandData.fine;
      band.append(p, f);
      bands.append(band);
    }
    card.append(strong, thresholdEl, copy, bands);
    return card;
  }
}

function regimeLabel(regime: ReturnType<typeof alcoholRegime>): string {
  if (regime === 'especial') return 'REGIME ESPECIAL';
  if (regime === 'geral') return 'REGIME GERAL';
  return 'ABAIXO DO LIMIAR';
}