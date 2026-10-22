# VÉRIX — Checklist de aceitação Windows

**Candidato:** PR #156 — `refactor/modular-operational-source-2026-10-22`  
**Objetivo:** confirmar o comportamento real da compilação portátil antes de integrar/publicar.  
**Regra de segurança:** esta checklist não autoriza alterar o motor ASF, a base de dados nem a versão oficial em produção.

## 1. Preparar e identificar o candidato

**Artefacto de aceitação já produzido no Windows CI:** [GitHub Actions run #6](https://github.com/verix-plataformadigital/verix/actions/runs/39775385290) → artefacto `VERIX-Windows-Acceptance-Candidate` (disponível até 29/10/2026, aproximadamente às 12:04 UTC).

- Commit da fonte de teste: `98c8631995c8d0b59a830ab46b66e033fb1b1a89`.
- ID de build: `1.5-sec-20261022-windows-ci` (artefacto de teste, não autorização para mudar a versão de produção).
- SHA-256 do `dist/verix-app.html` dentro do ZIP: `2c1f59835f11c80b27813ca75c2001dd9dca6fd268058a90800605acb8604395`.
- Digest SHA-256 do ZIP publicado pela GitHub Actions: `77065fa0e7313655b4b6341b716695f3617020ab32dba9641582ff038c20d974`.

Descarregar o artefacto pela execução acima, extrair para uma pasta de teste e comparar o SHA-256 do HTML com `acceptance-sha256.txt`. **Não substituir a versão oficial nem copiar para uma pasta partilhada antes de completar os testes desta checklist.**

**Bloqueio atual da aceitação ASF em staging:** o gate servidor autoriza o URL HTTPS do GitHub Pages (`https://verix-plataformadigital.github.io`) e o Workers (`https://verix.vxops.workers.dev`). Abrir este HTML por `file://` pode ser bloqueado; navegar para o URL oficial testa a versão atualmente publicada, não este candidato. Neste momento **não existe uma URL staging aprovada a servir este artefacto**, pelo que o teste ponta a ponta do candidato com ASF live ainda não foi executado. O passo seguro é preparar uma rota temporária de staging no hostname HTTPS já permitido (sem alterar o redirecionamento nem substituir a aplicação oficial), testar e retirar essa rota depois. Não adicionar `Origin: null`, `localhost` ou origens de preview diretamente ao gate de produção: isso requer revisão explícita do modelo de segurança. Até existir staging aprovado, o HTML local serve para inspeção/validação estática, não para aceitar o caminho ASF real.


- [ ] Guardar uma cópia de segurança da versão oficial atualmente utilizada.
- [ ] Obter o artefacto gerado pelo build seguro da ramificação candidata (`dist/verix-app.html`), nunca publicar diretamente o pequeno apontador `verix-app.html`.
- [ ] Registar o commit SHA e o hash SHA-256 do artefacto testado.
- [ ] Testar o candidato numa cópia/pasta separada. Não substituir a versão oficial neste passo.
- [ ] Confirmar que o teste é feito no mesmo tipo de Windows, browser e rede em que o VÉRIX é utilizado.

## 2. Consulta ASF — sem alterar o motor

Usar apenas consultas que sejam legítimas e autorizadas no contexto de teste.

- [ ] Caso de consulta que confirme “tem seguro”: resultado e mensagem visual corretos.
- [ ] Caso de “sem registo/sem seguro”: resultado correto, sem ser confundido com erro técnico.
- [ ] Erro de rede/timeout: interface recupera, informa o utilizador e não apresenta o erro como resultado negativo ASF.
- [ ] Uma consulta repetida não cria contagens duplicadas.
- [ ] No Network/DevTools, os pedidos ASF continuam no percurso habitual e não há alteração inesperada do relay.
- [ ] Confirmar que a instrumentação de diagnóstico não persiste a resposta ASF bruta, tokens, headers ou body.

**Condição de aprovação:** comportamento funcional equivalente à versão estável nos três cenários; não aceitar uma simples passagem do build como prova suficiente.

## 3. IMT, histórico e interface

- [ ] A consulta IMT carrega inspeção e livrete/documento esperado.
- [ ] A sequência de consultas não troca resultados de duas matrículas diferentes.
- [ ] Abrir uma entrada do histórico e retomar a consulta funciona.
- [ ] A disposição/zoom de inspeção e livrete continua utilizável.
- [ ] A pesquisa não deixa teclado/overlay aberto nem bloqueia os controlos.
- [ ] Sem erros JavaScript novos na consola; anotar qualquer erro que já exista na versão estável para comparação.

## 4. Telemetria

- [ ] Abrir o candidato e confirmar um pedido de ingestão para `/functions/v1/telemetry-v2`.
- [ ] Confirmar que os pedidos de ingestão válidos respondem 2xx e que os eventos são reconhecidos pelo contrato do servidor.
- [ ] Confirmar que não há referência/pedido ao endpoint não versionado `/functions/v1/telemetry` produzido pelo candidato.
- [ ] Fazer uma consulta controlada e confirmar que o par de eventos de início/resultado corresponde a uma única consulta no painel.
- [ ] Desligar brevemente a rede e voltar a ligá-la: validar comportamento da fila/repetição sem duplicados.
- [ ] Separar requests HTTP/preflight de eventos aceites; não interpretar `OPTIONS` como consulta operacional.

## 5. Painel Admin e segurança

- [ ] Entrar pela página Admin oficial de teste; não copiar nem partilhar o token de sessão.
- [ ] Confirmar que o estado da telemetria do servidor chega a “API confirmada” (ou ao estado de sucesso definido no build).
- [ ] Confirmar que os cartões online, última hora e histórico mostram unidades claramente distintas (sessões, instalações, consultas).
- [ ] Comparar uma amostra dos indicadores com o resultado da RPC correspondente no Supabase, usando acesso autorizado.
- [ ] Terminar sessão e confirmar que os valores online são limpos e não permanecem apresentados como atuais.
- [ ] Confirmar que utilizador não autenticado ou token expirado não consegue obter dados Admin.

## 6. Critério de decisão

**Aprovar apenas se:**
- ASF, IMT/histórico e Admin passam todos os testes aplicáveis;
- não surgem regressões ou duplicação de telemetria;
- a função de ingestão versionada responde como esperado;
- o SHA-256 do artefacto aprovado fica registado.

**Se um teste falhar:**
1. Não publicar o candidato.
2. Guardar horário, browser, código HTTP e mensagem técnica sem copiar tokens, dados pessoais, matrícula desnecessária ou respostas ASF brutas.
3. Reproduzir na versão estável para distinguir regressão de problema preexistente.
4. Corrigir no ramo e voltar a executar os testes automáticos e esta checklist.

## 7. Pós-publicação

- [ ] Confirmar que o URL oficial serve o novo build seguro e não o ficheiro apontador de desenvolvimento.
- [ ] Confirmar a versão/build apresentado pela aplicação.
- [ ] Observar os logs por uma janela definida: ingestão `telemetry-v2` 2xx, erros de execução, latência e `OPTIONS 404` para a rota antiga.
- [ ] Se o endpoint antigo continuar a receber preflight, identificar e substituir as cópias locais antigas. Não criar um alias de compatibilidade sem prova do contrato e do emissor.
- [ ] Manter plano de rollback para o artefacto estável anterior.

**Estado em 22/10/2026:** build e validação estática Windows concluídos; aceitação interativa em PC Windows real pendente. Falta disponibilizar o candidato num staging HTTPS permitido pelo gate sem substituir o site de produção, e só depois executar ASF/IMT/Admin.
