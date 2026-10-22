# VÉRIX — Auditoria técnica Supabase

**Data da inspeção:** 22/10/2026  
**Projeto:** `verix-telemetria` (`onilkakbgpklxvxuxmks`)  
**Modo:** inspeção read-only; este relatório não executa migrações nem altera tabelas, funções ou dados.

## 1. Estado geral

- O Supabase reportou o projeto como `ACTIVE_HEALTHY`, PostgreSQL 17.
- Foram encontradas 8 Edge Functions ativas.
- Os advisors de segurança e desempenho não devolveram avisos na consulta.
- Todas as tabelas públicas listadas tinham RLS ativo.
- Uma leitura de catálogo saudável é um sinal positivo, mas não prova ausência de defeitos nem substitui testes funcionais.

## 2. Edge Functions

| Função | Versão observada | Responsabilidade |
|---|---:|---|
| `telemetry-v2` | 55 | Ingestão e validação da telemetria operacional |
| `stats-v2` | 95 | Métricas e análise histórica do painel |
| `hourly-history-v2` | 10 | Histórico horário |
| `admin-auth-v2` | 17 | Autenticação administrativa |
| `admin-telemetry-v3` | 2 | Presença observada pelo servidor e resumo ao vivo |
| `asf-proxy-v1` | 15 | Relay da consulta ASF |
| `verix-gate-v1` | 5 | Gate/token do cliente operacional |
| `verix-admin-pwa` | 4 | Recursos da PWA administrativa |

Todas aparecem com `verify_jwt=false` no gateway Supabase. Isto não significa automaticamente que estejam desprotegidas: as funções usam validação própria de token onde aplicável. A configuração versionada desta proposta declara as oito funções e a CI exige que o inventário se mantenha alinhado.

## 3. Modelo de dados: legado e versão corrente

A base tem duas gerações de telemetria. Não foi eliminado nada: clientes antigos, histórico ou funções SQL podem depender das tabelas legadas.

| Tabela | Linhas estimadas | Tamanho tabela | Tamanho total |
|---|---:|---:|---:|
| `verix2_events` | 307.383 | 239 MB | 419 MB |
| `events` | 54.984 | 12 MB | 42 MB |
| `verix2_sessions` | 4.010 | 720 KB | 3,0 MB |
| `sessions` | 2.504 | 352 KB | 1,7 MB |
| `verix2_installations` | 1.638 | 216 KB | 640 KB |
| `installations` | 1.472 | 144 KB | 584 KB |
| `verix2_admin_dashboard_cache` | 1 | 392 KB | 560 KB |
| `verix2_admin_v3_cache` | 1 | 8 KB | 168 KB |
| `verix_insurance_no_cases` | 591 | 104 KB | 440 KB |
| `verix2_rate_limits` | 171 | 24 KB | 144 KB |
| `verix2_dashboard_state` | 1 | 8 KB | 24 KB |
| `period_resets` | 1 | 8 KB | 32 KB |
| `verix_metric_resets` | 2 | 8 KB | 32 KB |
| `verix_build_registry` | 1 | 8 KB | 32 KB |

Os tamanhos e contagens são os valores devolvidos pelo catálogo/estatísticas PostgreSQL no momento da consulta. As linhas são estimativas estatísticas, não uma contagem transacional exata.

### Interpretação

- `verix2_events` domina o armazenamento. É plausível para a tabela de eventos, mas requer acompanhamento de crescimento, retenção e custo dos índices.
- O armazenamento legado continua relevante. Não deve ser apagado sem provar que nenhuma instalação antiga ou função consumidora depende dele.
- As caches administrativas têm uma única linha, mas podem conter payloads consideráveis. Medir tamanho serializado, frequência de atualização, concorrência e invalidação antes de as simplificar.
- `verix_insurance_no_cases` conserva registos operacionais “sem registo” por **24 horas**, conforme a migração aplicada em 19/10 e o job `verix_insurance_no_cases_expiry` (a cada 5 minutos). No snapshot de 22/10 havia 597 registos, nenhum expirado por limpar. Isto é distinto da retenção do histórico analítico em `verix2_events`.

