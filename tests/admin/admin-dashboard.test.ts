import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(process.cwd(), 'admin_v2.html'), 'utf8');
const openDoms: JSDOM[] = [];

function dashboard(): JSDOM {
  const dom = new JSDOM(html, {
    url: 'https://verix.test/admin',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  dom.window.scrollTo = () => undefined;
  openDoms.push(dom);
  return dom;
}

afterEach(() => {
  for (const dom of openDoms.splice(0)) dom.window.close();
});

describe('Admin VÉRIX — melhorias da dashboard', () => {
  it('mostra skeletons no primeiro carregamento e um estado claro quando falha', () => {
    const dom = dashboard();
    const win = dom.window as unknown as Window & Record<string, any>;

    win.renderLoadingState();
    expect(dom.window.document.querySelectorAll('#dashCards .skeleton-card')).toHaveLength(7);
    expect(dom.window.document.querySelector('#errorTypes .skeleton-panel')).not.toBeNull();

    win.renderLoadFailure();
    expect(dom.window.document.querySelector('#dashCards .skeleton-card')).toBeNull();
    expect(dom.window.document.querySelector('#dashCards .empty')?.textContent).toContain('dados ainda não estão disponíveis');
  });

  it('ordena tabelas por valores numéricos e atualiza o estado acessível', () => {
    const dom = dashboard();
    const win = dom.window as unknown as Window & Record<string, any>;
    const host = dom.window.document.getElementById('errorTypes')!;
    host.innerHTML = win.table(['Tipo', 'Quantidade'], [
      '<tr><td>network</td><td>10</td></tr>',
      '<tr><td>http_null</td><td>2</td></tr>',
    ]);

    const quantityHeader = host.querySelectorAll('th')[1] as HTMLElement;
    quantityHeader.click();

    const quantities = Array.from(host.querySelectorAll('tbody tr')).map((row) => row.cells[1].textContent);
    expect(quantities).toEqual(['2', '10']);
    expect(quantityHeader.getAttribute('aria-sort')).toBe('ascending');
  });

  it('filtra as tabelas de erros sem alterar os dados de origem', () => {
    const dom = dashboard();
    const win = dom.window as unknown as Window & Record<string, any>;
    dom.window.document.getElementById('errorTypes')!.innerHTML = win.table(['Tipo', 'Quantidade'], [
      '<tr><td>http_null</td><td>3</td></tr>',
      '<tr><td>network</td><td>2</td></tr>',
    ]);
    const search = dom.window.document.getElementById('errorSearch') as HTMLInputElement;
    search.value = 'HTTP_NULL';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    const rows = Array.from(dom.window.document.querySelectorAll('#errorTypes tbody tr')) as HTMLTableRowElement[];
    expect(rows.map((row) => row.hidden)).toEqual([false, true]);
    expect(dom.window.document.getElementById('errorSearchCount')?.textContent).toContain('1 de 2');
  });

  it('permite abrir o módulo correspondente a partir dos KPI principais', () => {
    const dom = dashboard();
    const win = dom.window as unknown as Window & Record<string, any>;
    const payload = {
      generatedAt: '2026-10-09T02:00:00Z',
      analytics: {
        insurance: {
          '24h': { started: 3, finals: 3, insured: 2, uninsured: 1, errors: 0 },
          '7d': {},
          '30d': {},
        },
        overview: {},
        usage: {},
      },
      lifetime: {},
      investigation: {},
      diagnostics: {},
      errors: {},
    };
    win.renderAll(payload);

    const uninsured = Array.from(dom.window.document.querySelectorAll('#dashCards .card'))
      .find((card) => card.querySelector('.label')?.textContent?.trim() === 'SEM REGISTO') as HTMLElement;
    expect(uninsured.dataset.drillPage).toBe('insurance');
    uninsured.click();
    expect(dom.window.document.querySelector('[data-page="insurance"]')?.classList.contains('active')).toBe(true);
  });

  it('inclui navegação inferior para ecrãs pequenos e controlo de repetição', () => {
    expect(html).toContain('.nav{flex-direction:row;gap:4px;margin:0;overflow-x:auto;scrollbar-width:thin}');
    expect(html).toContain('id="retryLoadBtn"');
    expect(html).toContain('id="loadNotice"');
  });
});
