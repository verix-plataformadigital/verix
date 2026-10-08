# VÉRIX — Estado da Reengenharia

## Estado atual

Branch de trabalho: `reengineering-v2`

Pull Request de trabalho: #33 (draft)

A produção atual permanece intocada. Esta branch é a área de engenharia da VÉRIX 2.

## Head atual

Head atual: consultar diretamente a branch `reengineering-v2` no GitHub antes de novas alterações; este documento evita fixar um SHA que fica obsoleto após cada checkpoint.

## Decisões técnicas atuais

- Não fazer uma conversão mecânica de HTML para TypeScript.
- Direção tecnológica: TypeScript + Vite + DOM nativo, sem framework de UI por defeito.
- TypeScript 7.0.2.
- Vite 8.3.3.
- Vitest 5.0.3.
- Node 22 continua a ser o runtime de build.
- TypeScript usa modo estrito e verificações adicionais contra código não utilizado e acessos potencialmente indefinidos.
- O contrato operacional ASF deve ser preservado antes de qualquer otimização.
- Telemetria e presença são áreas críticas.
- A aplicação final deve continuar distribuível sem Node/Python/Docker no cliente.
- O resultado deve continuar a ser uma única aplicação responsiva, não uma aplicação mobile separada.
- Vite V2 é paralelo nesta fase; o build de produção legado continua em `build:legacy` e `build`.

## Pesquisa técnica realizada

- Vite 8 é a geração atual relevante e usa Rolldown como bundler unificado; Vite 8.1 acrescenta melhorias de build/dev para aplicações grandes.
- TypeScript 7.0.2 é atualmente a versão estável publicada; o projeto adotará a linha 7.x.
- TypeScript recomenda `strict: true`; a V2 adiciona verificações complementares apropriadas ao objetivo de manutenção.
- Supabase distingue chaves publishable/anon de chaves secret/service-role; segredos permanecem exclusivamente nas Edge Functions.
- `navigator.onLine` é tratado como sinal auxiliar, não como prova de que o backend está acessível.
- OWASP recomenda tratar dados do cliente, respostas de API e storage do browser como não confiáveis e ter cuidado especial com sinks como `innerHTML`.

## Trabalho executado

1. Criada branch isolada `reengineering-v2`.
2. Criada PR draft #33 contra `main`.
3. Criada fundação TypeScript estrita.
4. Adicionado Vite como build paralelo de V2.
5. Adicionado Vitest para testes de caracterização.
6. Criado primeiro conjunto de tipos e serviços independentes:
   - Result
   - Connectivity
   - HTTP client
   - validação de entradas ASF
   - contrato ASF
7. Mantido o build legado como `build:legacy` e preservado o `build` atual.
8. Criada ferramenta `tools/audit-repository.mjs` para inventário estático do repositório inteiro no runner do GitHub.
9. Criada pipeline `.github/workflows/reengineering-v2.yml` para:
   - instalar dependências
   - typecheck
   - testes
   - auditoria estática da árvore
   - build V2
   - rejeitar source maps
   - publicar o relatório de auditoria como artifact.
10. Criado este checkpoint para continuidade entre sessões.

## Observações críticas já verificadas

- O runtime ASF atual está atrás de `asf-proxy-v1`, com validação de BUILD_ID, token de cliente, installationId, matrícula/data e timeout de 15 s.
- O sistema de presença corrente usa `last_seen`; existem índices específicos em `verix2_installations` e `verix2_sessions`.
- `verix-mobile.html` atua atualmente como entrada de compatibilidade e redireciona para `verix-app.html`; a direção V2 continua a ser uma única aplicação responsiva.
- O build seguro atual usa perfil conservador para partes críticas do runtime legado.
- O repositório contém mecanismos de segurança e CI que devem ser preservados e melhorados, não substituídos cegamente.

## Descobertas estruturais desta sessão

- A auditoria AST real identificou 41 blocos de script e 46 blocos de estilo no `verix-app.html`.
- O maior script inline tem cerca de 416 KB e agrega consulta/IMT/ASF/histórico/cinemómetro; a migração será feita por domínio, não por corte físico.
- Foram documentadas múltiplas reatribuições globais de funções de navegação, legislação, settings e cinemómetro em `docs/LEGACY_DECOMPOSITION.md`.
- A telemetria V2 legada está relativamente isolada e tornou-se o primeiro candidato a migração funcional para TypeScript.
- A CI chegou a typecheck verde e 19/19 testes verdes antes de falhar no auditor AST; o auditor foi então corrigido para usar namespace import do TypeScript.