## 4. Índices: oportunidades, não instruções para apagar

Índices grandes observados em `verix2_events`:

| Índice | Tamanho aproximado | `idx_scan` observado |
|---|---:|---:|
| `verix2_events_install_time_idx` | 34 MB | 2.160 |
| `verix2_events_presence_server_time_idx` | 31 MB | 3.668 |
| `verix2_events_pkey` | 22 MB | 640.471 |
| `verix2_events_event_time_idx` | 21 MB | 132.328 |
| `verix2_events_query_idx` | 18 MB | 14.363.858 |
| `verix2_events_admin_v3_relevant_idx` | 17 MB | 34.966 |
| `verix2_events_occurred_idx` | 11 MB | 51.414 |
| `verix2_vehicle_lookup_query_uq` | 2,36 MB | 18.320.580 |

`idx_scan` é estatística acumulada desde o último reset de estatísticas, não uma medida de custo por pedido. Poucos scans não provam que um índice seja inútil: pode servir uma operação rara mas crítica, impor unicidade ou ter estatísticas recentes.

Na tabela legada `events` existem índices com prefixos/colunas em comum; alguns merecem revisão, mas não são todos duplicados exatos. Antes de remover índices:
1. Confirmar utilização recente e se houve reset de estatísticas.
2. Observar planos com `EXPLAIN (ANALYZE, BUFFERS)` em cópia/staging.
3. Verificar constraints de unicidade e chaves estrangeiras.
4. Comparar custo de leitura e escrita.
5. Só então propor migração reversível e janela de observação.

## 5. Funções SQL e versões administrativas

Existem várias gerações de funções administrativas, incluindo `verix2_admin_dashboard`, `verix2_admin_dashboard_fast`, `verix2_admin_dashboard_cached`, `verix2_admin_dashboard_v3` e `verix2_admin_dashboard_v3_compute`, além de auxiliares `*_fast`, variantes históricas e funções `_v13`.

Isto aumenta a complexidade, mas não prova redundância. Algumas versões podem servir páginas distintas, caches, históricos ou compatibilidade. A limpeza exige um grafo de chamadas: Edge Function → RPC → funções/tabelas → componente UI, associado a registos de utilização e comparação de resultados.

As funções `SECURITY DEFINER` inspecionadas usam `search_path` explícito. Deve manter-se esse padrão e rever privilégios de cada função privilegiada.

### Privilégios `EXECUTE` observados

Na consulta de funções com execução concedida a `anon` ou `authenticated`, apareceram:
- `verix2_is_portuguese_plate_format(text)`
- `verix2_keep_seen_monotonic()`, uma função trigger.

A primeira parece uma validação simples de formato, mas deve manter-se acessível a clientes só se isso for intencional. A segunda é uma função trigger; o privilégio EXECUTE não prova que seja utilizável como RPC convencional. Rever ACLs e exposição PostgREST antes de revogar permissões.

## 6. Endpoint legado: pedidos OPTIONS 404 e caminho ativo a funcionar

Foi feita uma segunda leitura dos logs no intervalo **22/10/2026, 00:00–12:00 UTC**, mais abrangente do que a amostra inicial de 15 minutos:

| Rota / método | Respostas observadas | Primeira ocorrência | Última ocorrência |
|---|---:|---|---|
| `/functions/v1/telemetry` — `OPTIONS` | 27.909 HTTP 404 | 06:25:38 UTC | 11:29:04 UTC* |
| `/functions/v1/telemetry-v2` — `POST` | 11.054 HTTP 200 | 00:00:04 UTC | 11:24:41 UTC* |
| `/functions/v1/telemetry-v2` — `OPTIONS` | 1 HTTP 204 no conjunto consultado | 08:59:56 UTC | 08:59:56 UTC |

