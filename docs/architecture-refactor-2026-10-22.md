# Reestruturação de arquitetura VÉRIX — 22/10/2026

- Fonte operacional repartida em 60 módulos: 26 estilos e 34 scripts inline.
- verix-app.html passa a apontador; o build recompõe o HTML portátil a partir de src/operational/template.html e blocks.json.
- A reconstrução foi comparada byte a byte com a fonte base antes da escrita.
- O motor ASF mantém a fixture de regressão. Esta proposta não altera SQL nem produção.
- A configuração passa a declarar as oito Edge Functions ativas e a CI exige esse inventário.
- Existiam 121 migrações aplicadas e 67 ficheiros SQL na leitura de 22/10/2026. Reconciliar sem renomeação/reaplicação em lote.

## Limite explícito
O maior bloco JS (cerca de 416 KB) continua clássico por dependências globais históricas. A extração reduz o HTML-fonte e melhora a revisão, mas não afirma que esse bloco está logicamente decomposto. Isso exige auditoria de dependências e testes de aceitação em PCs Windows.
