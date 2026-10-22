# VÉRIX — Mapa de dependências operacionais (GitHub + Supabase)

**Data da leitura:** 22 de outubro de 2026  
**Escopo:** fonte do ramo `refactor/modular-operational-source-2026-10-22`, Edge Functions efetivamente implantadas e leitura do catálogo PostgreSQL em produção.  
**Limite:** este é um inventário de dependências observadas, não uma autorização para remover endpoints/RPCs ou alterar dados.

## 1. Percurso de consulta e ASF

```text
HTML operacional compilado
  ├─ verix-gate-v1 ── valida build/cliente e emite credencial de cliente
  └─ asf-proxy-v1 ── transporta o pedido ASF
                       └─ serviço ASF upstream
```

O motor ASF do HTML permanece protegido por verificação de regressão byte a byte. `verix-gate-v1` e `asf-proxy-v1` são partes distintas do caminho: a primeira valida acesso/build; a segunda transporta o pedido. Nenhuma mudança do motor ASF ou publicação foi feita durante esta auditoria.

## 2. Percurso da telemetria

```text
HTML operacional
  └─ POST /functions/v1/telemetry-v2
       ├─ verix2_consume_rate_limit(...)
       ├─ verix2_ingest_telemetry(events, installations, sessions)
       │    ├─ verix2_events
       │    ├─ verix2_installations
       │    └─ verix2_sessions
       └─ verix_insurance_no_cases (registos negativos com expiração)
```

A Edge Function implantada `telemetry-v2` chama as RPCs `verix2_consume_rate_limit` e `verix2_ingest_telemetry`. O catálogo de produção mostra ambas com execução permitida a `service_role` e `postgres`, não a `anon`/`authenticated`. A ingestão usa um serviço de dados versionado, enquanto a função de limite controla a cadência do endpoint de telemetria. Este mecanismo é distinto do transporte ASF; não se deve inferir que um limite de telemetria limita consultas ao motor ASF.

Os eventos guardam identificadores de evento/consulta/sessão e metadados da aplicação. A auditoria não examinou nem exportou dados brutos de matrícula para este relatório.

## 3. Percurso Admin e histórico

```text
Admin browser
  └─ admin-auth-v2 ── autenticação + limite de tentativas ── token HMAC com scope=admin
       ├─ stats-v2 ── verifica token e chama RPCs de métricas/cache
       ├─ admin-telemetry-v3 ── API de métricas read-only (RPC)
       └─ hourly-history-v2 ── consulta histórico por hora (RPC)
```

As funções de consulta Admin verificam token assinado e expiração antes de consultar a base de dados. `stats-v2` faz pedidos RPC com a chave de serviço no servidor, usando rotas e funções conhecidas pela própria implementação; o navegador não recebe essa chave. O inventário do catálogo confirmou as principais RPCs de dashboard/histórico que a função referencia, incluindo:

- `verix2_admin_dashboard_v3`
- `verix2_admin_live_summary_v1`
- `verix2_admin_insurance_delta_v1`
- `verix2_admin_daily_trend_30d`
- `verix2_admin_error_ledger_v3`
- `verix2_admin_total_fast`
- `verix2_admin_auxiliary_fast`
- `verix2_admin_usage_detail_fast`
- `verix2_admin_hourly_active_interactions`
- `verix2_admin_analytics`
- `verix2_admin_errors_fast`
- `verix2_admin_system_telemetry_fast`
- `verix2_admin_dashboard_cached`
- `verix2_admin_live_presence`
- `verix2_reset_all_periods`
- `verix2_hourly` (histórico por hora)

A função `admin-telemetry-v3` está documentada no seu próprio código como **read-only**. A função `verix-admin-pwa` é um proxy de distribuição de ativos estáticos do Admin, não o ponto de ingestão dos eventos.

## 4. RLS, privilégios e triggers

