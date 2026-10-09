# VÉRIX

Ferramenta operacional de consulta e apoio à fiscalização rodoviária.

## Publicação

O workflow `.github/workflows/deploy-pages.yml` constrói a aplicação e publica apenas o artefacto gerado em `dist/`.

`main` → build seguro → verificações de integridade → `dist/` → GitHub Pages.

Não editar `dist/` manualmente: é uma pasta gerada, não a fonte de verdade.

## Componentes principais

| Caminho | Responsabilidade |
|---|---|
| `verix-app.html` | Aplicação operacional |
| `index.html`, `verix-mobile.*` | Entrada e adaptação a ecrãs pequenos |
| `admin_v2.html` | Painel administrativo |
| `supabase/functions/` | Autenticação, ASF, telemetria e estatísticas no servidor |
| `supabase/migrations/` | Alterações ao esquema e às funções da base de dados |
| `tools/build-secure-release.mjs` | Geração e validação do build |
| `windows/VerixPortable/` | Host Windows baseado em WebView2 |

## Build local

Requer Node.js 22, indicado em `.nvmrc`.

```sh
npm install --no-fund --no-audit
npm run build:secure
```

O comando gera `dist/` e valida os blocos críticos e a sintaxe JavaScript. Não publica o site; a publicação oficial é executada pelo GitHub Actions.

## Regras essenciais

- Nunca guardar segredos no HTML, JavaScript do cliente ou repositório.
- Alterações a ASF, autenticação ou telemetria têm de preservar os contratos do cliente e do servidor.
- O repositório é público: a ofuscação não torna o código-fonte confidencial.

Detalhes de arquitetura: [ARCHITECTURE.md](ARCHITECTURE.md). Segurança e resposta a incidentes: [SECURITY.md](SECURITY.md).
