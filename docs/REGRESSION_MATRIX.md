# VÉRIX 2 — Matriz de regressão

Esta matriz define o que tem de ser comprovado antes do cutover. Compilar não conta como validação funcional.

| Área | Caso crítico | Evidência atual | Bloqueia cutover |
|---|---|---|---|
| ASF | HTTP 200 + nó license presente → seguro | Classifier + testes | Não |
| ASF | HTTP 200 sem nó license → sem registo | Classifier + testes | Não |
| ASF | 503 / timeout / network preservam tipo real | Controller + diagnóstico legado | Não |
| ASF | Secure build preserva símbolos críticos | Secure build verifier | Não |
| IMT | inspeção usa matricula do veículo; fallback para reboque | ImtService + testes | Sim |
| IMT | livrete usa reboque; fallback para veículo | ImtService + testes | Sim |
| IMT | RNSI HTTP não é libertado para navegação arbitrária | WebView2 allowlist | Sim |
| Histórico | consulta nova cria registo com queryId | VehicleModule + HistoryService | Não |
| Histórico | resposta antiga não atualiza consulta nova | VehicleQueryController sequencing | Sim |
| Histórico | preferência desligada não escreve histórico | Teste de integração | Não |
| Cinemómetro | defaults e EMA V61 | Domain tests | Sim |
| Cinemómetro | 16 tipos de veículo e enquadramentos | Domain + module | Sim |
| Cinemómetro | perfil/aparelho/operador persistem | ProfileService + tests | Não |
| Cinemómetro | texto operacional e cópia | Text builder + tests | Sim |
| Legislação | 19 categorias / 279 registos | Data integrity test | Sim |
| Legislação | favoritos preservam chave legada | Favorites tests | Não |
| Álcool | 441 valores EMA preservados | Data integrity test | Sim |
| Álcool | TAS/TAE e escalões legais | Domain tests + fonte oficial | Sim |
| Definições | preferências sobrevivem a reload | SettingsService tests | Não |
| Ferramentas | destinos externos limitados ao allowlist | Windows host + module | Sim |
| Informações | aviso legal e fonte oficial | UI test + host allowlist | Não |
| Telemetria | eventos críticos chegam sem esperar batch | TelemetryService tests | Sim |
| Telemetria | flush concorrente é single-flight | TelemetryService tests | Sim |
| Presença | evento persistido antes de last_seen | Edge function v34 | Sim |
| Admin | erros 1.5 separados de legado | stats-v2 + admin | Sim |
| Admin | indisponibilidade do rate-limit não vira 429 falso | admin-auth-v2 | Não |
| Build | sem source maps e com CSP/security markers | CI | Sim |
| Windows | build + publish win-x64 | CI Windows | Sim |
| Windows/RNSI | janela interna funciona na rede RNSI real | Ainda não validado em posto | Sim |
| Mobile/tablet | 320/360/390 px; retrato/paisagem; 768/1024 px; navegação touch, formulários e scroll local das tabelas | Contratos CSS/DOM adicionados; browsers/dispositivos reais ainda pendentes | Sim |
| Responsive/browser | Chromium + WebKit sobre build V2; viewports de 320/360/390/768/844/1024/1280 px; abrir todos os módulos sem overflow global | Teste Playwright na CI; dispositivo Android/iOS físico ainda pendente | Sim |
| Responsive/acessibilidade | Alvos touch ≥48 px, foco visível, zoom do browser e redução de movimento | Regras CSS + testes de contrato; inspeção visual manual pendente | Sim |

## Regra de aceitação

Qualquer linha marcada como bloqueadora sem evidência de execução em ambiente adequado impede o cutover.

Os testes automatizados provam contratos de software; não substituem a validação física do RNSI numa máquina ligada à rede operacional.