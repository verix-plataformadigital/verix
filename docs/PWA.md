# VÉRIX — PWA

## Decisão atual

PWA/Service Worker fica **adiado**, não rejeitado.

### Razão

O VÉRIX é distribuído por HTTPS/GitHub Pages e, portanto, Service Worker é tecnicamente compatível com browsers modernos. Contudo, a aplicação precisa de receber rapidamente a versão publicada e o seu conteúdo operacional não deve ficar preso a uma cache antiga.

Um Service Worker também começa a operar simplesmente quando o utilizador visita a página, mesmo sem instalar a PWA. Isso aumenta a superfície de comportamento do cliente.

### Estratégia futura possível

Quando a V2 estiver estável, avaliar:
- precache apenas do shell estático versionado;
- network-first para recursos que precisam de atualização;
- nunca cachear POSTs ASF/telemetria;
- cache versionada com limpeza explícita;
- atualização controlada;
- indicador de versão/cache para diagnóstico.

### Condição para implementação

Só implementar depois de:
1. build V2 estável;
2. estratégia de cache testada;
3. Windows WebView2 validado;
4. atualização entre versões validada;
5. comportamento offline explicitamente definido.