## Descobertas adicionais

- O primeiro domínio do cinemómetro V2 foi inicialmente extraído de uma camada V42/V47 mais antiga. A comparação direta com o fim efetivo do `verix-app.html` revelou uma camada V61 posterior; a implementação V2 foi corrigida para essa cadeia final.
- A UI V47/V61 também substitui os identificadores de motociclos e máquina industrial. O domínio V2 usa agora os identificadores efetivos: `motociclo_mais50_sem`, `motociclo_mais50_com`, `motociclo_ate50` e `maquina_industrial`.
- O teste de código operacional passou a exigir explicitamente o veículo, evitando uma assinatura impossível que tentava inferir o grupo apenas da classificação.

## Próxima sequência obrigatória

1. Confirmar CI verde da fundação e obter o relatório integral da auditoria do runner.
2. Fechar o inventário de funções, listeners, globals, HTML sinks, endpoints, RPCs e duplicações.
3. Mapear o grafo de dependências do runtime operacional.
4. Extrair contratos puros e adapters sem alterar comportamento.
5. Criar testes de caracterização específicos para ASF/IMT/telemetria/online/admin.
6. Migrar progressivamente os módulos para `src/`.
7. Só depois integrar a nova UI V2 com a aparência atual.
8. Reconstruir mobile a partir do layout responsivo em vez de patches genéricos.
9. Separar definitivamente código de domínio, infraestrutura, UI e observabilidade.
10. Migrar o admin quando a análise demonstrar benefício real.
11. Comparar builds e fluxos antigo/novo.
12. Só depois planear o corte de produção e remoção do legado.

## Regra de segurança

Nada nesta branch deve ser considerado produção até passar testes de regressão e comparação com o comportamento atual.

## Regra contra falsa conclusão

“Compilou” não significa “funciona”.
“Não encontrei referência” não significa “é código morto”.
“Está mais moderno” não significa “está melhor”.

## Nota para continuação

Ao abrir uma nova sessão, ler primeiro:
- `docs/REENGINEERING_STATE.md`
- `ARCHITECTURE.md`
- `SECURITY.md`
- `package.json`
- `verix-app.html`

Depois continuar na branch `reengineering-v2` / PR #33.


## Validação externa adicional — 2026-10-08

### Cinemómetro V61
A implementação V2 foi comparada com a versão consolidada do Código da Estrada disponível no Diário da República:
- Art. 27.º — limites gerais de velocidade e escalões de coima.
- Art. 28.º — limites especiais/sinalizados.
- Art. 145.º — classificação de excesso de velocidade como grave.
- Art. 146.º — classificação das situações muito graves.
- Art. 147.º — inibição de conduzir.
- Art. 148.º — subtração de pontos.

Resultado: os thresholds já caracterizados no domínio V61 (incluindo a distinção entre ligeiros/motociclos e outros veículos e a zona de coexistência) não devem ser alterados sem nova evidência legal. A versão consolidada consultada indica como última alteração 2025-03-12. A implementação continua a usar o V61 observado no runtime legado como referência operacional e a legislação como validação externa.

Fonte externa: Diário da República, Código da Estrada consolidado.


## Continuação — 2026-10-08 19:xx

### Telemetria / presença
- `TelemetryService.track()` passou a iniciar flush imediato para `app_open`, `heartbeat` e `vehicle_lookup`. A fila continua a ser o fallback de fiabilidade.
- `DefaultConnectivityService` passou a aceitar `probeMethod`; o bootstrap V2 usa `OPTIONS` ao `verix-gate-v1` para testar reachability do backend sem fabricar um evento de telemetria.
- A Edge Function `telemetry-v2` foi atualizada para persistir `verix2_events` antes de avançar `verix2_installations` e `verix2_sessions`. Isto reduz o risco de `last_seen` avançar sem o evento correspondente.
- A versão 34 de `telemetry-v2` foi publicada no projeto Supabase de produção; o runtime ASF não foi alterado.
- Verificação direta do banco após a alteração: os heartbeats estão a chegar de forma regular e `online_now` do RPC administrativo está a devolver `1` no momento da consulta.
- Foi observado anteriormente um estado incoerente em que `last_seen` estava recente mas não havia eventos correspondentes; a causa provável era a ordem das escritas na Edge Function.

