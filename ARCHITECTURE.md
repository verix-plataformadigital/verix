# VÉRIX — Arquitetura e manutenção

## Princípios
1. Publicar apenas o artefacto em dist; nunca editar dist manualmente.
2. O motor ASF fica congelado por defeito; o teste byte a byte com a fixture é obrigatório.
3. HTML estático de legislação fica em partials e é serializado para a mesma string durante a montagem. A fonte é modular, mas o build monta um único HTML para manter a distribuição portátil.
4. A ordem dos scripts clássicos é semântica: partilham estado e funções globais. Não os ordenar nem converter em ES modules sem testes.
5. O cliente emite eventos; telemetry-v2 ingere; verix2_* é o modelo corrente; stats-v2 e admin-telemetry-v3 têm responsabilidades separadas.
6. CORS não autentica; segredos nunca entram no cliente.
7. Não renomear nem reaplicar migrações históricas antes de reconciliar produção.

## Mapa
- index.html: entrada/roteador.
- verix-app.html: apontador de desenvolvimento, não publicar diretamente.
- src/operational/template.html: estrutura HTML e marcadores.
- src/operational/blocks.json: manifesto e ordem dos módulos.
- src/operational/styles: estilos extraídos; o maior estilo está dividido em três partes ordenadas.
- src/operational/partials/legislacao.html: marcação estática separada da lógica JavaScript.
- src/operational/scripts: scripts clássicos extraídos.
- tools/lib/operational-source.mjs: montagem do HTML-fonte.
- tools/build-secure-release.mjs: construção oficial.
- verix-mobile.js e verix-mobile.css: camada responsiva.
- verix-presence-v1.mjs: presença e SDK Supabase.
- admin_v2.html: painel administrativo.
- supabase/functions: APIs server-side.
- supabase/migrations: SQL versionado; reconciliação histórica pendente.
- windows/VerixPortable: host Windows/WebView2.

## Fluxos
Operacional: index → HTML montado → verix-gate-v1 → token → asf-proxy-v1 → ASF. A telemetria usa telemetry-v2 e tabelas verix2_*; não deve bloquear consultas.

Administração: admin_v2.html → admin-auth-v2 → token → stats-v2 para análise histórica e admin-telemetry-v3 para presença ao vivo. hourly-history-v2 mantém o histórico horário.

## Fonte e build
A extração preservou 26 blocos CSS e 34 scripts inline lógicos em 68 ficheiros-fonte físicos; o manifesto contém 60 blocos lógicos. O CSS maior divide-se em três fragmentos concatenados na mesma tag para preservar a cascata. O antigo script transversal foi repartido em sete partes semânticas que são concatenadas para voltar a gerar o mesmo bloco clássico. O helper remonta o HTML pelo manifesto e falha com marcadores ausentes/duplicados. Os comandos verify:source e test:source validam a estrutura; o build seguro gera HTML portátil.

O maior bloco JavaScript continua historicamente acoplado; a sua decomposição funcional exige mapear dependências globais e testar regressões, não apenas mover texto.

## Supabase e migrações
A configuração deve declarar as oito Edge Functions ativas. Na leitura de 22/10/2026 existiam 121 migrações aplicadas e 67 ficheiros SQL no repositório. Não executar DROP, reset ou reaplicação em lote. Comparar funções, tabelas, índices, triggers, grants e RLS antes de criar uma baseline reconciliada.

## Gate de publicação
1. Testes da fonte.
2. Integridade da telemetria e ASF byte a byte.
3. Build seguro e validação estrutural.
4. CI verde.
5. Aceitação real de ASF, IMT e painel administrativo em PCs Windows.
