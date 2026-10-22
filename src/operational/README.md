# Fonte operacional modular

blocks.json define a ordem real; não é alfabética. template.html contém estrutura HTML e marcadores, styles contém CSS e scripts o conteúdo dos blocos inline.

Não voltar a adicionar código operacional diretamente a verix-app.html. Adicionar o módulo ao manifesto e executar testes e build. Os scripts permanecem clássicos no artefacto portátil porque partilham estado e funções globais; converter para ES modules exige uma etapa separada de decomposição lógica e testes.
