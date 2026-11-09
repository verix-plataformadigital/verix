# Auditoria de utilização e retenção de telemetria — 09/11/2026

## Âmbito e limites

Auditoria read-only do projeto Supabase `verix-telemetria` (`onilkakbgpklxvxuxmks`) e do código da publicação atual. A contagem do email da Supabase (567 321 invocações) refere-se ao ciclo de utilização/billing; os Unified Logs consultados nesta auditoria permitem uma janela máxima de 24 horas. Portanto, a distribuição abaixo é a fotografia das últimas 24 horas, não a decomposição histórica exata das 567 321 chamadas.

## Invocações observadas nas últimas 24 horas

| Edge Function | POST/GET | OPTIONS | Total |
| --- | ---: | ---: | ---: |
| telemetry-v2 | 28 501 POST | 0 | 28 501 |
| asf-proxy-v1 | 3 543 POST | 3 541 | 7 084 |
| verix-gate-v1 | 670 POST | 667 | 1 337 |
| stats-v2 | 13 GET | 13 | 26 |
| admin-telemetry-v3 | 9 GET | 9 | 18 |
| admin-auth-v2 | 6 POST | 6 | 12 |
| **Total** | | | **36 978** |

A telemetria representa cerca de 77,1% das invocações observadas; o relay ASF cerca de 19,2%; o Gate cerca de 3,6%. O ASF está a responder 200 aos pedidos POST observados e não é o primeiro alvo de otimização.

Em `stats-v2`, os URLs registados nas últimas 24h foram apenas `dashboard-v3`, `insurance-no-cases` e `error-ledger-v3`. Não foram observadas chamadas às rotas antigas `system`, `total`, `usage`, `analytics`, `auxiliary`, `diagnostics`, `speed` ou `errors-summary`.

## Origem provável do volume da telemetria

O cliente anterior emitia um pedido imediato em cada `track()`, além de um POST próprio para cada heartbeat de 45 segundos e sinais adicionais de foco/visibilidade/retoma. A função de ingestão já não guarda heartbeats como linhas em `verix2_events`, mas continua a recebê-los para atualizar `verix2_sessions.last_seen`.

Nas mesmas 24 horas foram persistidos 11 396 eventos duráveis, face a 28 501 POST à `telemetry-v2`. A diferença é compatível com heartbeats, reenvios e lotes/duplicados; como o body dos pedidos não é registado nos Unified Logs, não é possível atribuir cada POST a um tipo de evento com precisão.

## Dados atualmente guardados

- `verix2_events`: cerca de 1 053 MB de dimensão total (tabela + índices).
- Heartbeats históricos: 445 896 linhas, aproximadamente 302 MB de tamanho de linha; os metadados associados representam cerca de 201 MB. A ingestão atual já não cria novas linhas heartbeat.
- Metadados técnicos `metadata.client`: presentes em 655 169 eventos, cerca de 267 MB. O Admin atual usa colunas tipadas `app_version`, `browser` e `device_type`, e não lê o objeto JSON duplicado `metadata.client`.
- `asfDiagnostic` em resultados positivos `vehicle_insurance_yes`: 66 114 eventos, aproximadamente 91 MB de metadados. O painel atual usa estes diagnósticos na página de erros, não nos resultados positivos.
- `asfDiagnostic` em `vehicle_insurance_no`: 6 295 eventos, aproximadamente 6,4 MB de metadados. O painel consulta os casos sem seguro a partir da tabela operacional separada, que continua a guardar matrícula e expiração durante cinco dias.
- `vehicle_insurance_error`: 1 860 eventos e cerca de 2,1 MB de metadados. Estes diagnósticos são úteis para a página de erros e devem ser preservados.
- `imt_loaded`: 4 750 eventos; o último é de 07/10/2026 e todos antecedem o reset do histórico de 09/10/2026 04:20:49 UTC.
- `session_close`: 1 678 eventos; o último é de 23/10/2026. A função de presença só consulta este evento numa janela de 90 segundos, pelo que estes registos antigos já não alteram a presença atual.

## Dados anteriores ao reset do Admin

O `reset_all_at` está definido para 09/10/2026 04:20:49 UTC. Existem 82 477 linhas anteriores a esse instante: 52 372 heartbeats e 30 105 outros eventos. Estas linhas estão fora do período de “Histórico Total” utilizado atualmente pelo painel.

O SQL de manutenção atualmente instalado não elimina `verix2_events`; apenas limpa registos antigos da tabela de rate limits. Antes de apagar o histórico anterior ao reset é necessário confirmar que não se pretende manter esse arquivo bruto para auditoria ou comparação futura.

## Alterações propostas nesta branch

1. Agrupar eventos de baixa prioridade em lotes; manter envio imediato de abertura, início de consulta e sinais críticos.
2. Enviar heartbeat apenas quando não tenha havido um evento operacional recente; o estado online continua a depender de `verix2_sessions.last_seen` e da janela de 90 segundos.
3. Remover da telemetria nova o objeto repetido `metadata.client`; manter browser, device type e app version nas colunas próprias.
4. Deixar de guardar `asfDiagnostic` em resultados positivos e sem registo; preservar integralmente os diagnósticos de `vehicle_insurance_error`.
5. Preparar, após aprovação, uma limpeza histórica separada para heartbeats, eventos anteriores ao reset e `session_close` antigos.
6. Fazer uma segunda revisão antes de remover as tabelas legadas `public.events`, `public.installations` e `public.sessions`: estão sem escrita recente e não são usadas pelo Admin atual, mas ainda existem funções SQL antigas que as referenciam.

## Proteções

- Não alterar `asf-proxy-v1`, `verix-gate-v1` ou o motor ASF.
- Não apagar dados nem executar migrações de limpeza nesta fase.
- Não remover `verix2_sessions`, `verix2_installations`, eventos finais de seguro, consultas iniciadas, registos de erro ou a tabela de casos sem seguro.
- As alterações desta branch não estão publicadas nem aplicadas no projeto Supabase.
