# VÉRIX — Decomposição do legado

## Evidência do estado atual

Auditoria AST/estrutural do `verix-app.html` no HEAD de produção em 2026-10-08:

- 1.247.497 bytes no ficheiro.
- 19.314 linhas.
- 41 blocos `<script>`.
- aproximadamente 584 KB de JavaScript inline.
- 46 blocos `<style>`.
- aproximadamente 628 KB de CSS inline.
- o maior script começa na linha 317, tem ~416 KB e ~2.231 linhas.
- o bloco de telemetria V2 começa na linha 17.048, tem ~23,6 KB e ~703 linhas.
- o bloco de dados/álcool começa na linha 9.568 e tem ~48,4 KB.
- existem várias camadas de correções posteriores que reatribuem funções globais.

## Reatribuições globais relevantes

Foram encontradas reatribuições múltiplas destas funções:

- `abrirModulo`
- `filtrarLegislacao`
- `cinMontarTexto`
- `cinLimitePadrao`
- `cinAtualizarLimite`
- `cinAlternarListaCinemometros`
- `cinClassificarExcesso`
- `cinCodigoOperacional`
- `setProfile`
- `refreshDiagnostic`
- `reset`
- `onclick`
- `onerror`

Estas reatribuições são fortes indicadores de evolução incremental do sistema. Não são motivo suficiente para apagar funções: a V2 precisa primeiro descobrir quem depende do comportamento final destas cadeias.

## Blocos com responsabilidade aparente

### Segurança / entrada
- linhas 11–101: proteção de host, frame/context menu/teclas.
- linhas 102–227: identidade, gate e token.

### Núcleo operacional
- linhas 317–2547: consulta de veículo, IMT, histórico, navegação, ASF, utilidades e parte do cinemómetro.

### Correções e extensões
- 2.837–3.321: correções pontuais.
- 6.287–6.307: relógio/data.
- 7.419–7.570: melhorias de legislação.
- 7.661–7.844: regras operacionais do cinemómetro.
- 7.953–8.105: matriz real/ajuda do cinemómetro.
- 8.430–8.537: modal/scroll do cinemómetro.
- 9.045–9.120: cópia de legislação.
- 9.290–9.425: definições/settings.
- 9.568–9.687: dados Excel/álcool.
- 11.712–12.443: camadas adicionais de cinemómetro.
- 12.401–12.548: navegação/menu/history.
- 13.715–13.762: fresh-load/factory reset.
- 14.420–14.449: proteção de inputs de matrícula.
- 15.107–15.119: efeito visual.
- 15.614–15.637: boot visual.
- 16.162–16.183: grelha de legislação.
- 16.549–16.691: settings.
- 17.048–17.751: telemetria V2.
- 19.204–19.313: controlador de startup.

## Telemetria V2

O bloco atual já implementa:

- identidade persistente de instalação;
- identidade de sessão/tab;
- fila local;
- limite de 300 eventos;
- batches de 25;
- flush;
- retry com backoff;
- `sendBeacon`;
- fetch;
- XHR;
- ActiveX legado;
- wrappers de funções existentes;
- eventos de ciclo de vida;
- heartbeat de 45 s.

Na V2 moderna, fetch + keepalive + sendBeacon são os candidatos principais. XHR e ActiveX ficam no legado até a matriz de compatibilidade estar encerrada.

## Regra de migração

Não cortar uma camada apenas porque existe código posterior.

Para cada domínio:
1. identificar implementação base;
2. identificar todas as extensões posteriores;
3. descobrir o comportamento final;
4. criar testes de caracterização;
5. criar adapter;
6. migrar;
7. comparar;
8. só depois remover overrides antigos.

## Domínios prioritários

1. Telemetria/presença — infraestrutura relativamente isolada.
2. ASF — contrato crítico e testável.
3. IMT/consulta — orquestração de rede.
4. Histórico — estado local.
5. Cinemómetro — domínio funcional grande, deve ser dividido em cálculo/configuração/renderização.
6. Legislação — dados/UI/eventos.
7. Álcool — dados/render.
8. Settings/startup — infraestrutura de UI.
9. Administração — aplicação separada, migrar depois dos contratos backend.

## Conclusão

O legado deve ser desmontado por responsabilidade e por dependência, não por posição física no HTML.

O número de blocos de script/style é evidência de acumulação histórica. A V2 deve substituir esta acumulação por módulos explícitos sem alterar o resultado operacional final.


## Mapa de referências confirmado

No blob de produção analisado, foram contadas as seguintes ocorrências e definições/reatribuições:

| Função | Ocorrências | Definições/reatribuições |
|---|---:|---:|
| `abrirModulo` | 33 | 8 |
| `filtrarLegislacao` | 12 | 4 |
| `cinAtualizarLimite` | 13 | 4 |
| `cinMontarTexto` | 17 | 6 |
| `cinClassificarExcesso` | 9 | 4 |
| `cinCodigoOperacional` | 9 | 4 |
| `cinLimitePadrao` | 4 | 3 |
| `cinAlternarListaCinemometros` | 10 | 3 |
| `cinRecalcular` | 17 | 2 |

Isto não significa que todas as implementações sejam necessárias. Significa que a V2 deve localizar a última cadeia efetiva e as extensões que dependem dela antes de apagar qualquer camada.

### Função mais sensível: cinemómetro

`cinRecalcular` é referenciado por múltiplos handlers/fluxos e existe uma substituição posterior via `window.cinRecalcular = function...`.

A estratégia V2 será separar:
- modelo de configuração;
- cálculo puro;
- classificação do excesso;
- código/enquadramento;
- renderização;
- persistência dos perfis;
- telemetria.

O cálculo puro deverá ser testado antes de integrar DOM.

### Navegação

`abrirModulo` é usado diretamente em HTML via `onclick` e é posteriormente envolvido por extensões. Portanto, uma pesquisa apenas por imports não é suficiente para detetar dependências.

A V2 terá um dispatcher tipado que substituirá progressivamente a dependência de globais, mas os handlers legacy continuarão até à regressão estar comprovadamente coberta.


## Cinemómetro V61 — cadeia efetiva

A análise do blob de produção identificou que as primeiras regras V42/V47 são posteriormente substituídas por um bloco V61. Para equivalência, a V2 adota apenas a cadeia V61 final:

- IDs finais de motociclos: `motociclo_mais50_sem`, `motociclo_mais50_com`, `motociclo_ate50`.
- Máquina industrial final: `maquina_industrial`.
- EMA final:
  - fixo/media: 3% primeira, 5% periódica;
  - movimento/perseguição: 5% primeira, 7% periódica.
- Até 100 km/h: dedução fixa baseada na percentagem EMA.
- Acima de 100 km/h: dedução percentual.
- `auto_placas`: limite operacional 100 km/h.
- `local_placas` e `fora_placas`: limite introduzido manualmente.
- As famílias de código são diferentes para ligeiros/outros e para local/fora/entre placas.
- Enquadramentos especial/personalizado não recebem código automaticamente.

As versões anteriores não são consideradas equivalentes ao comportamento final. O domínio V2 foi corrigido para esta cadeia V61 e está coberto por testes.
