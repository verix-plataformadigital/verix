# Reestruturação de arquitetura VÉRIX — 22/10/2026

- Fonte operacional repartida em 68 ficheiros-fonte físicos: 26 estilos e 40 ficheiros JavaScript (34 blocos lógicos; o maior bloco foi dividido em sete partes semânticas).
- verix-app.html passa a apontador; o build recompõe o HTML portátil a partir de src/operational/template.html e blocks.json.
- A reconstrução foi comparada byte a byte com a fonte base; as sete partes do script transversal e os três fragmentos CSS foram concatenados e comparados byte a byte. O HTML de legislação foi extraído e a serialização de volta à string original também foi validada.
- O motor ASF mantém a fixture de regressão. Esta proposta não altera SQL nem produção.
- A configuração passa a declarar as oito Edge Functions ativas e a CI exige esse inventário.
- Existiam 121 migrações aplicadas e 67 ficheiros SQL na leitura de 22/10/2026. Reconciliar sem renomeação/reaplicação em lote.

## Limite explícito
O bloco clássico principal foi subdividido por responsabilidades (prelúdio/IMT, menu, histórico, cópia de legislação, ASF, ferramentas externas e cinemómetro), mantendo-se concatenado durante o build para preservar o mesmo âmbito lexical. A separação de funções globais entre módulos de execução ainda requer testes e pode ser uma etapa futura.