Leitura do catálogo de produção:
- RLS está ativo nas tabelas legacy `events`, `installations`, `sessions` e nas tabelas operacionais `verix2_events`, `verix2_installations`, `verix2_sessions`, `verix2_rate_limits`, estados/cache Admin e `verix_insurance_no_cases`.
- As políticas encontradas para essas tabelas negam operações a `anon` e `authenticated`; a ingestão/leitura administrativa passa pelas funções server-side e pela chave de serviço.
- Existem dois triggers de monotonicidade, em `verix2_installations` e `verix2_sessions`, que chamam `verix2_keep_seen_monotonic()` antes de UPDATE.
- `verix2_consume_rate_limit` e as funções de dashboard estão configuradas com `SECURITY DEFINER` e um `search_path` fixo no catálogo consultado. `verix2_ingest_telemetry` não está marcada como `SECURITY DEFINER` e tem ACL limitada a `service_role`/`postgres`.

### Nota de hardening sobre EXECUTE PUBLIC

A consulta de privilégios devolveu `PUBLIC EXECUTE` para:
- `verix2_is_portuguese_plate_format(text)` — helper booleano de validação;
- `verix2_keep_seen_monotonic()` — função de trigger, usada pelos dois triggers acima.

Isto **não foi classificado como exploração confirmada**: o helper de matrícula retorna um booleano e a função de trigger tem tipo de retorno `trigger`. Mesmo assim, a função de trigger não precisa de ser um ponto de entrada público. Recomenda-se validar a exposição PostgREST e preparar um `REVOKE EXECUTE ON FUNCTION public.verix2_keep_seen_monotonic() FROM PUBLIC` numa migração controlada, depois de testar que os triggers continuam a executar sob os papéis relevantes. Nenhuma permissão foi alterada durante esta auditoria. Não revogar privilégios ou reaplicar migrações em lote enquanto a reconciliação do ledger estiver incompleta.

## 5. Tarefas agendadas e execução recente

As três tarefas ativas observadas em `cron.job`:

| Tarefa | Cadência | Última evidência consultada | Estado |
|---|---|---|---|
| `verix2_daily_cleanup` | Diária, 03:20 UTC | 22/10/2026 03:20 UTC | Sucesso |
| `verix_insurance_no_cases_expiry` | De 5 em 5 min | 22/10/2026 11:50 UTC; `DELETE 0` | Sucesso |
| `verix2_admin_dashboard_cache_refresh` | De 5 em 5 min | 22/10/2026 11:50 UTC; 1 linha devolvida | Sucesso |

A leitura das últimas cinco execuções de cada tarefa não mostrou falhas. A atualização da cache Admin terminou entre cerca de **2,1 e 4,3 segundos** nas execuções recentes analisadas. É mais rápida do que o intervalo de cinco minutos e não falhou nesta amostra, mas vale a pena acompanhar duração e falhas futuras.

## 6. Estado da confirmação

- O verificador da fonte e os testes de montagem passaram em runner Linux e Windows.
- Os três workflows de segurança, integridade da telemetria e experimento de retry ASF passaram no commit de código `6b616bb7ca63c3e51b60ebafd021016365556bc1`.
- A verificação adicional `VÉRIX Windows Source Validation` passou, incluindo build seguro no Windows e presença da rota de telemetria atual.
- Os logs ainda mostram preflights à rota antiga `/functions/v1/telemetry` com 404 mesmo quando `telemetry-v2` recebe `POST 200`. Ver [auditoria Supabase](./supabase-audit-2026-10-22.md).
- Nenhuma migração, alteração de schema, alteração de dados, alteração de permissões ou publicação em produção foi executada.

**Critério de fecho restante:** executar a aceitação funcional real no PC Windows e no contexto de rede da unidade; aprovar/publicar o HTML compilado só depois disso; substituir cópias locais antigas; voltar a medir o endpoint legado. Reconciliar as 121 entradas de ledger por conteúdo/schema antes de qualquer consolidação ou limpeza de migrações.
