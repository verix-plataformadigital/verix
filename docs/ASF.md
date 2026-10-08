# VÉRIX — ASF

## Contrato preservado na V2

A V2 não substitui o relay `asf-proxy-v1` nesta fase.

O relay atual:
- recebe POST;
- exige `x-verix-build-id`;
- exige `x-verix-client-token`;
- valida `installationId`;
- normaliza a matrícula;
- valida a data em `YYYY/MM/DD`;
- usa o endpoint ASF `https://ext01.asf.com.pt/api/src/`;
- envia a query GraphQL usada pelo runtime atual;
- tem timeout de 15 segundos;
- preserva o status HTTP do upstream;
- expõe a latência do relay;
- distingue timeout de falha de rede.

## Regra de interpretação da resposta

Uma resposta HTTP 200 não significa automaticamente “TEM SEGURO”.

A V2 separa quatro estados:
- `insured`: existe nó com licença não nula;
- `no-record`: `nodes` existe mas está vazio ou os nós não têm licença;
- `graphql-error`: o payload contém erros GraphQL;
- `invalid-response`: falta o caminho de dados esperado.

A classificação está em função pura e é coberta por testes para poder ser comparada com o comportamento operacional antes de ligar a nova camada ao relay.

## Regra de migração

Não mudar endpoint, query, cabeçalhos ou semântica de resultados na mesma alteração que extrai o serviço.

Primeiro:
1. caracterizar;
2. testar;
3. integrar atrás de adapter;
4. comparar com o legado;
5. só então substituir.
