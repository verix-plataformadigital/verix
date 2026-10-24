# Recuperação do motor ASF — 2026-10-24

## Resultado executado

Restaurado o código de `supabase/functions/asf-proxy-v1/index.ts` para a implementação histórica pré-fila guardada no Git commit `fda0657b182544eeb4ba22569e1040851078837c`.

- Blob SHA histórico: `fbb78b992f0b86de6a46345aaa3431166e45afd8`.
- GitHub `main` atualizado no commit `2675becf2a1c0d75a9392fa69755c2e352160109`.
- Edge Function Supabase ativa: `asf-proxy-v1` versão 25, `verify_jwt=false`.
- A função restaurada não contém `ASF_QUEUE`, nem chama `verix_asf_try_acquire_slot` ou `verix_asf_release_slot`.
- Migração compensatória `restore_asf_pre_queue_baseline` aplicada (versão de migração `20261024163607`): removeu apenas as duas RPCs e a tabela `verix_asf_serial_gate`, introduzidas em 23 de outubro.
- Foram preservados os registos históricos de migração e os dados/tabelas de telemetria. A função genérica `verix2_consume_rate_limit` e a tabela `verix2_rate_limits` não foram alteradas.
- A versão 24 da função, antes da substituição, ficou arquivada em `backups/asf-proxy-v1/2026-10-24-index-v24-before-restore.ts` (blob SHA `5012cbcc034af6df6f43e12fdef37bd329e99879`).

## Comportamento preservado

O proxy voltou ao fluxo direto para `https://ext01.asf.com.pt/api/src/`, mantém validação de matrícula/data, token HMAC, validação de build e CORS, e usa timeout de 15 segundos para o pedido à ASF. A fila PostgreSQL e o limite de espera de 90 segundos foram removidos do caminho de consulta. Não foi introduzida uma quota local por minuto.

A função de emissão de token `verix-gate-v1` foi deixada intacta (versão 5). Também não foi feito rollback integral de `verix-app.html`: a comparação de commits indica que a mudança de 23 de outubro que introduziu a fila estava na função server-side/migrações, enquanto as alterações posteriores no cliente estavam ligadas a telemetria/interface. A rota cliente → gate → proxy mantém-se.

## Verificação depois da publicação

Às 16:35:02 UTC de 24 de outubro, a versão 25 ficou ativa. Os registos posteriores mostram 8 pedidos POST ao proxy com HTTP 200 e 7 pedidos OPTIONS com HTTP 204, até 16:36:36 UTC. As funções/tabela da fila já não existem no schema.

**Limitação:** HTTP 200 confirma que o proxy respondeu, não que o corpo GraphQL contenha dados de seguro. A confirmação funcional final exige testar no VÉRIX uma matrícula válida conhecida e verificar se o resultado contém dados de seguro ou um resultado legítimo sem seguro. Os erros GraphQL que a própria ASF devolve continuam a ser uma causa externa possível; o rollback não pode garantir que a ASF esteja sempre operacional.

## Referências

- Baseline histórico: `fda0657b182544eeb4ba22569e1040851078837c`
- Código original do proxy: `https://github.com/verix-plataformadigital/verix/blob/fda0657b182544eeb4ba22569e1040851078837c/supabase/functions/asf-proxy-v1/index.ts`
- Backup da versão 24: `backups/asf-proxy-v1/2026-10-24-index-v24-before-restore.ts`
- Migração de compensação: `supabase/migrations/20261024_restore_asf_pre_queue_baseline.sql`
