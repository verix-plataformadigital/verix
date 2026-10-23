# VÉRIX — Gate

## Contrato

A aplicação envia ao `verix-gate-v1`:
- build_id;
- installation_id;
- session_id;
- tab_id.

O backend devolve um token curto assinado.

## V2

`GateService`:
- obtém o token sob demanda;
- guarda-o apenas em memória;
- usa margem de renovação de 30 s;
- evita pedidos concorrentes duplicados com single-flight;
- limpa o token quando o relay o recusa.

Segredos de assinatura não entram no cliente.

## Integração ASF

O `AsfService` usa o `GateService` para obter autorização. A UI não deve conhecer a mecânica do token.
