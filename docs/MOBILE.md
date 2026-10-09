# VÉRIX — Mobile e tablets

## Princípio

Uma aplicação VÉRIX única para desktop, tablets e telemóveis. Não criar HTML funcional duplicado para mobile. O verix-mobile.html continua a ser uma entrada de compatibilidade do runtime legado; a V2 deve obter o comportamento adaptativo sobretudo através de CSS e estrutura semântica.

## Comportamento V2 implementado nesta tranche

- Até 1024 px, a navegação deixa de ocupar uma coluna lateral estreita e passa para uma faixa horizontal com scroll próprio.
- Em telemóveis, a navegação mostra ícone e rótulo compacto; os destinos continuam a ser os mesmos e não são removidos.
- Formulários de consulta e cinemómetro passam a uma coluna em ecrãs estreitos; tablets mantêm duas colunas quando há espaço suficiente.
- As tabelas de zonas/vias e álcool têm áreas de scroll horizontal dedicadas, sem exigir scroll horizontal da página inteira.
- A região da tabela de zonas/vias é focável pelo teclado e tem um nome acessível.
- Os campos de edição em ecrãs pequenos usam texto de 16 px para evitar o zoom automático típico do Safari iOS ao focar inputs.
- Controlos usados frequentemente em touch têm alvos de pelo menos 44 px.
- São respeitadas as áreas seguras do ecrã, o viewport dinâmico dvh e a preferência de sistema para reduzir animações.
- Os utilizadores continuam a poder ampliar a página com zoom do browser; não desativar o zoom através de user-scalable=no ou maximum-scale=1.

## Matriz de validação manual obrigatória

Os testes automatizados verificam contratos e estrutura, mas não substituem testes visuais em navegadores reais. Antes de declarar a tranche mobile aprovada, verificar pelo menos:

| Ambiente / viewport CSS aproximado | Verificações |
|---|---|
| 320 × 568 e 360 × 800, retrato | Sem overflow horizontal global; navegação desliza; formulários e botões acessíveis; teclado virtual não cobre o campo ativo |
| 390 × 844, retrato | Consulta ASF, histórico, Legislação, Cinemómetro e Ferramentas |
| 844 × 390, paisagem | Header não consome espaço excessivo; a área principal continua a deslocar-se verticalmente |
| 768 × 1024, tablet retrato | Navegação acessível, formulários em duas colunas quando legíveis, tabelas com scroll local |
| 1024 × 768, tablet/paisagem | Layout sem sidebar esmagada nem conteúdo cortado |
| Android Chrome e iOS Safari | Foco dos campos, zoom, clipboard, scroll das tabelas e safe-area |
| WebView2 Windows | Navegação, redimensionamento da janela, zoom e scroll; verificar separadamente a janela interna RNSI numa rede autorizada |

Registar os resultados reais por dispositivo/browser e corrigir os problemas antes do cutover. A validação em equipamento operacional continua pendente.

## Princípios de implementação

- CSS responsivo com breakpoints guiados pela largura disponível, não por nomes de dispositivos.
- Scroll horizontal apenas nos componentes que realmente precisam dele, por exemplo navegação e tabelas.
- Eventos semânticos (click, formulários e controlos nativos) em vez de handlers exclusivos de rato.
- Alvos touch confortáveis, foco visível, movimento reduzido e possibilidade de zoom.
- Não alterar lógica ASF, IMT/RNSI, telemetria ou regras operacionais para resolver problemas de apresentação.
