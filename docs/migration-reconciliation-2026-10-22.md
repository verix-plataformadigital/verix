# VÉRIX — Reconciliação do histórico de migrações

**Data da verificação:** 22/10/2026, cerca das 12:08 UTC  
**Projeto Supabase:** `onilkakbgpklxvxuxmks`  
**Método:** leitura do ledger, catálogo PostgreSQL e ficheiros SQL do ramo. Nenhuma migração foi aplicada nesta análise.

## Conclusão executiva

O ledger de produção contém **121** registos e o ramo tem **67** ficheiros SQL. A comparação por nome/versão encontra 61 correspondências nominais, 60 registos do ledger sem par identificado e 6 ficheiros SQL sem par. Isto é divergência de histórico, não prova de 54 migrações em falta.

A revisão dos seis ficheiros sem par mostra que os principais objetos que criam ou alteram **já existem no esquema atual**. Em vários casos os parâmetros de desempenho ou a implementação observada correspondem a evoluções posteriores. Aplicar esses ficheiros por estarem sem par poderia sobrescrever funções mais recentes. Não se deve reaplicar, renomear ou apagar migrações aplicadas para fazer os nomes coincidir.

## Revisão dos seis ficheiros sem par

| Ficheiro do ramo | Evidência no catálogo atual | Classificação prudente |
|---|---|---|
| `20261008_harden_telemetry_presence.sql` | `verix2_admin_analytics` existe; `verix2_keep_seen_monotonic()` existe; os triggers `verix2_installations_seen_monotonic` e `verix2_sessions_seen_monotonic` estão instalados. A função analítica contém as métricas de presença e eventos de resultado. | Objetos presentes; verificar a versão histórica exata antes de qualquer reaplicação. |
| `20261010222630_consulted_installations_last_3m.sql` | `verix2_consulted_installations_3m(timestamptz)` existe, tem janela de três minutos e execução restrita a `service_role`. O ledger contém também o registo `verix_consulted_installations_3m` com uma versão/nome diferente. | Correspondência semântica forte; provável renomeação/evolução. Não aplicar novamente. |
| `20261011080000_admin_refresh_performance.sql` | `verix2_admin_dashboard` e `verix2_admin_analytics` existem. A configuração observada para as funções é `work_mem=48MB`, não o valor de 32 MB do ficheiro. | Implementação posterior provável; o nome não basta para equivalência exata. |
| `20261012182000_admin_auxiliary_fast.sql` | `verix2_admin_auxiliary_fast` existe, com `work_mem=16MB` e execução administrativa restrita. | Objeto presente e ajustado; não sobrescrever sem comparar corpos. |
| `20261012190000_admin_performance_fastpaths.sql` | As funções fast-path observadas existem; os índices `verix2_events_missing_client_coverage_idx`, `verix2_events_missing_asf_coverage_idx` e `verix2_events_missing_cin_coverage_idx` também existem. A função de dashboard fast atual apresenta `work_mem=64MB`, diferente do valor no ficheiro. | Objetos presentes; provável evolução posterior. Não reaplicar. |
| `20261012194100_admin_dashboard_shared_cache.sql` | A tabela `verix2_admin_dashboard_cache` e a função `verix2_admin_dashboard_cached` existem. A função está disponível apenas ao papel de serviço entre os papéis consultados. | Objetos presentes; confirmar proveniência e corpo antes de reconciliar o histórico. |

**Limite da evidência:** a presença de um objeto não prova, por si só, que um ficheiro SQL específico tenha sido executado byte a byte. O ledger guarda versão/nome; a equivalência exata requer comparar corpos das funções, índices, políticas e diffs históricos.

## Divergência de privilégios observada

A leitura de privilégios ainda mostra execução concedida a `PUBLIC`, `anon` e `authenticated` para `public.verix2_keep_seen_monotonic()`, uma função de retorno `trigger`. Os dois triggers estão instalados e a função não é uma RPC de negócio normal. Isto é uma oportunidade de hardening a avaliar separadamente, não uma exploração confirmada. Não se alteraram ACLs nesta auditoria; uma revogação deve ser feita numa migração versionada e validada.

## Retenção do registo operacional “sem registo”

O comportamento **atualmente aplicado** é retenção de 24 horas: o job `verix_insurance_no_cases_expiry` está ativo a cada cinco minutos com eliminação por `created_at < now() - interval '24 hours' OR expires_at <= now()`. Na leitura efetuada havia 597 linhas, todas com expiração nas 24 horas seguintes e zero linhas já expiradas por limpar. A migração versionada `20261019125854_insurance_no_cases_24h_retention.sql` explica a política atual. Não foi alterada; voltar a 90 dias contrariaria a configuração posterior atualmente aplicada e necessita de decisão explícita.

## Plano seguro para reconciliar completamente o ledger

1. Guardar snapshot das definições atuais de funções, índices, triggers, constraints, RLS, grants e jobs cron.
2. Recuperar, a partir do histórico Git, todos os SQL que correspondam aos 60 registos ainda sem par nominal.
3. Comparar as definições normalizadas com o catálogo, classificando cada versão como exata, substituída/evoluída, revertida ou desconhecida.
4. Construir e testar uma baseline de instalação nova numa base descartável, sem executar scripts antigos em produção.
5. Só depois atualizar documentação e política de baseline. Nunca resetar o ledger nem reaplicar migrações em lote na base operacional.

## Limites operacionais relacionados (22/10/2026)

Uma nova amostra dos logs na última hora mostrou:
- `OPTIONS` para `/functions/v1/telemetry`: **3.291 pedidos**, último observado às **12:08:37 UTC**, respostas 404.
- `POST` para `/functions/v1/telemetry-v2`: **473 pedidos**, último observado às **12:08:19 UTC**, respostas 200.
- A rota antiga não é uma Edge Function ativa e a amostra não mostrou `POST` para esse caminho. O tráfego persistente é compatível com clientes/HTML locais antigos, mas não identifica um ficheiro emissor.

Não foi criado alias para a rota antiga porque o payload e o contrato desses clientes não foram confirmados; um alias cego pode gravar eventos inválidos, duplicar contagens ou reconhecer eventos no formato errado. A correção do link oficial deve servir o artefacto compilado atual e as cópias HTML guardadas localmente devem ser substituídas. A recontagem pós-publicação continua necessária.

## Estado

- Nenhuma migração, alteração de dados, alteração de privilégios ou publicação de produção feita por este relatório.
- Os workflows automáticos do candidato modular passaram no commit `04b51c1079702e46e99b291a61229562ade1cb29`.
- O artefacto Windows de aceitação foi construído e tem checksum SHA-256 no artefacto; os testes de interação ASF/IMT/Admin em computador operacional real continuam a ser uma etapa separada.