### V2 / versão de produto
- `runtimeConfig.appVersion` e a identificação visual da shell/admin estão alinhados para `1.5`, que corresponde ao runtime legado atualmente observado; `BUILD_ID` continua a ser identidade técnica interna.

### CI
- O `VÉRIX Security Audit` ficou verde num dos commits intermédios.
- A qualidade V2 falhou num fixture por `exactOptionalPropertyTypes`; o fixture foi corrigido sem relaxar o `tsconfig`.
- Há execuções subsequentes da CI em curso para os commits mais recentes. O próximo estado útil é o resultado do typecheck/build dessa revisão.

### Regra acrescentada
- Erros de presença devem ser resolvidos na ingestão/fonte de verdade; não mascarar o problema apenas no contador do Admin.

### Estado funcional — tranche seguinte — 2026-10-08

#### Módulos V2 já reais
- Consulta/ASF: VehicleModule + VehicleQueryController + AsfService + AsfClassifier.
- Histórico: persistência local compatível com VÉRIX_CONSULTAS_HISTORICO_V1; respeito pela preferência history.
- Cinemómetro: domínio V61 caracterizado + perfis VÉRIX_CINEMOMETROS_V2 + sessão VÉRIX_CINEMOMETRO_OPERADOR_V2 + texto operacional + cópia + metadata de aparelho/operador.
- Legislação: 19 categorias / 279 itens extraídos programaticamente do legado; pesquisa, favoritos persistentes VÉRIX_LEGISLACAO_FAVORITOS_V1, cópia de código/descrição/tudo.
- Álcool: 441 valores EMA extraídos; TAE/TAS, limiares gerais/especiais e conversão 2,3.
- Definições: preferências locais, perfis visuais, escala automática, persistência.
- Ferramentas: IMT-ERRU, INEM, Waze, distritos, zonas/vias e referências de tacógrafo.
- IMT: URL builder + sequence + adapter externo; a abertura de RNSI é deliberadamente externa no browser/WebView2 por causa do canal HTTP interno.

#### Decisões de segurança
- Não transportar RNSI HTTP para um iframe HTTPS através de desativação de segurança do Chromium.
- WebView2 restringe NavigationStarting, FrameNavigationStarting e NewWindowRequested.
- asf-proxy-v1 permanece inalterado.
- telemetry-v2 produção continua na versão 34.

#### Incidente observado no legado
- Dados de produção mostram 19 erros ASF nas últimas 24 h em 1.5; 10 são unknown com mensagem criarDiagASF is not defined.
- Isto é tratado como falha do caminho de diagnóstico legado até prova em contrário; não deve ser usado para concluir que o motor ASF falhou.
- Não corrigir esse incidente modificando asf-proxy-v1 nesta fase.

#### CI
- Foram adicionados concurrency aos workflows V2 e Security Audit para cancelar execuções obsoletas.
- Houve um ciclo completo verde antes das alterações finais desta tranche: typecheck, testes, auditoria estática, build V2 e política de segurança.
- Cada commit posterior gera nova validação; a cabeça atual só deve ser considerada concluída após o respetivo runner terminar verde.

### Continuação — 2026-10-08 — cobertura operacional

- Adicionados os módulos V2 `Álcool`, `Definições`, `Ferramentas` e `Informações`, mantendo dados locais e DOM nativo.
- `Legislação` passou a preservar pesquisa, favoritos e cópia com dados extraídos diretamente do legado.
- `Cinemómetro` passou a preservar perfis de aparelho, sessão do operador e texto operacional.
- RNSI passou de URL conhecida no módulo para `ImtService`; o host Windows abre agora o RNSI numa janela WebView2 interna e restrita ao host/caminho autorizado.
- O `stats-v2` passou a separar a versão 1.5 atual e a classificar `legacy_diagnostic` separadamente de falhas de transporte.
- Foi adicionada validação TypeScript específica para Edge Functions locais, excluindo apenas a dependência remota Deno do cliente de telemetria.
- O secure build agora falha se símbolos ASF críticos desaparecerem no artefacto final.

