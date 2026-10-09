# VÉRIX — Build

## Desenvolvimento

Node 22 é o runtime de build.

Comandos V2:
- `npm run dev`
- `npm run typecheck`
- `npm test`
- `npm run build:v2`

O build V2 produz `dist-v2/`.

A pipeline Windows constrói estes assets antes de publicar o host WebView2. O pacote final contém `VERIX.exe`, `Run-V2-Local.cmd` e `v2-assets/`. O script `tools/package-windows-release.ps1` valida a pasta publicada, cria `VERIX-Windows-x64.zip`, extrai o ZIP numa pasta temporária e volta a validar o conteúdo distribuível. Também gera `VERIX-Windows-x64.zip.sha256` com SHA-256 em formato verificável por ferramentas Linux.

A CI de reengenharia valida este ZIP em cada alteração da branch V2. Ao publicar uma tag `verix-v*`, o workflow Windows publica o ZIP e o checksum nas GitHub Releases. Uma execução manual numa branch normal gera apenas um artefacto da execução; não cria uma release pública.

Para ensaio controlado:
- abrir `VERIX.exe` mantém o arranque do site de produção;
- abrir `Run-V2-Local.cmd` abre os assets V2 incluídos no próprio pacote.

O modo V2 local não faz cutover nem modifica `main`/produção. O Microsoft Edge WebView2 Runtime continua a ser um pré-requisito do equipamento.

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

`package-lock.json` está versionado e é a fonte de verdade para as dependências transitivas. Os workflows de qualidade, responsividade, segurança e publicação (GitHub Pages e Windows) usam `npm ci` com a versão de npm fixada; não devem gerar nem alterar o lockfile durante a CI.

Quando `package.json` mudar, regenerar deliberadamente o lockfile com a versão de npm fixada no projeto, rever o diff e confirmar que o build/testes passam antes de submeter a alteração. Não usar `npm install` como substituto de `npm ci` nas pipelines de validação.

## Regra de cutover

O build V2 não substitui o artefacto de produção enquanto:
- testes de regressão não passarem;
- ASF/IMT não forem comparados;
- telemetria/presença não forem validadas;
- Windows não for validado;
- análise visual não for comparada.
