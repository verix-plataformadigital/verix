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
