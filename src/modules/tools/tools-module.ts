import { openExternalWindow } from "../../shared/browser/open-external-window";
import {
  DISTRICT_REFERENCES,
  ROAD_ZONE_REFERENCES,
  TACHOGRAPH_REFERENCES
} from './tools-data';
import type { TelemetryService } from '../../services/telemetry/telemetry-service';

export interface ToolsModuleOptions {
  readonly telemetry?: Pick<TelemetryService, 'track'>;
}

const EXTERNAL_TOOLS = [
  ['IMT-ERRU', 'https://erru.imt-ip.pt/ERRU/'],
  ['INEM', 'https://alvaras.inem.pt/DMZ/ConsultaCertificado.aspx'],
  ['Waze', 'https://location.wazept.com/#/']
] as const;

export class ToolsModule {
  private root: HTMLElement | null = null;
  private search = '';

  constructor(private readonly options: ToolsModuleOptions = {}) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.options.telemetry?.track('module_open', 'ferramentas');
    this.render();
  }

  private render(): void {
    if (!this.root) return;
    const section = document.createElement('section');
    section.className = 'tools-module';
    section.setAttribute('aria-label', 'Ferramentas e referências');
    const kicker = document.createElement('span');
    kicker.className = 'verix-overline';
    kicker.textContent = 'ACESSOS E REFERÊNCIAS';
    const title = document.createElement('h2');
    title.textContent = 'Ferramentas';
    const description = document.createElement('p');
    description.textContent = 'Acessos externos autorizados e referências operacionais mantidas localmente.';
    section.append(kicker, title, description, this.externalTools(), this.districts(), this.roadZones(), this.tachograph());
    this.root.replaceChildren(section);
  }

  private externalTools(): HTMLElement {
    const box = document.createElement('section');
    box.className = 'tools-section';
    const heading = document.createElement('h3');
    heading.textContent = 'SERVIÇOS EXTERNOS';
    const grid = document.createElement('div');
    grid.className = 'tools-external-grid';
    for (const [label, url] of EXTERNAL_TOOLS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tools-external-button';
      button.textContent = label;
      button.addEventListener('click', () => {
        const opened = openExternalWindow(url);
        this.options.telemetry?.track('external_tool_open', 'ferramentas', { source: label, opened });
      });
      grid.append(button);
    }
    box.append(heading, grid);
    return box;
  }

  private districts(): HTMLElement {
    const box = document.createElement('section');
    box.className = 'tools-section';
    const heading = document.createElement('h3');
    heading.textContent = 'CÓDIGOS DE DISTRITO';
    const grid = document.createElement('div');
    grid.className = 'tools-district-grid';
    for (const district of DISTRICT_REFERENCES) {
      const item = document.createElement('div');
      item.className = 'tools-district';
      const code = document.createElement('strong');
      code.textContent = district.code;
      const name = document.createElement('span');
      name.textContent = district.name;
      item.append(code, name);
      grid.append(item);
    }
    box.append(heading, grid);
    return box;
  }

  private roadZones(): HTMLElement {
    const box = document.createElement('section');
    box.className = 'tools-section';
    const head = document.createElement('div');
    head.className = 'tools-section-head';
    const heading = document.createElement('h3');
    heading.textContent = 'ZONAS / VIAS';
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'A1, A28, EN13, concessionária…';
    input.value = this.search;
    input.className = 'tools-search';
    input.autocomplete = 'off';
    input.addEventListener('input', () => {
      this.search = input.value;
      this.render();
      const next = this.root?.querySelector<HTMLInputElement>('.tools-search');
      next?.focus();
      next?.setSelectionRange(this.search.length, this.search.length);
    });
    head.append(heading, input);
    const q = this.search.trim().toLocaleLowerCase('pt-PT');
    const rows = ROAD_ZONE_REFERENCES.filter(row => !q || (row.via + ' ' + row.km + ' ' + row.concessionaria + ' ' + row.unidade).toLocaleLowerCase('pt-PT').includes(q));
    const table = document.createElement('table');
    table.className = 'tools-table';
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    for (const label of ['Via', 'Km', 'Concessionária', 'Unidade']) {
      const th = document.createElement('th');
      th.textContent = label;
      header.append(th);
    }
    thead.append(header);
    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const value of [row.via, row.km, row.concessionaria, row.unidade]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    box.append(head, table);
    return box;
  }

  private tachograph(): HTMLElement {
    const box = document.createElement('section');
    box.className = 'tools-section';
    const heading = document.createElement('h3');
    heading.textContent = 'TACÓGRAFO / MANIPULAÇÃO';
    const grid = document.createElement('div');
    grid.className = 'tools-tacho-grid';
    for (const reference of TACHOGRAPH_REFERENCES) {
      const card = document.createElement('article');
      card.className = 'tools-tacho-card';
      const title = document.createElement('strong');
      title.textContent = reference.title;
      const values = document.createElement('p');
      values.textContent = 'Ativação: ' + reference.activation + ' · Constatado: ' + reference.observed + ' · Resultado: ' + reference.result;
      const threshold = document.createElement('span');
      threshold.textContent = reference.threshold;
      card.append(title, values, threshold);
      grid.append(card);
    }
    box.append(heading, grid);
    return box;
  }
}