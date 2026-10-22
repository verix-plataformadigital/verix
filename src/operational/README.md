# Fonte operacional modular

blocks.json define a ordem real; não é alfabética. template.html contém estrutura HTML e marcadores, styles contém CSS e scripts o conteúdo dos blocos inline. O script operacional transversal foi subdividido em sete partes legíveis, concatenadas em ordem pelo build dentro da mesma tag script para não mudar o âmbito lexical.

Não voltar a adicionar código operacional diretamente a verix-app.html. Adicionar o módulo ao manifesto e executar testes e build. O maior CSS e o script do menu estão divididos em partes-fonte semânticas e concatenados em ordem no build. Isso preserva uma única tag CSS e um único bloco JS; não converter em múltiplas tags/módulos de execução sem testes de regressão.