\* Os totais e os limites temporais nesta tabela vêm da consulta agregada inicial. **Reverificação posterior dos logs:** numa consulta de amostra separada à janela **11:30–11:50 UTC**, ainda se observaram pedidos `OPTIONS | 404` para `/functions/v1/telemetry` até às **11:44:11.144 UTC**. No mesmo intervalo, os últimos exemplos recolhidos de `POST | 200` para `/functions/v1/telemetry-v2` chegaram às **11:45:09.536 UTC**. Estes horários vêm de amostras de registos e não constituem uma nova contagem agregada.

**Interpretação:** a rota sem versão está a receber preflight `OPTIONS`, não se observou `POST` enviado para esse caminho na consulta exata; os envios efetivos observados estão a entrar em `telemetry-v2` com HTTP 200. Os pedidos antigos não devem ser tratados como 27.909 erros de gravação nem como 27.909 utilizadores: são pedidos HTTP, em grande maioria preflight, e não consultas operacionais confirmadas. A permanência das chamadas antigas após a correção de fonte no ramo confirma que a alteração do ramo, por si só, ainda não corrigiu todos os clientes que estão a gerar o tráfego.

Os registos apresentam agentes de utilizador de Chrome/Edge no Windows, sem cabeçalho `Origin`, e associam o tráfego a uma rede de saída da Secretaria-Geral do MAI. Isto é **compatível com HTML local (`file://`) ou outra origem opaca**, mas não prova qual o ficheiro/build que o emite. A fonte operacional montada nesta proposta aponta para `telemetry-v2`; a validação da fonte reconstruída rejeita referências exatas à rota antiga.

**Decisão de segurança:** não foi criado um alias para `/telemetry`. Sem o contrato e o emissor antigo confirmados, um alias poderia ressuscitar um segundo emissor, causar duplicados ou introduzir eventos no modelo errado. Para o link oficial, a correção é publicar o build gerado a partir da fonte modular validada; cópias HTML guardadas localmente precisam de ser substituídas manualmente. Depois de publicar, voltar a medir a taxa de `OPTIONS 404` e confirmar que os pedidos ao endpoint versionado continuam a ter respostas 2xx.

**Requisito de origem para aceitação ASF:** o `verix-gate-v1` atualmente só aceita origens web autorizadas (`https://verix-plataformadigital.github.io` e `https://verix.vxops.workers.dev`) ou alguns clientes antigos sem cabeçalho `Origin`. Não se deve abrir o HTML compilado diretamente como `file://` e interpretar uma rejeição do gate como falha da ASF. O teste deve ocorrer pelo URL HTTPS aprovado ou pelo host WebView2 real que navega para o URL oficial. Se for necessário suportar uma origem local opaca, isso deve ser uma decisão de segurança separada: alargar a allowlist a `Origin: null` pode permitir pedidos de qualquer contexto opaco e não foi feito.

**Snapshot mais recente (22/10/2026, janela móvel de 60 minutos, cerca das 12:20 UTC):** 3.269 `OPTIONS | 404` para `/functions/v1/telemetry`, último evento às 12:20:53 UTC; 410 `POST | 200` para `/functions/v1/telemetry-v2`, último às 12:20:21 UTC; 62 `POST | 200` para o relay ASF `asf-proxy-v1`, último às 12:15:26 UTC; 6 `POST | 400` para `asf-proxy-v1`, entre 11:38:26 e 11:59:04 UTC; 5 pedidos `POST | 200` ao `verix-gate-v1`. **Diagnóstico dos 400:** cinco eventos de erro guardam resposta de 36 bytes, tipo `application/json; charset=utf-8`, com hash FNV-1a `03899b1c`; este hash coincide com o JSON `{"ok":false,"error":"invalid_plate"}`. Portanto, os cinco 400 são rejeições de formato pelo próprio relay, não falhas upstream da ASF. O sexto (11:59:04 UTC) não conservou hash/content-type nesta versão de transporte e permanece não classificado. A `asf-proxy-v1` valida matrículas normalizadas com 6–8 caracteres alfanuméricos; nenhum valor de matrícula foi consultado ou incluído neste relatório. **Diagnóstico do gate:** nas últimas 24 horas houve 367 preflights `OPTIONS 204`, 368 `POST 200` e 6 `POST 403` em `verix-gate-v1`. Existem igualmente seis eventos de telemetria `security_auth` de clientes Chrome/Edge no Windows, builds anteriores. O código implantado do gate rejeita com `403 origin_not_allowed` origens fora da lista; aceita o hostname GitHub Pages oficial e o Workers oficial e não aceita explicitamente `Origin: null` para navegadores modernos. A associação entre os seis `403` e os eventos de autenticação, bem como a hipótese de origens locais/opacas, é forte mas inferida: os logs não guardam o cabeçalho `Origin` de cada pedido. Isto pode explicar algumas falhas em cópias locais/ambientes não aprovados e não prova uma falha geral da ASF. Os pedidos antigos de telemetria continuam a ser preflight sem função ativa; não demonstram falhas de gravação no endpoint atual.

