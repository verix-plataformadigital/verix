# VÉRIX — Arquitetura e manutenção

## Fontes principais

- `verix-app.html`: aplicação operacional e integração com os serviços.
- `index.html`: ponto de entrada publicado.
- `verix-mobile.html`: compatibilidade com ligações móveis antigas.
- `verix-mobile.js` e `verix-mobile.css`: adaptação responsiva.
- `admin_v2.html`: consola administrativa.
- `supabase/functions/`: lógica de servidor.
- `supabase/migrations/`: alterações persistentes à base de dados.
- `tools/build-secure-release.mjs`: build de publicação.
- `windows/VerixPortable/`: host Windows WebView2.

## Fluxos

- **Aplicação:** `index.html` → `verix-app.html`.
- **ASF:** cliente → `verix-gate-v1` → token de curta duração → `asf-proxy-v1` → ASF.
- **Telemetria:** cliente → `telemetry-v2` → tabelas de telemetria no Supabase.
- **Admin:** `admin_v2.html` → `admin-auth-v2` → `stats-v2` e `hourly-history-v2`.

## Build e publicação

1. O build usa Node.js 22 e `npm run build:secure`.
2. Os ficheiros de publicação são gerados em `dist/`; não se editam nem se versionam manualmente.
3. `deploy-pages.yml` valida a integridade do artefacto e publica apenas `dist/`.
4. `security-audit.yml` executa as verificações em pull requests e por acionamento manual.
5. As Edge Functions e as migrações Supabase são alterações de servidor/base de dados separadas da publicação do site.

## Invariantes de manutenção

- O browser é um ambiente não confiável. Autorização, limites de utilização e acesso aos serviços externos têm de ser impostos no servidor.
- Nunca incluir chaves de serviço, palavras-passe administrativas ou segredos de assinatura no cliente ou nos commits.
- Preservar os nomes e os contratos públicos usados pela aplicação, pelo painel e pelas Edge Functions.
- A telemetria deve distinguir eventos brutos, consultas identificadas por `query_id`, resultados finais, erros, eventos sem correlação e heartbeats.
- Heartbeats são sinais de presença, não consultas nem pessoas únicas.
- Não acrescentar camadas temporárias de CSS/JavaScript sem retirar a implementação substituída ou documentar por que razão a compatibilidade é necessária.
- Não remover tabelas, funções ou políticas antigas sem confirmar os consumidores e preparar uma migração própria.
- Qualquer alteração ao build tem de validar sintaxe, marcadores críticos e ausência de source maps antes da publicação.