### Estado de produção observado
- Nas últimas 24 horas da última consulta à base havia 888 eventos V2 em 1.5 e 19 `vehicle_insurance_error` em 1.5.
- `asf-proxy-v1` continua sem alterações entre `main` e `reengineering-v2`.
- `telemetry-v2` de produção continua na versão 34.

### Bloqueios antes do cutover
- Validar a nova janela RNSI num PC real ligado à rede interna RNSI.
- Validar o pacote Windows publicado e o comportamento de encerramento/retoma.
- Executar regressão V2 ↔ legado nos fluxos críticos com casos reais/caracterizados.
- Validar o contrato final de `stats-v2` e só então considerar publicação do novo admin.
- Confirmar mobile em navegador e WebView2.


### Continuação da reengenharia — 2026-10-08, fim da sessão

#### Correções verificáveis nesta tranche
- Corrigida a nomenclatura `livretePlate` no coordenador de consultas e removido do teste um `recordLookup` que já não pertence ao contrato.
- O serviço de consulta arranca os dois canais RNSI antes de iniciar a consulta ASF. Isto preserva a oportunidade de abrir janelas durante a ativação do formulário; continua a usar `Promise.allSettled` para isolar falhas entre canais.
- Os testes do adaptador IMT verificam o contrato real: `ImtService.open(source, plate)` compõe e entrega ao adaptador a URL final.
- A caracterização do cinemómetro foi atualizada para os resultados efetivos do domínio V61 (130 registados, 123 deduzidos, 120 de limite, excesso de 3). Não foram alteradas as regras de cálculo para satisfazer um teste desatualizado.
- O typecheck de Edge Functions configura `moduleDetection: "force"`, evitando colisões de identificadores globais entre ficheiros `index.ts` independentes. O código das Edge Functions de produção não foi alterado.
- A página inicial V2 foi extraída para `HomeModule`: atalhos gerados a partir do registo de módulos, CTA de consulta, navegação tipada e layout responsivo. Os textos são inseridos com `textContent`; não se introduz `innerHTML`.
- O tipo de módulo deixou de incluir os IDs antigos `insurance` e `imt`, pois a consulta de veículo é o ponto de entrada integrado.

#### Estado de validação
- A auditoria de segurança correu com sucesso em commits intermédios desta tranche.
- Foi observado typecheck verde após a correção do contrato de matrícula.
- A primeira execução de testes revelou expectativas legadas de ordem das chamadas, contrato do adaptador IMT e resultados V61; essas expectativas foram alinhadas e a coordenação foi ajustada para abrir RNSI primeiro.
- O teste de `HomeModule` está configurado com `// @vitest-environment jsdom` conforme a documentação do Vitest.
- O estado final só deve ser marcado como concluído quando a CI do HEAD final passar: typecheck, typecheck Edge, testes, auditoria estática, build V2, regras de segurança, ausência de source maps e build/publicação do host Windows.

#### Estado de produção e limites
- Produção continua isolada em `main`; não houve alteração a `asf-proxy-v1`, `telemetry-v2` de produção, schema Supabase ou admin de produção.
- A nova página inicial e as alterações de orquestração são apenas parte da branch V2. A janela RNSI e o pacote Windows continuam a precisar de validação em equipamento operacional real.


#### Correção de diagnóstico de pop-ups — validação externa
- A auditoria de `browserImtWindowAdapter` encontrou um falso negativo de abertura: usar `noopener,noreferrer` como feature faz o retorno de `window.open` ser `null` por especificação, não apenas quando um popup é bloqueado.
- O adaptador foi alterado para usar `window.open(url, "_blank")`, anular imediatamente `opened.opener` e devolver `false` apenas se não foi criada uma referência (ou se o isolamento do opener não pôde ser concluído).
- A política `no-referrer` permanece no HTML V2. Foram acrescentados testes DOM para distinguir abertura permitida de pop-up bloqueado.
- A pesquisa também confirmou a restrição de ativação do utilizador por janela; se o segundo canal RNSI for bloqueado, o caminho continua a ser o respetivo botão explícito, em vez de remover proteções do browser.


