# Fonte operacional modular

`blocks.json` define a ordem real dos módulos; a ordem de execução não é alfabética. `template.html` contém a estrutura HTML e os marcadores, `styles/` contém o CSS e `scripts/` contém o conteúdo dos blocos inline.

Não voltar a adicionar código operacional diretamente a `verix-app.html`. Adicionar o módulo e a entrada correspondente no manifesto e executar os testes e o build. Os scripts permanecem clássicos no artefacto portátil porque partilham estado e funções globais; a conversão para ES modules exige uma etapa separada de decomposição lógica e testes de regressão.
