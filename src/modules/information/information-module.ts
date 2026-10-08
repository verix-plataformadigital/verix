import type { TelemetryService } from '../../services/telemetry/telemetry-service';
import { runtimeConfig } from '../../config/runtime-config';

export interface InformationModuleOptions {
  readonly telemetry?: Pick<TelemetryService, 'track'>;
}

const OFFICIAL_SOURCE = 'https://diariodarepublica.pt/';

export class InformationModule {
  private root: HTMLElement | null = null;

  constructor(private readonly options: InformationModuleOptions = {}) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.options.telemetry?.track('module_open', 'informacoes');
    this.render();
  }

  private render(): void {
    if (!this.root) return;

    const section = document.createElement('section');
    section.className = 'information-module';
    section.setAttribute('aria-label', 'Informações e aviso legal');

    const kicker = document.createElement('span');
    kicker.className = 'verix-overline';
    kicker.textContent = 'VÉRIX / INFORMAÇÃO';

    const title = document.createElement('h2');
    title.textContent = 'Informações';

    const intro = document.createElement('p');
    intro.textContent =
      'Sistema de apoio e consulta. Os dados apresentados não substituem a consulta das fontes oficiais aplicáveis.';

    const grid = document.createElement('div');
    grid.className = 'information-grid';

    grid.append(
      this.card('IMT / RNSI', 'Canal operacional para inspeção e livrete. O acesso depende da rede interna do posto.'),
      this.card('ASF', 'Consulta automática do estado do seguro através do relay VÉRIX, sem expor credenciais ASF ao cliente.'),
      this.card('SEGURANÇA', 'A aplicação restringe os destinos externos conhecidos e mantém o código sensível fora do cliente.' )
    );

    const legal = document.createElement('section');
    legal.className = 'information-legal';

    const legalTitle = document.createElement('h3');
    legalTitle.textContent = 'AVISO LEGAL';

    const paragraphs = [
      'Esta aplicação não está afiliada a entidades governamentais ou outras entidades oficiais.',
      'A utilização desta aplicação não dispensa a consulta dos documentos originais no Diário da República.',
      'A aplicação é fornecida como está, sem garantias de exatidão, atualidade ou completude. Pode conter erros ou estar desatualizada.',
      'A aplicação destina-se apenas a apoio e consulta informativa. A utilização da informação fornecida é da responsabilidade do utilizador.'
    ];
    for (const value of paragraphs) {
      const p = document.createElement('p');
      p.textContent = value;
      legal.append(p);
    }

    const source = document.createElement('button');
    source.type = 'button';
    source.className = 'information-source';
    source.textContent = 'ABRIR DIÁRIO DA REPÚBLICA';
    source.addEventListener('click', () => {
      const opened = window.open(OFFICIAL_SOURCE, '_blank', 'noopener,noreferrer');
      this.options.telemetry?.track('external_tool_open', 'informacoes', {
        source: 'diariodarepublica',
        opened: Boolean(opened)
      });
    });

    const version = document.createElement('div');
    version.className = 'information-version';
    version.textContent = 'Versão ' + runtimeConfig.appVersion;

    legal.append(source, version);
    section.append(kicker, title, intro, grid, legal);
    this.root.replaceChildren(section);
  }

  private card(title: string, description: string): HTMLElement {
    const card = document.createElement('article');
    card.className = 'information-card';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const p = document.createElement('p');
    p.textContent = description;
    card.append(heading, p);
    return card;
  }
}