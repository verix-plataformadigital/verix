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
- `verix_insurance_no_cases` conserva registos “sem registo”; a retenção pretendida é de 90 dias. Não alterá-la sem aprovação explícita.

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

## 6. Endpoint legado da telemetria continua a falhar

A leitura dos últimos 15 minutos devolveu:
- `/functions/v1/telemetry`: 470 respostas HTTP 404; último registo observado às 11:04:01 UTC.
- `/functions/v1/telemetry-v2`: 119 respostas HTTP 200; último registo observado às 11:04:45 UTC.

Isto confirma que clientes continuam a chamar a rota antiga enquanto a atual responde. Não criar um alias sem identificar o cliente, payload e contrato antigo: isso pode escrever no modelo de dados errado ou duplicar contagens. A correção segura é localizar a origem/build das chamadas e migrar esses clientes para `telemetry-v2`.

## 7. Divergência do histórico de migrações

- Migrações registadas como aplicadas no Supabase: 121.
- Ficheiros SQL em `supabase/migrations/` no ramo auditado: 67.

A pasta SQL não reproduz integralmente o histórico registado em produção. Isto não prova corrupção do esquema atual, mas impede uma reconstrução fiável sem reconciliação. Não corrigir por renomeação automática, reset do ledger ou reaplicação em lote.

Plano recomendado:
1. Capturar um snapshot verificado: funções e argumentos, tabelas, constraints, índices, triggers, grants, RLS e jobs.
2. Comparar com migrações e commits históricos disponíveis.
3. Classificar diferenças: recuperada, renomeada, substituída, revertida ou desconhecida.
4. Validar em branch/ambiente descartável.
5. Criar uma baseline documentada para instalações novas, sem reescrever o histórico de produção.

## 8. Prioridades

1. Identificar e eliminar a origem dos 404 do endpoint legado.
2. Medir latência e volume de RPCs administrativos; separar indicadores ao vivo de análise histórica.
3. Avaliar índices com estatísticas estáveis e planos reais antes de os consolidar.
4. Mapear consumidores das funções `legacy` e `_v13` antes de as descontinuar.
5. Reconciliar as migrações antes de qualquer limpeza estrutural.

**Deliberadamente não feito:** nenhuma tabela, função, política, índice, migração, cache ou dado foi alterado pela auditoria.