## 7. Divergência do histórico de migrações — reconciliação inicial

O inventário foi comparado por versão de 14 dígitos e por nome normalizado, removendo prefixos de data e sufixos de data conhecidos. Resultado deste mapeamento conservador:

| Indicador | Quantidade |
|---|---:|
| Migrações registadas como aplicadas no Supabase | 121 |
| Ficheiros SQL no ramo auditado | 67 |
| Correspondências por versão/nome normalizado | 61 |
| Registos de produção sem par identificado no snapshot de nomes/versões | 60 |
| Ficheiros atuais sem par identificado no histórico consultado | 6 |

Os valores de correspondência são **uma triagem automatizada, não um veredicto sobre scripts em falta**. Há ficheiros com carimbo temporal alterado, nomes encurtados ou migrações potencialmente renomeadas/revertidas. Portanto, os 60 registos sem par identificado podem incluir históricos renomeados ou substituídos; os 6 ficheiros sem par também não devem ser aplicados apenas por estarem no repositório. Esta diferença impede tratar a pasta atual como reprodução fiel da sequência aplicada em produção.

### Evidência encontrada no histórico Git

A história do repositório confirma que a pasta passou por várias correções de timestamps e remoção de ficheiros considerados duplicados/desalinhados. Exemplos observados nos commits:
- **9 de outubro:** foi adicionado `20261009051204_hourly_consultations_and_presence.sql` e depois removido o ficheiro `20261009053000_hourly_consultations_and_presence.sql` com a mensagem “remove duplicate hourly analytics migration filename”.
- **9 de outubro:** foi adicionado `20261009045708_fix_browser_presence_kpi.sql` e removido `20261009052000_fix_browser_presence_kpi.sql` como duplicado.
- **19 de outubro:** `20261019114442_admin_v3_recover_legacy_orphan_consultations.sql` substituiu o nome/versão anterior `20261019114500_admin_v3_recover_legacy_orphan_consultations.sql`.
- **19 de outubro:** `20261019104631_admin_v3_compute_work_mem_64mb.sql` substituiu a versão de nome/tempo `20261019104600_admin_v3_compute_work_mem_64mb.sql`.
- **19 de outubro:** `20261019120225_admin_v3_restore_invalid_input_classification.sql` substituiu `20261019120000_admin_v3_restore_invalid_input_classification.sql`.

Estes exemplos mostram um padrão real de alinhamento de nomes/versões e limpeza de ficheiros repetidos, por isso a diferença entre os dois totais não deve ser resumida simplesmente a “54 migrações em falta”. Mas também **não prova que os registos do ledger sem par estejam reconciliados**: é necessário comparar cada versão/nome, o SQL dos commits e o estado atual do esquema antes de produzir uma baseline segura.

Exemplos de ficheiros sem par identificado no ledger pelo mapeamento atual:
- `20261008_harden_telemetry_presence.sql`
- `20261010222630_consulted_installations_last_3m.sql`
- `20261011080000_admin_refresh_performance.sql`
- `20261012182000_admin_auxiliary_fast.sql`
- `20261012190000_admin_performance_fastpaths.sql`
- `20261012194100_admin_dashboard_shared_cache.sql`

