# VÉRIX — Changelog da Reengenharia

## [2.0.0-alpha.1] — 2026-10-08

### Engenharia
- Criada a branch isolada `reengineering-v2` e PR draft #33.
- Criada base TypeScript strict + Vite + Vitest.
- Mantido o build legado como caminho separado até à validação da V2.
- Adicionada auditoria estática do repositório à CI.
- Adicionada política formal de presença com TTL de 5 minutos.
- Adicionados contratos tipados para telemetria e ASF.

### ASF
- Criada classificação pura da resposta ASF.
- Confirmado no modelo V2 que HTTP 200 não é tratado como prova de seguro.
- Criado adapter ASF tipado, ainda sem cutover do runtime.
- O relay de produção continua inalterado.

### Supabase / presença
- Confirmado que o projeto de produção está saudável.
- Confirmado que `verix2_installations` e `verix2_sessions` sustentam a presença por `last_seen`.
- Confirmado que `verix2_admin_analytics` só é executável por `postgres`/ `service_role`.
- Identificada dívida de histórico: `20261008_harden_telemetry_presence.sql` existe no repositório, mas não aparece como migration aplicada pelo histórico oficial; as alterações correspondentes, porém, estão efetivamente presentes na base.
- Não foi feita nenhuma alteração de schema nesta fase para evitar duplicação/deriva.

### CI
- npm 10.9.9 apresentou crash interno de Arborist com `edgesOut`; a V2 passou a atualizar o resolver para npm 12.2.0 no runner.
- Corrigido o isolamento do Vitest relativamente ao `root: v2` do Vite.
- Corrigidos erros reais de typecheck.
- Corrigido fixture de teste ASF inválido.
- Preservado o comando legado `build:secure` para não quebrar a pipeline de segurança.

### Regra
Esta versão não é produção. Nenhum cutover é permitido enquanto ASF, IMT, telemetria, presença, admin, mobile, build e regressão não forem validados.
