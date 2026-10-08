# Presença VÉRIX

## Regra operacional V2

O VÉRIX considera uma instalação **online** quando existe atividade observada pelo servidor com `last_seen` estritamente dentro dos últimos 5 minutos.

A regra é:

`0 <= now - last_seen < 5 min`

O valor é uma propriedade da presença observada no servidor. `navigator.onLine` é apenas um sinal auxiliar para UX e nunca decide o contador do admin.

### Consequências

- duas tabs da mesma instalação continuam a representar uma instalação online;
- sessões diferentes da mesma instalação são deduplicadas no contador de instalações;
- atividade exatamente no limite de 5 minutos é considerada expirada;
- atividade futura é rejeitada;
- o backend continua a ser a fonte de verdade do contador administrativo.

A função pura de referência encontra-se em `src/services/telemetry/presence-policy.ts` e é coberta por testes.