**Atualização da análise de conteúdo/schema:** a revisão objeto a objeto dos seis ficheiros sem par está documentada em [migration-reconciliation-2026-10-22.md](./migration-reconciliation-2026-10-22.md). Os objetos centrais de todos os seis já aparecem no catálogo atual, em vários casos com parâmetros posteriores; isso é evidência contra os reaplicar, não prova que os SQL originais foram executados byte a byte.

**Plano seguro para concluir a reconciliação:**
1. Exportar um snapshot do esquema real: tabelas/colunas, constraints, índices, triggers, funções e assinaturas, privilégios, RLS, extensões e cron jobs.
2. Recolher os ficheiros SQL e diffs dos commits antigos disponíveis no GitHub; comparar o conteúdo das migrações relacionadas, não apenas os nomes.
3. Classificar cada caso como correspondência exata, versão alterada, renomeação, substituição/reversão, ou desconhecido, mantendo a evidência e o SHA.
4. Restaurar ficheiros históricos recuperáveis numa branch separada sem os aplicar; fazer comparação de esquema numa base de teste descartável.
5. Só depois preparar uma baseline documentada para instalações novas. Não renomear migrações aplicadas, não apagar/resetar o ledger e não reaplicar em lote em produção.

## 8. Prioridades e critérios de fecho

1. **Publicação controlada da fonte modular:** abrir o PR #156 para aprovação final apenas depois da aceitação em Windows. O ficheiro de desenvolvimento `verix-app.html` é um apontador; o artefacto distribuível é o HTML gerado pelo build seguro em `dist/verix-app.html`.
2. **Aceitação operacional no Windows:** testar resultados ASF com seguro, sem registo e erro de rede; duas consultas IMT (inspeção/livrete), histórico/retoma; painel Admin autenticado; telemetria e consulta de métricas. Comparar resultados do Admin com a RPC correspondente no Supabase. Este teste requer um PC real com o contexto de rede e permissões usados pela GNR.
3. **Depois da publicação:** acompanhar por intervalo de tempo `OPTIONS 404` da rota antiga, `POST 2xx` na `telemetry-v2`, erros de ingestão e latência das RPCs; não misturar requests HTTP com consultas válidas nem sessões com pessoas.
4. **Índices e funções SQL antigas:** o mapa read-only Edge Function → RPC → tabela/trigger ficou documentado em [telemetry-supabase-dependency-map-2026-10-22.md](./telemetry-supabase-dependency-map-2026-10-22.md). Testar planos de execução e hardening de privilégios num ambiente de teste antes de qualquer remoção/alteração.
5. **Migrações:** completar a comparação baseada em conteúdo e schema, depois documentar uma baseline para instalações novas.

## 8.1 Reconciliação da fonte principal com a `main`

Foi comparada a versão publicada em `main` (22/10/2026) com a fonte integral usada como base para a extração modular (commit `9d6f9f08809cd953fae2545d2f743f04f9a8a1d5`):

- A versão atual da `main` tem **1.097.196 caracteres**; a fonte base da extração tem **1.098.852 caracteres**.
- A diferença fica em três blocos pequenos perto da serialização dos metadados de telemetria ASF, com **20 linhas líquidas adicionais** na fonte modular. Os campos adicionais encaminham metadados que o motor de diagnóstico já recolhe (tempos, fila, hash/tipo de resposta e informação limitada sobre tentativas/parsing); não encaminham o corpo bruto da resposta ASF.
- O segmento protegido desde `function asfTentativaRetryable(status, errorType)` até imediatamente antes de `function anunciarEstadoConsultaASF(mensagem)` tem **13.718 caracteres nas duas versões e é exatamente igual, byte a byte**. O HTML antigo e a fonte compilada não referenciam a rota não versionada `/functions/v1/telemetry`; a rota atual `/functions/v1/telemetry-v2` existe em ambas.

