# VÉRIX — Build

## Desenvolvimento

Node 22 é o runtime de build.

Comandos V2:
- `npm run dev`
- `npm run typecheck`
- `npm test`
- `npm run build:v2`

O build V2 produz `dist-v2/`.

## Produção atual

O caminho legado continua disponível:
- `npm run build:secure`
- `npm run build:legacy`
- `npm run build`

Nenhum destes comandos deve ser removido até ao cutover validado.

## Source maps

A produção não publica source maps. O CI falha se encontrar:
- ficheiros `.map`;
- `sourceMappingURL`;
- `//# sourceURL`.

## Dependências reprodutíveis

`package-lock.json` está versionado e é a fonte de verdade para as dependências transitivas. Os workflows de qualidade, responsividade e segurança usam `npm ci`; não devem gerar nem alterar o lockfile durante a CI.

Quando `package.json` mudar, regenerar deliberadamente o lockfile com a versão de npm fixada no projeto, rever o diff e confirmar que o build/testes passam antes de submeter a alteração. Não usar `npm install` como substituto de `npm ci` nas pipelines de validação.

## Regra de cutover

O build V2 não substitui o artefacto de produção enquanto:
- testes de regressão não passarem;
- ASF/IMT não forem comparados;
- telemetria/presença não forem validadas;
- Windows não for validado;
- análise visual não for comparada.
