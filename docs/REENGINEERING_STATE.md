# VÉRIX — Estado da Reengenharia

## Estado atual

Branch de trabalho: `reengineering-v2`

Pull Request de trabalho: #33 (draft)

A produção atual permanece intocada. Esta branch é a área de engenharia da VÉRIX 2.

## Head atual

Commit de referência desta sessão: `c84566831821822eac92186617b0bea3f06ad3c9`

## Decisões técnicas atuais

- Não fazer uma conversão mecânica de HTML para TypeScript.
- Direção tecnológica: TypeScript + Vite + DOM nativo, sem framework de UI por defeito.
- TypeScript 7.0.2.
- Vite 8.3.3.
- Vitest 4.1.9.
- Node 22 continua a ser o runtime de build.
- TypeScript usa modo estrito e verificações adicionais contra código não utilizado e acessos potencialmente indefinidos.
- O contrato operacional ASF deve ser preservado antes de qualquer otimização.
- Telemetria e presença são áreas críticas.
- A aplicação final deve continuar distribuível sem Node/Python/Docker no cliente.
- O resultado deve continuar a ser uma única aplicação responsiva, não uma aplicação mobile separada.
- Vite V2 é paralelo nesta fase; o build de produção legado continua em `build:legacy` e `build`.

## Pesquisa técnica realizada

- Vite 8 é a geração atual relevante e usa Rolldown como bundler unificado; Vite 8.1 acrescenta melhorias de build/dev para aplicações grandes.
- TypeScript 7.0.2 é atualmente a versão estável publicada; o projeto adotará a linha 7.x.
- TypeScript recomenda `strict: true`; a V2 adiciona verificações complementares apropriadas ao objetivo de manutenção.
- Supabase distingue chaves publishable/anon de chaves secret/service-role; segredos permanecem exclusivamente nas Edge Functions.
- `navigator.onLine` é tratado como sinal auxiliar, não como prova de que o backend está acessível.
- OWASP recomenda tratar dados do cliente, respostas de API e storage do browser como não confiáveis e ter cuidado especial com sinks como `innerHTML`.

## Trabalho executado

1. Criada branch isolada `reengineering-v2`.
2. Criada PR draft #33 contra `main`.
3. Criada fundação TypeScript estrita.
4. Adicionado Vite como build paralelo de V2.
5. Adicionado Vitest para testes de caracterização.
6. Criado primeiro conjunto de tipos e serviços independentes:
   - Result
   - Connectivity
   - HTTP client
   - validação de entradas ASF
   - contrato ASF
7. Mantido o build legado como `build:legacy` e preservado o `build` atual.
8. Criada ferramenta `tools/audit-repository.mjs` para inventário estático do repositório inteiro no runner do GitHub.
9. Criada pipeline `.github/workflows/reengineering-v2.yml` para:
   - instalar dependências
   - typecheck
   - testes
   - auditoria estática da árvore
   - build V2
   - rejeitar source maps
   - publicar o relatório de auditoria como artifact.
10. Criado este checkpoint para continuidade entre sessões.

## Observações críticas já verificadas

- O runtime ASF atual está atrás de `asf-proxy-v1`, com validação de BUILD_ID, token de cliente, installationId, matrícula/data e timeout de 15 s.
- O sistema de presença corrente usa `last_seen`; existem índices específicos em `verix2_installations` e `verix2_sessions`.
- `verix-mobile.html` atua atualmente como entrada de compatibilidade e redireciona para `verix-app.html`; a direção V2 continua a ser uma única aplicação responsiva.
- O build seguro atual usa perfil conservador para partes críticas do runtime legado.
- O repositório contém mecanismos de segurança e CI que devem ser preservados e melhorados, não substituídos cegamente.

## Próxima sequência obrigatória

1. Obter e estudar o relatório integral da auditoria do runner.
2. Fechar o inventário de funções, listeners, globals, HTML sinks, endpoints, RPCs e duplicações.
3. Mapear o grafo de dependências do runtime operacional.
4. Extrair contratos puros e adapters sem alterar comportamento.
5. Criar testes de caracterização específicos para ASF/IMT/telemetria/online/admin.
6. Migrar progressivamente os módulos para `src/`.
7. Só depois integrar a nova UI V2 com a aparência atual.
8. Reconstruir mobile a partir do layout responsivo em vez de patches genéricos.
9. Separar definitivamente código de domínio, infraestrutura, UI e observabilidade.
10. Migrar o admin quando a análise demonstrar benefício real.
11. Comparar builds e fluxos antigo/novo.
12. Só depois planear o corte de produção e remoção do legado.

## Regra de segurança

Nada nesta branch deve ser considerado produção até passar testes de regressão e comparação com o comportamento atual.

## Regra contra falsa conclusão

“Compilou” não significa “funciona”.
“Não encontrei referência” não significa “é código morto”.
“Está mais moderno” não significa “está melhor”.

## Nota para continuação

Ao abrir uma nova sessão, ler primeiro:
- `docs/REENGINEERING_STATE.md`
- `ARCHITECTURE.md`
- `SECURITY.md`
- `package.json`
- `verix-app.html`

Depois continuar na branch `reengineering-v2` / PR #33.