#### Correção do verificador WebView2
- A pipeline falhava porque `tools/verify-windows-host-security.mjs` exigia a string `X-Content-Type` em `windows/VerixPortable/Program.cs`. O host WinForms carrega o site remoto e não é o servidor que emite os cabeçalhos HTTP; esta verificação não comprovava um controlo implementado.
- Removido esse falso requisito e reforçada a lista de marcadores com as definições reais de desativação do autofill, gravação de palavras-passe, mensagens web e navegação por swipe, além do prefixo de caminho interno RNSI.
- A correção altera o verificador, não reduz o allowlist, não relaxa navegações e não introduz flags inseguras no Chromium.


- Refinamento do verificador: a lista do host RNSI é centralizada numa única constante e usada pelo método de validação. O teste deixou de exigir duas ocorrências literais do hostname (duplicação desnecessária) e verifica agora que a validação consulta efetivamente `InternalHttpAllowedHosts.Contains(uri.Host)`.


#### Navegação de regresso ao início
- Acrescentado o botão de navegação `Início` à barra lateral. A landing page V2 já não depende do arranque inicial para ser alcançada.
- Adicionado teste DOM que navega para `Consulta` e regressa a `main`, verificando conteúdo e estado `aria-current`.


#### Abertura externa consistente
- Extraída `src/shared/browser/open-external-window.ts` para corrigir o mesmo falso diagnóstico de pop-up nos módulos Ferramentas e Informações, não apenas no adaptador IMT.
- As três origens de abertura externa usam agora a mesma política: abertura sincrónica, isolamento de `opener`, resultado booleano consistente e sem alterar o allowlist do host.
- Adicionado teste de integração DOM ao módulo Ferramentas e atualizado o teste do Diário da República para verificar o valor de telemetria real.


#### Portas explícitas no host Windows
- O allowlist de navegação exige HTTPS na porta 443 para ferramentas externas e HTTP na porta 80 para o host RNSI interno, além de validar nome do host e ausência de userinfo.
- Os handlers de navegação externa usam a mesma função `IsAllowedExternalUri`; deixaram de aceitar URLs com portas arbitrárias só porque o nome do host corresponde.
- O verificador estático exige estes controlos. Os endereços fixos do IMT/RNSI e o relay ASF não foram alterados.


#### Data ASF preservada no histórico
- O histórico local passou a guardar opcionalmente `dataConsultaAsf` em formato `YYYY/MM/DD`, para além do timestamp `data` que continua a representar quando a consulta foi registada.
- Reabrir uma consulta usa a data ASF originalmente selecionada; registos antigos sem este campo continuam a usar o fallback histórico, sem quebrar a chave local V1.
- Adicionados testes de persistência após reload e de reabertura com uma data diferente da data de execução.


#### Reabertura sem resultados desfasados
- A reabertura do histórico agora chama `VehicleQueryController.reset()`, que limpa o resultado e invalida respostas de pedidos anteriores ainda em curso.
- O estado busy e o queryId global são limpos; uma resposta tardia não pode voltar a preencher o painel com o resultado de outro veículo.
- Testes cobrem tanto uma consulta pendente que termina após reset como o fluxo histórico que reabre uma matrícula/data sem manter o resultado anterior.


#### Cancelamento do UI após limpar/reabrir
- Acrescentado um contador de geração ao módulo de consulta: qualquer submissão, limpeza ou reabertura invalida a continuação UI de operações anteriores.
- Limpar o formulário faz reset do controlador; uma consulta ASF que termine tarde deixa de conseguir restaurar um resultado antigo no ecrã.
- Teste DOM cobre a sequência iniciar pedido pendente → limpar → resposta antiga chegar, confirmando que o formulário permanece limpo e sem resultado desfasado.


#### Links externos adaptados ao contrato real do WebView2
- Ferramentas e Diário da República passaram de botões que chamavam `window.open()` para âncoras nativas com `target="_blank"` e `rel="noopener noreferrer"`.
- A telemetria agora regista `requested: true`, não inventa um resultado de abertura que o cliente não consegue observar quando o host encaminha a URL para o navegador do sistema.
- O adaptador IMT/RNSI mantém o seu helper separado, pois o percurso WebView2 interno do RNSI tem um contrato diferente.
