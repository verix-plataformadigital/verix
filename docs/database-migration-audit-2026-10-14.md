# Auditoria de divergência do histórico de migrações — VÉRIX

**Data:** 14/10/2026  
**Origem:** leitura do histórico Supabase de produção e da árvore do ramo `main`.  
**Objetivo:** registar drift sem executar/reaplicar migrações históricas nem inventar SQL.

## Resumo verificado

| Indicador | Resultado |
|---|---:|
| Migrações registadas como aplicadas em produção | 81 |
| Ficheiros timestamped em `supabase/migrations/` no `main` | 24 |
| Correspondências exatas (versão e nome) | 7 |
| Migrações aplicadas sem ficheiro com o mesmo nome | 63 |
| Migrações aplicadas cujo nome existe mas timestamp diverge | 11 |
| Ficheiros do repositório sem migração aplicada com o mesmo nome | 5 |

**Interpretação:** esta diferença mostra que a pasta de migrações não reproduz de forma fiável o histórico da base de dados de produção. Por si só, não prova que o esquema atual esteja incorreto: algumas migrações podem ter sido renomeadas, substituídas, aplicadas diretamente ou revertidas depois. Nomes e timestamps não bastam para provar equivalência de SQL.

## 1. Migrações aplicadas sem ficheiro com o mesmo nome

| Versão aplicada | Nome aplicado |
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
| `20261002174651` | `verix2_hardening_rls_retention_20261002` |
| `20261002174915` | `verix2_daily_cleanup_schedule_20261002` |
| `20261002175140` | `fix_admin_client_coverage_metric_20261002` |
| `20261007220445` | `harden_legacy_rls_20261007` |
| `20261007235400` | `create_verix_build_registry` |
| `20261008000146` | `lock_verix_build_registry_policies` |
| `20261009040024` | `repair_telemetry_integrity_and_query_metrics_20261009` |
| `20261010061716` | `fix_rolling_windows_and_online_consultation_metric` |
| `20261010062051` | `make_7d_30d_windows_rolling` |
| `20261010064615` | `optimize_admin_analytics_pending_query_lookups` |
| `20261010064657` | `set_admin_analytics_function_timeout` |
| `20261010064955` | `use_non_materialized_event_windows_for_admin_analytics` |
| `20261010065332` | `add_observed_client_ip_to_admin_installations` |
| `20261010065412` | `group_error_installations_by_observed_ip` |
| `20261010065536` | `separate_error_sessions_under_each_observed_ip` |
| `20261010081254` | `align_period_windows_with_history_total` |
| `20261010084904` | `count_only_valid_plate_errors_in_summary` |
| `20261010104446` | `strengthen_portuguese_plate_format_validation` |
| `20261010110015` | `expand_supported_portuguese_plate_formats` |
| `20261010110604` | `recognize_diplomatic_and_export_plate_formats` |
| `20261010135437` | `admin_plate_format_structure_only` |
| `20261010200159` | `fix_telemetry_hourly_and_retention` |
| `20261010200242` | `fix_rolling_24h_bucket_boundaries` |
| `20261010200507` | `verix_telemetry_one_year_history_and_expired_case_cleanup` |
| `20261010210919` | `hourly_consultations_use_all_query_markers` |
| `20261010215834` | `restore_production_sql_logic_to_20261009` |
| `20261010220007` | `remove_oct10_only_admin_ip_and_plate_helpers` |
| `20261010220140` | `restore_preexisting_os_column_after_recovery` |
| `20261010220530` | `restore_installation_os_column_after_recovery` |
| `20261010222938` | `verix_consulted_installations_3m` |
| `20261011071858` | `optimize_admin_analytics_work_mem` |
| `20261011072143` | `admin_dashboard_fast_path_and_analytics_tuning` |
| `20261011072219` | `admin_dashboard_memory_tuning` |
| `20261011072503` | `admin_dashboard_memory_tuning_32mb` |
| `20261011072553` | `admin_dashboard_presence_window_parity` |
| `20261011210030` | `admin_dashboard_fast_stats` |
| `20261011213412` | `increase_admin_analytics_work_mem` |
| `20261011213437` | `right_size_admin_analytics_work_mem` |
| `20261011213458` | `fine_tune_admin_analytics_memory` |
| `20261011213519` | `right_size_legacy_admin_dashboard_work_mem` |
| `20261012093120` | `reduce_insurance_no_cases_retention_to_7_days` |
| `20261012112010` | `add_portuguese_plate_error_metric_for_summary` |
| `20261012180048` | `narrow_dashboard_event_cte_and_index_error_reads` |
| `20261012180211` | `narrow_lifetime_analytics_event_projection` |
| `20261012180504` | `add_targeted_fast_admin_auxiliary_metrics` |
| `20261012180751` | `index_missing_telemetry_coverage_and_avoid_json_full_scan` |
| `20261012181346` | `add_targeted_fast_admin_error_aggregates` |
| `20261012181536` | `extend_auxiliary_metrics_for_total_and_module_transitions` |
| `20261012181620` | `keep_auxiliary_metrics_lightweight` |
| `20261012181643` | `add_targeted_fast_historical_total_metrics` |
| `20261012182011` | `add_historical_asf_latency_percentiles_to_fast_total` |
| `20261012182041` | `keep_total_fast_rpc_narrow` |
| `20261012184438` | `admin_dashboard_shared_cache_concurrency` |

