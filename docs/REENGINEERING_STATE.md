# VÉRIX — Estado da Reengenharia

## Estado atual

Branch de trabalho: `reengineering-v2`

A produção atual permanece intocada. Esta branch é a área de engenharia da VÉRIX 2.

## Decisões já tomadas

- Não fazer uma conversão mecânica de HTML para TypeScript.
- Direção tecnológica atual: TypeScript + Vite + DOM nativo, sem framework de UI por defeito.
- TypeScript 7.0.2.
- Vite 8.3.3.
- Vitest 4.1.9.
- Node 22 continua a ser o runtime de build.
- O contrato operacional ASF deve ser preservado antes de qualquer otimização.
- Telemetria e presença são áreas críticas.
- A aplicação final deve continuar distribuível sem Node/Python/Docker no cliente.
- O resultado deve continuar a ser uma única aplicação responsiva, não uma aplicação mobile separada.

## Trabalho já executado

1. Criada branch isolada `reengineering-v2`.
2. Criada fundação TypeScript estrita.
3. Adicionado Vite como build paralelo de V2.
4. Adicionado Vitest para testes de caracterização.
5. Criado primeiro conjunto de tipos e serviços independentes:
   - Result
   - Connectivity
   - HTTP client
   - validação de entradas ASF
   - contrato ASF
6. Mantido o build legado como `build:legacy` e preservado o `build` atual.
7. Criado este ficheiro para servir de checkpoint persistente entre sessões/chats.

## Próxima sequência obrigatória

1. Inventário integral da árvore do repositório.
2. Mapa de dependências do runtime atual.
3. Caracterização dos fluxos UI.
4. Extração progressiva do ASF.
5. Extração progressiva da telemetria.
6. Estado/presença.
7. Admin.
8. Mobile/responsive.
9. Migração visual para a nova shell.
10. Substituição progressiva do legacy.
11. Testes e comparação.
12. Corte de produção apenas após validação.

## Regra de segurança

Nada nesta branch deve ser considerado produção até passar os testes de regressão e a comparação com o comportamento atual.

## Nota para continuação

Ao abrir uma nova sessão, ler primeiro:
- `docs/REENGINEERING_STATE.md`
- `ARCHITECTURE.md`
- `SECURITY.md`
- `package.json`
- `verix-app.html`

Depois continuar a partir da branch `reengineering-v2`.
