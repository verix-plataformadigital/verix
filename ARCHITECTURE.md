# VÉRIX — Architecture & Maintenance Map

## 1. Fonte de verdade

- `verix-app.html`: aplicação operacional principal.
- `index.html`: bootstrap/roteador de entrada.
- `verix-mobile.html`: entrada de compatibilidade para links antigos; redireciona para a aplicação principal.
- `verix-mobile.js` + `verix-mobile.css`: camada responsiva usada pela aplicação principal em ecrãs pequenos.
- `admin_v2.html`: consola administrativa.
- `windows/VerixPortable/`: host WebView2; não contém segredos de servidor.
- `supabase/functions/`: única camada server-side para autenticação, telemetria, estatísticas, histórico e relay ASF.
- `supabase/migrations/`: alterações persistentes de base de dados.
- `tools/build-secure-release.mjs`: único construtor de produção.

## 2. Fluxo operacional

`index.html` → `verix-app.html`

`verix-app.html` → `verix-gate-v1` → token curto → `asf-proxy-v1` → ASF

`verix-app.html` → `telemetry-v2` → `verix2_events` / `verix2_installations` / `verix2_sessions`

`admin_v2.html` → `admin-auth-v2` → token administrativo → `stats-v2` / `hourly-history-v2`

## 3. Regras de manutenção

1. O browser é sempre considerado não confiável. Autorização, rate limiting e acesso ASF ficam no backend.
2. `BUILD_ID` é criado pela pipeline, injetado no cliente e vinculado ao token assinado.
3. O runtime crítico do VÉRIX não usa transformações de obfuscação que possam alterar o fluxo de execução de forma agressiva.
4. Telemetria deve continuar operacional mesmo quando um mecanismo de transporte falhar; usar fallback em vez de depender de um único `fetch`.
5. Presença é inferida por atividade recebida no servidor, não por `navigator.onLine`.
6. Cada consulta de veículo tem um `query_id` único e `vehicle_lookup` é deduplicado no servidor.
7. Não criar novas camadas CSS/JS "temporárias" sem substituir/remover a anterior. Patches de compatibilidade devem ter um motivo e ficar documentados.
8. Não editar diretamente a pasta `dist/`; ela é descartável e é regenerada pela pipeline.
9. A publicação oficial é apenas o artefacto produzido pelo `deploy-pages.yml`.
10. As tabelas `verix2_*` são a camada de telemetria corrente. As tabelas/funções antigas ficam congeladas até existir uma migração de retirada explícita.

## 4. Build e CI

- `deploy-pages.yml`: build + verificações + publicação.
- `security-audit.yml`: análise em PR/manual; não duplica o build de cada push ao `main`.
- `secure-release.yml`: gera artefacto seguro manualmente.
- `build-windows-release.yml`: publica o host Windows por tag.

A pipeline deve falhar antes do deploy quando:
- existir source map;
- faltarem os runtimes críticos;
- o `BUILD_ID` injetado não corresponder ao build;
- o JavaScript inline deixar de fazer parse.

## 5. Legado

As funções/tabelas antigas de telemetria permanecem presentes apenas por compatibilidade e histórico. Não devem voltar a ser usadas pelo cliente novo. A remoção definitiva deve ser feita numa migração própria, depois de confirmar que não existem consumidores externos.

## 6. Alterações recentes de estabilidade

- CSS histórico consolidado: 198 blocos → 46, preservando a ordem da cascata e os IDs que têm consumidores JavaScript.
- Telemetria endurecida com flush imediato, fallback de transporte, `sendBeacon` e presença baseada em `last_seen`.
- ASF relay endurecido com token assinado, validação de build e tratamento consistente de CORS.
- Build seguro com perfil conservador para o runtime operacional e checks automáticos de sintaxe/integridade.
