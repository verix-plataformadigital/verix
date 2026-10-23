# VÉRIX — Telemetria

## Arquitetura V2

`TelemetryService` separa:
- identidade;
- armazenamento local;
- fila;
- contrato de eventos;
- transporte.

A fila usa atualmente `VERIX_T2_QUEUE` e limite local de 300 eventos para manter compatibilidade com o runtime V2 atual.

## Identidade

- instalação: persistente em localStorage;
- sessão: persistente durante o contexto de sessão;
- tab: persistente durante o contexto de sessão/tab.

A identidade não é uma prova de autenticação de operador.

## Transporte

O envio normal utiliza fetch.

O envio de fim de vida pode utilizar `sendBeacon` através de `flushBeacon()`.

O caminho beacon mantém margem abaixo dos limites de payload conhecidos dos browsers.

## Garantia da fila

Um lote só é removido depois de resposta HTTP bem-sucedida.

Em erro:
- a fila permanece;
- o próximo flush pode voltar a tentar;
- flushes concorrentes são serializados.

## Eventos

Os nomes existentes da telemetria V2 foram preservados no contrato tipado.

## O que ainda não foi migrado

Ainda falta ligar esta implementação ao runtime visual:
- listeners de lifecycle;
- heartbeat automático;
- retry scheduler/backoff;
- diagnóstico completo do cliente;
- wrappers temporários de funções legacy;
- integração de produção.

Isto é intencional: estes elementos serão migrados depois de os contratos puros estarem validados.
