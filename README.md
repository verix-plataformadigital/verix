# VÉRIX

Ferramenta operacional de consulta e apoio à fiscalização rodoviária.

## Execução

A produção é servida pelo GitHub Pages e é construída exclusivamente pela pipeline segura. O ficheiro-fonte operacional é `verix-app.html`; o artefacto publicável é gerado em `dist/`.

Para uso portátil Windows, utilizar o projecto em `windows/VerixPortable/`.

## Componentes

| Componente | Função |
|---|---|
| `verix-app.html` | Aplicação operacional principal |
| `index.html` | Bootstrap/roteamento de entrada |
| `verix-mobile.html` | Compatibilidade de entrada móvel |
| `verix-mobile.js/css` | Camada responsiva |
| `admin_v2.html` | Consola administrativa |
| `supabase/functions/telemetry-v2` | Telemetria e presença |
| `supabase/functions/verix-gate-v1` | Emissão de tokens de cliente |
| `supabase/functions/asf-proxy-v1` | Relay servidor-servidor para ASF |
| `supabase/functions/admin-auth-v2` | Autenticação do painel |
| `supabase/functions/stats-v2` | Métricas e dashboard |
| `supabase/functions/hourly-history-v2` | Histórico horário |
| `tools/build-secure-release.mjs` | Build de produção |
| `windows/VerixPortable/` | Host WebView2 |

## Desenvolvimento e publicação

1. Alterar os ficheiros-fonte.
2. Nunca editar `dist/` manualmente.
3. `deploy-pages.yml` executa o build, verifica integridade e publica o artefacto.
4. `security-audit.yml` valida o build em PRs e execuções manuais.
5. Funções Supabase são publicadas separadamente para o projecto associado.

## Regras de estabilidade

O runtime operacional é um monólito legado grande. Não devem ser introduzidas transformações de obfuscação de controlo de fluxo no bloco crítico. Alterações de telemetria, ASF ou autenticação devem preservar as interfaces existentes e ser validadas ponta a ponta.

## Arquitectura

Ver `ARCHITECTURE.md` para o mapa da árvore e as regras de manutenção.
Ver `SECURITY.md` para o modelo de segurança e publicação.
