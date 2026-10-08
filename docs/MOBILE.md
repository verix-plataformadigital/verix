# VÉRIX — Mobile

## Princípio

Uma aplicação VÉRIX única. Não existe uma aplicação móvel separada.

O atual `verix-mobile.html` é uma entrada de compatibilidade para a aplicação principal. A V2 deverá retirar progressivamente os patches JavaScript genéricos e passar a depender de layout responsive real.

## Alvos

- Android/Chrome;
- iOS/Safari;
- tablets;
- touch e pointer events;
- teclado virtual;
- orientação;
- safe-area;
- `dvh`;
- scroll de modais;
- formulários;
- tabelas;
- menus.

## Regra

A estrutura HTML não deve ser duplicada entre desktop e mobile.

Preferir:
- CSS responsive;
- elementos semanticamente adequados;
- eventos pointer quando a mesma interação servir touch/mouse;
- JS apenas para comportamento.

A alteração visual só deve ocorrer quando corrigir um problema técnico/usabilidade/acessibilidade ou quando for necessária para o responsive.
