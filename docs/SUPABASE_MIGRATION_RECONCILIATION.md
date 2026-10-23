# Reconciliação das migrações Supabase do VÉRIX

**Estado observado:** leitura do catálogo remoto em 8 de outubro de 2026 (UTC)  
**Projeto remoto:** `verix-telemetria` (`onilkakbgpklxvxuxmks`)  
**Escopo desta nota:** inspeção de catálogo e histórico em modo de leitura. Não foram aplicadas migrações nem alterados dados de produção.

## Resultado principal

O histórico remoto devolveu **17 migrações aplicadas**. A branch tem agora sete ficheiros SQL com nomes de versão normalizados. Cinco correspondem a versões aplicadas; `20261008232530_harden_telemetry_presence.sql` não consta no histórico remoto, embora a função e os triggers que ele define já existam no catálogo atual. A nova `20261008235800_atomic_telemetry_ingest.sql` ainda não está aplicada nem registada em produção.

Doze versões do histórico remoto continuam sem o respetivo ficheiro SQL nesta branch. As branches antigas e o histórico de commits consultados não forneceram uma cópia autoritativa desses corpos SQL. O estado atual das tabelas permite descrever parte do resultado, mas **não permite reconstruir com segurança o SQL original** nem provar todos os efeitos e a ordem histórica.

## Versões aplicadas sem ficheiro SQL na branch

| Versão remota | Nome registado |
|---|---|
| `20261001090853` | `add_verix_admin_asf_diagnostic_view` |
| `20261001100021` | `add_verix2_fk_indexes` |
| `20261002105942` | `verix_v2_4_metrics_diagnostics` |
| `20261002110638` | `lock_down_asf_diagnostics_rpc` |
| `20261002110756` | `harden_legacy_verix_function_search_path` |
| `20261002110815` | `remove_duplicate_legacy_verix_indexes` |
| `20261002114221` | `expand_asf_diagnostics_response_fingerprints` |
| `20261002120012` | `clean_verix2_sql_predicates` |
| `20261002130359` | `expand_asf_quality_diagnostics_v3` |
| `20261002171417` | `harden_verix_rate_limit_and_permissions_v2` |
| `20261007235400` | `create_verix_build_registry` |
| `20261008000146` | `lock_verix_build_registry_policies` |

Os cinco ficheiros da branch que correspondem a versões já aplicadas são:

- `20261002174651_verix2_hardening_rls_retention_20261002.sql`
- `20261002174915_verix2_daily_cleanup_schedule_20261002.sql`
- `20261002175140_fix_admin_client_coverage_metric_20261002.sql`
- `20261007220445_harden_legacy_rls_20261007.sql`
- `20261008175031_add_verix2_presence_last_seen_indexes.sql`

O conteúdo dos quatro ficheiros de hardening/limpeza com nomes curtos foi preservado ao alinhá-los com as versões remotas; a alteração foi de nome, não do corpo SQL.

## O que foi confirmado no catálogo atual

- `verix_build_registry` existe, tem chave primária em `build_id`, RLS ativo e uma política `verix_build_registry_deny_all` que nega operações a `anon` e `authenticated` (`USING false` e `WITH CHECK false`).
- As tabelas `verix2_events`, `verix2_installations`, `verix2_sessions`, `verix2_rate_limits` e `verix2_dashboard_state` têm RLS ativo e políticas de negação pública.
- Os índices `verix2_installations_last_seen_idx` e `verix2_sessions_last_seen_idx` existem.
- Os triggers `verix2_installations_seen_monotonic` e `verix2_sessions_seen_monotonic` chamam `verix2_keep_seen_monotonic()`; a função também existe.
- `verix2_admin_analytics` contém atualmente os predicados de presença para `online_now` e `active_10m`, incluindo instalações, sessões e eventos recentes, e considera eventos de início/finalização da consulta de seguro na análise por `query_id`.
- O trabalho `verix2_daily_cleanup` está ativo, agendado para `20 3 * * *`, executando `select public.verix2_cleanup_old_data();`.

Estes são factos do catálogo no momento da leitura. **Não são o SQL original** das migrações em falta, nem provam que uma instalação vazia produza exatamente o mesmo estado.

## Risco de deriva do histórico

As migrações locais `20261008232530_harden_telemetry_presence.sql` e `20261008235800_atomic_telemetry_ingest.sql` não aparecem entre as 17 versões remotas aplicadas. A primeira descreve alterações de presença já visíveis no catálogo; a segunda é nova e não foi implantada. Isto mantém a diferença entre histórico de migrações e estado efetivo da base, que tem de ser reconciliada antes de se assumir uma reprodução limpa.

A migração de presença foi reforçada para lançar uma exceção caso as substituições literais não resultem numa definição de `verix2_admin_analytics` que contenha os predicados essenciais de presença e consulta, e agora seleciona a função pela assinatura exata. A nova migração de ingestão acrescenta uma única RPC transacional: primeiro cria/atualiza instalações e sessões e depois grava eventos, satisfazendo as chaves estrangeiras; uma falha reverte a transação completa. O endpoint V2 já foi alterado para usar esta RPC, mas não foi publicada nem aplicada à base remota.

## Próximos passos seguros

1. Recuperar os doze corpos SQL originais através de backups, histórico do SQL Editor, pipelines ou artefactos de deployment fiáveis. Não preencher esses ficheiros com SQL inferido a partir do estado final.
2. Rever a diferença entre o histórico remoto e o catálogo atual, incluindo a migração de presença que não está registada como aplicada.
3. Reproduzir a cadeia completa numa base local descartável e comparar o resultado com o catálogo remoto.
4. Testar a RPC numa base descartável: ingestão com instalação/sessão nova, evento que falha por violação de integridade e confirmação de rollback de todas as escritas.\n5. Só depois aprovar um plano explícito de reconciliação para produção.

Até concluir estes passos, não executar `supabase db reset --linked`, não marcar versões como aplicadas manualmente e não fazer `db push` para tentar ocultar a deriva. Esta branch não alterou a base de produção.


## Defeito do trigger partilhado, encontrado por teste real

O primeiro teste PostgreSQL revelou que `verix2_keep_seen_monotonic()` lia sempre `OLD.first_seen`, mesmo quando disparado em `verix2_sessions`, tabela que usa `started_at`. Isso provocava erro ao atualizar `last_seen` de sessões. A função é agora escrita para distinguir `TG_TABLE_NAME` e preservar o campo correto em cada tabela. As duas migrações locais de presença/ingestão definem a versão corrigida; a suite PostgreSQL começa deliberadamente com a implementação defeituosa para provar que a migração a substitui. Nenhuma função foi publicada em produção.