## 2. Mesmo nome, timestamp diferente

Não alterar os timestamps automaticamente. Primeiro recuperar e comparar o SQL original.

| Versão aplicada | Nome aplicado | Ficheiro encontrado |
|---|---|---|
| `20261009042049` | `reset_telemetry_baseline_and_history_total` | `20261009043000` (`20261009043000_reset_telemetry_baseline_and_history_total.sql`) |
| `20261009075227` | `insurance_no_cases` | `20261009080000` (`20261009080000_insurance_no_cases.sql`) |
| `20261009084656` | `deduplicate_error_plate_consultations` | `20261009092500` (`20261009092500_deduplicate_error_plate_consultations.sql`) |
| `20261012180625` | `revoke_public_admin_auxiliary_fast` | `20261012181000` (`20261012181000_revoke_public_admin_auxiliary_fast.sql`) |
| `20261012183617` | `admin_dashboard_shared_cache` | `20261012194000` (`20261012194000_admin_dashboard_shared_cache.sql`), `20261012194100` (`20261012194100_admin_dashboard_shared_cache.sql`) |
| `20261012184641` | `admin_dashboard_cache_prewarm` | `20261012200000` (`20261012200000_admin_dashboard_cache_prewarm.sql`) |
| `20261012185624` | `revert_legacy_analytics_work_mem` | `20261012201000` (`20261012201000_revert_legacy_analytics_work_mem.sql`) |
| `20261013063030` | `remove_admin_module_transition_metric` | `20261013073000` (`20261013073000_remove_admin_module_transition_metric.sql`) |
| `20261013065241` | `admin_admin_performance_tuning` | `20261013065000` (`20261013065000_admin_admin_performance_tuning.sql`) |
| `20261013093900` | `admin_hourly_active_interactions` | `20261013090000` (`20261013090000_admin_hourly_active_interactions.sql`) |
| `20261013095151` | `hourly_usage_bucket_dates` | `20261013100000` (`20261013100000_hourly_usage_bucket_dates.sql`) |

## 3. Ficheiros do repositório sem migração aplicada com o mesmo nome

Podem ser migrações propostas, substituídas ou aplicadas sob outro nome. Não as executar em produção apenas para alinhar o histórico.

| Versão do ficheiro | Nome do ficheiro | Caminho |
|---|---|---|
| `20261009034000` | `repair_telemetry_integrity_and_query_metrics` | `supabase/migrations/20261009034000_repair_telemetry_integrity_and_query_metrics.sql` |
| `20261010222630` | `consulted_installations_last_3m` | `supabase/migrations/20261010222630_consulted_installations_last_3m.sql` |
| `20261011080000` | `admin_refresh_performance` | `supabase/migrations/20261011080000_admin_refresh_performance.sql` |
| `20261012182000` | `admin_auxiliary_fast` | `supabase/migrations/20261012182000_admin_auxiliary_fast.sql` |
| `20261012190000` | `admin_performance_fastpaths` | `supabase/migrations/20261012190000_admin_performance_fastpaths.sql` |

## Correções recentes já aplicadas

- Retenção de `public.verix_insurance_no_cases` restaurada para 90 dias: valor por defeito e registos ainda existentes dentro da janela atualizados. Os registos previamente apagados ao fim de 7 dias não são recuperáveis.
- Políticas RLS explícitas de negação para `anon` e `authenticated` nas tabelas privadas de cache administrativa, lista de resultados «Sem registo» e histórico interno de consultas.
- Os avisos de segurança `rls_enabled_no_policy` para estas três tabelas desapareceram do advisor Supabase.
- As migrações aplicadas em produção para essas correções foram registadas num PR já integrado no `main`.

## Plano seguro de reconciliação

1. **Não reaplicar em lote** migrações antigas ausentes. Algumas podem conter `DROP`, substituições de funções ou alterações que já foram aplicadas de outra forma.
2. Recuperar os ficheiros originais a partir do histórico de branches/PRs, commits ou backups controlados. Classificar cada migração como recuperada, renomeada, substituída, revertida ou irrecuperável.
3. Comparar o SQL recuperado com o estado atual real: definições de funções, tabelas, índices, triggers, grants e políticas RLS. O esquema atual permite validação, mas não substitui o histórico original.
4. Testar a sequência num ambiente descartável/Supabase branch antes de alterar produção.
5. Adicionar CI para bloquear versões duplicadas, nomes/timestamps inconsistentes e alterações de migração sem justificação.
6. Para instalações novas, construir um baseline verificado a partir do esquema atual e dos scripts recuperados. Não assumir que o conjunto incompleto atual permite reconstruir a produção desde zero.

**Limite deliberado:** este documento não modifica a base de dados. Não foram inventados nem reaplicados scripts históricos. O motor ASF não foi alterado.
