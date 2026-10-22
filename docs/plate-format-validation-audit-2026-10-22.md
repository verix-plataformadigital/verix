# Auditoria — validação do formato das matrículas portuguesas (22-10-2026)

## Defeito reproduzido

A função `public.verix2_is_portuguese_plate_format(text)` e a validação equivalente em `supabase/functions/stats-v2/index.ts` rejeitavam qualquer matrícula do formato de 2020 cujo par central fosse `00`. O validador administrativo `public.verix2_admin_plate_format_valid(text)` já excluía apenas `AA00AA`, evidenciando divergência entre os contratos.

Na base de dados, as verificações read-only reproduziram o resultado:

| Entrada normalizada | Validador de métricas antigo | Validador estrutural do Admin |
|---|---:|---:|
| `AA01AA` | true | true |
| `AB00AA` | false | true |
| `AB00CD` | false | true |
| `AA00AA` | false | false |

A regra correta para classificação de formato não deve confundir a primeira combinação reservada (`AA00AA`) com todas as combinações futuras que tenham `00` no centro. A regra de validade de formato não prova que uma matrícula foi efetivamente atribuída a um veículo.

## Correção proposta

- Alterar o validador SQL para excluir apenas `AA00AA`, mantendo as regras de forma histórica e posições de vogais.
- Alinhar o validador JavaScript do endpoint `stats-v2`.
- Acrescentar testes de regressão para formatos históricos, `AA01AA`, `AB00AA`, `AB00CD`, a combinação reservada e casos com posicionamento inválido de vogais.
- Testar a migração no momento da aplicação através de um bloco SQL `DO`.

## Fontes oficiais

- IMT — nova composição da matrícula: https://www.imt-ip.pt/faq/qual-a-composicao-da-nova-serie-do-numero-de-matricula/
- IMT — comunicado da entrada em vigor da nova série: https://www.imt-ip.pt/noticias/comunicado-de-imprensa-novas-matriculas/
- Diário da República — Decreto-Lei n.º 2/2020: https://diariodarepublica.pt/dr/detalhe/decreto-lei/2-2020-128071719

## Limites de execução

A alteração é proposta numa ramificação de correção separada. Não foi aplicada ao projeto Supabase de produção, não foram alterados dados nem permissões, e o motor de consulta ASF permanece intocado.
