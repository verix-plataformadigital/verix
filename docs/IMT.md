# VÉRIX — IMT

## Comportamento legado preservado

A consulta principal usa dois destinos IMT/RNSI, normalmente inspeção e livrete, em paralelo com a consulta ASF.

O carregamento é feito diretamente num iframe. Existe um mecanismo de timeout e deteção de `about:blank` para evitar que o browser apresente silenciosamente um erro de navegação.

## Regra de concorrência

Cada nova consulta recebe um número de sequência.

Se uma consulta antiga terminar depois de uma consulta mais recente ter começado, o resultado antigo não deve substituir o estado visual atual.

A V2 formaliza esta regra em `ImtSequence`.

## Migração

A camada de DOM/iframe será migrada apenas depois de:
1. caracterizar estados de carregamento;
2. caracterizar timeout;
3. caracterizar falha RNSI;
4. confirmar comportamento em HTTPS/HTTP mixed content;
5. comparar consultas concorrentes;
6. integrar a sequência tipada no adapter de DOM.


## Endereço canónico da consulta de veículo — validação pendente

Os URLs operacionais partilhados para inspeção e livrete usam `extranet.imtt.external.rnsi.local`. A configuração V2 anterior usava `consultapsp.imtt.external.rnsi.local`; os ecrãs apresentados sugerem que o painel que deveria mostrar o livrete acabou a apresentar uma listagem de inspeções. O URL builder V2 foi atualizado para o hostname dos links oficiais fornecidos, e o host Windows permite esse domínio apenas por HTTP/porta 80 e dentro de `/veiculos/`.

O hostname anterior mantém-se na allowlist restrita para compatibilidade até à verificação do ambiente real. Esta alteração está isolada na branch de reengenharia; **não prova que o endpoint de livrete agora devolve os dados esperados**. Confirmar no PC ligado à RNSI, comparando a consulta de inspeção e a consulta de livrete com as páginas oficiais para uma matrícula autorizada antes de promover a alteração.
