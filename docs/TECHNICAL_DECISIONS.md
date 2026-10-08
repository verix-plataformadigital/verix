# VÉRIX — Decisões Técnicas

## TypeScript

Escolhido para a V2 porque o projeto precisa de contratos explícitos, tratamento de null/undefined, tipos de respostas externas e redução de dependências implícitas. A configuração usa `strict` e verificações adicionais de código morto e acessos potencialmente indefinidos.

## Vite

Escolhido como camada de build da V2. A produção atual continua no construtor legado até a migração terminar. V2 usa `base: "./"` para manter o artefacto compatível com distribuição estática simples.

## UI

Não foi adotado React/Vue/Svelte como requisito arquitetural. A V2 começará com DOM nativo e módulos ES. Componentes de Web Components poderão ser introduzidos onde o encapsulamento trouxer benefício real.

## ASF

O ASF continua atrás de serviço/backend. A primeira camada migrada são contratos e validações puras; o relay existente não é substituído nesta fase.

## Online/offline

`navigator.onLine` é tratado como sinal auxiliar, não como prova de disponibilidade do backend. O serviço V2 começa com probes explícitos e tipos de estados; a política final de health check será fechada depois de caracterizar os endpoints reais.

## Obfuscação

Não será usada como fronteira de segurança. A proteção real permanece no backend, tokens, autorização, RLS, minimização de dados e ausência de segredos no cliente.


## Tooling AST

TypeScript 7.0 é usado como compilador/type-checker do produto. Não é usado como parser AST pelo tooling porque a versão 7.0 não expõe a API programática antiga. Para auditoria estática, a V2 usa `oxc-parser`, que suporta JavaScript e TypeScript e devolve AST compatível com ESTree/TS-ESTree. A dependência fica restrita ao tooling e não entra no bundle do produto.