**Conclusão:** a divergência do HTML não representa uma alteração inadvertida do motor ASF. É uma extensão da projeção de telemetria de diagnóstico já presente na anterior proposta de reestruturação. O teste ASF continua protegido por comparação exata e passou nas validações automáticas. Esta conclusão não elimina a necessidade do teste funcional com a rede real, nem resolve as chamadas `OPTIONS 404` que ainda chegam de clientes antigos.

### Auditoria repetível

As consultas usadas para repetir o snapshot de migrações, tabelas/RLS, funções/ACL, índices, triggers e tarefas `pg_cron` estão guardadas em [docs/sql/supabase-readonly-audit.sql](./sql/supabase-readonly-audit.sql). O ficheiro contém exclusivamente consultas `SELECT`; não aplica migrações nem altera o banco.

## 9. O que foi verificado nesta proposta

- No candidato de código `98c8631995c8d0b59a830ab46b66e033fb1b1a89`, passou `VÉRIX Windows Source Validation` (run [#39775385290](https://github.com/verix-plataformadigital/verix/actions/runs/39775385290)); no commit de merge de teste `778314dc1b27e9ddb3a0da4e6ed7af29917fe1f7` passaram também `VÉRIX Security Audit` (#868) e `Telemetry Integrity` (#443). O candidato de código anterior `04b51c1079702e46e99b291a61229562ade1cb29` também passou `ASF Retry Experiment Validation` e os outros três gates.
- O verificador de fonte reconstrói o HTML e falha se encontrar uma referência exata ao endpoint antigo; o verificador ASF compara o bloco de motor protegido com a fixture de regressão. A comparação direta da fonte da `main` com a fonte base modular confirmou que o bloco protegido de 13.718 caracteres é byte a byte idêntico.
- O artefacto `VERIX-Windows-Acceptance-Candidate` foi produzido pelo runner Windows em 22/10/2026 (run [#39775385290](https://github.com/verix-plataformadigital/verix/actions/runs/39775385290)), com build ID `1.5-sec-20261022-windows-ci` e SHA-256 do HTML `2c1f59835f11c80b27813ca75c2001dd9dca6fd268058a90800605acb8604395`. O artefacto expira em 29/10/2026 às 12:04 UTC. Consultar a [checklist Windows](./windows-acceptance-checklist-2026-10-22.md). É um candidato de teste, não uma publicação de produção.
- Os advisors Supabase de segurança e desempenho não devolveram avisos na leitura efetuada; este resultado pontual não é garantia de ausência de problemas.
- As três tarefas `pg_cron` observadas estão ativas e as últimas cinco execuções consultadas por tarefa não mostraram falhas. A atualização da cache Admin demorou cerca de 2,1–4,3 segundos nas amostras recentes.
- As tabelas operacionais/legacy consultadas têm RLS ativo e políticas de negação para `anon`/`authenticated`. O inventário de dependências e o apontamento `PUBLIC EXECUTE` de duas funções auxiliares estão detalhados no mapa, sem mudanças de privilégios.
- Nenhuma migração, alteração de schema, alteração de dados, alteração de permissões ou publicação de produção foi executada.

**Estado honesto:** a fonte modular e os gates automáticos estão preparados e a ingestão atual responde. A comparação dos seis ficheiros SQL sem par já foi aprofundada ao nível dos objetos atuais e está documentada; a reconstrução de todos os 60 registos de ledger sem par nominal continua a exigir recuperação e comparação de históricos Git. O candidato com build ID `1.5-sec-20261022-windows-ci` tem SHA-256 `2c1f59835f11c80b27813ca75c2001dd9dca6fd268058a90800605acb8604395`. Os quatro workflows passaram no commit de código `04b51c1079702e46e99b291a61229562ade1cb29`. Isso valida a estrutura/compilação, não substitui a aceitação funcional real ASF/IMT/Admin no contexto operacional Windows. Nenhuma migração, alteração de dados, mudança de permissões ou publicação de produção foi executada.
