# Correção ASF — cadência global (proposta isolada)

## Diagnóstico que sustenta esta alteração
- O `asf-proxy-v1` original encaminha a consulta a `https://ext01.asf.com.pt/api/src/` sem cadência server-side.
- Os registos existentes mostram GraphQL `Serviço Indisponível` dentro de HTTP 200. Por isso, um tratamento que só respeite HTTP 429 não abranda perante o erro observado.
- Na telemetria consultada, a percentagem de erros GraphQL por consulta foi de 2,07% nos minutos com 1–3 consultas, 7,37% nos minutos com 4–6 e 17,11% nos minutos com 7 ou mais. Isto é uma associação consistente, não prova isolada da causa nem confirmação oficial do limite ASF.

## Alteração proposta
1. Uma única fila PostgreSQL partilhada por todas as instalações do VÉRIX.
2. Intervalo inicial de 10 segundos entre inícios de pedidos upstream. Quando ainda não há lugar, o relay devolve de imediato um estado de espera; o cliente espera de forma assíncrona e repete a mesma consulta sem consumir uma tentativa ASF. Assim não ficam pedidos HTTP presos no relay.
3. Se a ASF devolver HTTP 429, respeitar `Retry-After` com cooldown partilhado.
4. Se o corpo GraphQL contiver erro de indisponibilidade (`Serviço Indisponível` / `service unavailable`), aplicar cooldown partilhado de 15 segundos, mesmo que o estado HTTP seja 200.
5. Erros HTTP 5xx e falhas de rede aplicam uma pausa conservadora; todos os pedidos registam a espera e os erros GraphQL sem gravar matrículas nos logs.
6. O token HMAC, validação de matrícula/data, método upstream, query GraphQL, endpoint e parser dos resultados permanecem intactos. O transporte cliente foi alterado apenas para reconhecer respostas de espera da fila e manter o timeout de cada chamada acima do timeout upstream.

## Aplicação segura
- Esta branch não está em produção.
- Aplicar primeiro a migração `supabase/migrations/20261024_asf_global_cadence.sql`.
- Publicar `asf-proxy-v1/index.ts` depois da migração.
- Confirmar no runtime que os primeiros pedidos têm `X-Verix-ASF-Queue-Wait-Ms`, que não existem rejeições depois de seis consultas e que os erros `Serviço Indisponível` provocam cooldown global.
- Testar uma matrícula com seguro conhecido, uma sem registo conhecido e várias consultas consecutivas; comparar resultados reais (não apenas HTTP 200).
- Reverter a função para o commit baseline `fda0657b182544eeb4ba22569e1040851078837c` e executar os comandos de rollback documentados no cabeçalho da migração para abandonar a cadência.

## Limitações
Não foi possível, nesta execução, realizar consultas funcionais à ASF a partir de uma sessão de teste. A cadência de 10 segundos é uma hipótese operacional apoiada pelos registos e no aviso da aplicação de aproximadamente seis consultas/minuto; não é apresentada como documentação oficial confirmada da ASF. A implementação deve permanecer num PR draft até aos testes.
