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

## Dependências

A pipeline gera/valida o lockfile e instala com `npm ci`. O lockfile deve ser versionado antes do primeiro release oficial V2.

## Regra de cutover

O build V2 não substitui o artifact de produção enquanto:
- testes de regressão não passarem;
- ASF/IMT não forem comparados;
- telemetria/presença não forem validadas;
- Windows não for validado;
- análise visual não for comparada.
