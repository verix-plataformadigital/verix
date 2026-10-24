# Experiência isolada — transporte ASF direto no host Windows

**Estado:** experimental; branch/PR de rascunho. Não publicado e não aplicado ao Supabase.

## Objetivo

A versão atual do proxy ASF e o motor JavaScript do VÉRIX já correspondem, nos elementos relevantes, à implementação histórica recuperada. Esta experiência testa a diferença de arquitetura que permanece: a app Android faz o pedido a partir da rede do dispositivo, enquanto o VÉRIX no browser envia-o pelo proxy Supabase, com egress centralizado.

## Alteração na experiência

No executável Windows portátil baseado em WebView2, a chamada que a página continua a dirigir ao URL habitual de `asf-proxy-v1` é intercetada localmente pelo host. O host valida origem, método, tamanho do pedido, matrícula e data; compõe a mesma operação GraphQL; e envia à ASF um `POST` com corpo vazio e a query no parâmetro `?query=`. Devolve ao cliente o estado HTTP e o corpo da ASF sem transformar erros GraphQL em “sem seguro”.

Não se acrescenta quota por minuto, intervalo mínimo, fila global, rotação de IPs, nem User-Agent forjado. O timeout de transporte é de 15 segundos, e um erro HTTP/GraphQL da ASF não é ocultado. A obtenção do token VÉRIX no cliente continua a ocorrer antes do pedido.

## O que fica intacto

- A versão publicada em GitHub Pages / HTML e os browsers Chrome/Edge fora deste executável.
- As funções Supabase `asf-proxy-v1` e `verix-gate-v1`, as tabelas e toda a telemetria.
- A UI e a lógica do parser do VÉRIX.
- O mecanismo de consultas Android; não há alteração no APK oficial.

## Limitações e verificação necessária

Esta alteração testa apenas o executável Windows portátil. **Não altera o tráfego quando o HTML é aberto diretamente no Chrome/Edge.** O build de CI comprova compilação, não comprova que a ASF devolve resultados válidos. Isso exige executar o pacote experimental num PC autorizado e comparar, com matrículas de uso autorizado, o estado HTTP, o conteúdo `errors[]`/resultado e a latência. Não se devem gerar rajadas artificiais de pedidos contra o serviço externo.

Se a ASF continuar a devolver `errors[].message = "Serviço Indisponível"` por esta via direta, a causa não é apenas o egress centralizado do Supabase. Se a via direta funcionar repetidamente e a via relay não, isso sustenta a hipótese de diferença de rede/origem; não prova a existência de um limite fixo oficial.

**Este PR não deve ser integrado nem distribuído como versão de produção sem revisão e validação funcional.**
