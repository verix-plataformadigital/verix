# VÉRIX — Pesquisa técnica externa (2026-10-08)

## Fontes consultadas

### Web platform
- MDN — `RequestInit.keepalive`: corpo de pedidos keepalive limitado a 64 KiB.
- MDN — `Navigator.sendBeacon()`: destinado a analytics/diagnóstico e limitado a 64 KiB de dados enfileirados.
- MDN — `Navigator.onLine`: heurística do browser e não prova de acesso à Internet/um site específico.
- MDN — Trusted Types / DOM XSS: `innerHTML`, `outerHTML` e `insertAdjacentHTML` são sinks de injeção; preferir `textContent`, criação de nós ou Trusted Types.
- OWASP — CSP/DOM XSS: remover handlers inline e controlar sinks.

### Vite
- Documentação Vite — `root` define o projeto servido/construído; `base: "./"` é apropriado para deployments embebidos/relativos.
- O bundle V2 não depende de polyfills implícitos; compatibilidade deve ser definida por target e feature detection.

### WebView2
- Microsoft Learn — WebView2 Performance: reduzir payload inicial, adiar componentes pesados e utilizar caching/service workers quando apropriado.
- Microsoft Learn — WebView2 Security: tratar conteúdo web como não confiável e validar a origem antes de operações privilegiadas.
- Microsoft Learn — Local Content: `file://` limita APIs de contexto seguro e partilha de origem; virtual host mapping permite origem HTTP/HTTPS local e APIs de secure context.
- Microsoft Learn — Distribution: Evergreen é recomendado para a maioria das aplicações; Fixed Version dá controlo de versão mas adiciona grande volume ao pacote.
- Microsoft Learn — CoreWebView2Settings: autofill, browser accelerator keys, web messages, host objects e DevTools podem ser desativados.

## Decisões VÉRIX resultantes

1. A contagem "online" não usa `navigator.onLine`; depende da atividade observada no servidor e de TTL.
2. Telemetria normal usa fetch; beacon é reservado para fim de ciclo de vida.
3. Não existe limite artificial de 64 KiB no fetch normal; a margem aplica-se ao beacon.
4. V2 não usa `innerHTML` próprio e o CI impede novos sinks HTML.
5. A shell V2 não usa handlers inline; CSP restritiva é aplicada no HTML estático.
6. O host Windows valida host, esquema, porta e prefixo de path.
7. A origem local via virtual host mapping será considerada numa etapa posterior para o modo portátil offline; não é ativada sem uma estratégia de distribuição dos assets.
8. Service Worker fica adiado até existir política de atualização/cache que não possa servir uma build obsoleta.

## Fontes oficiais
- https://developer.mozilla.org/en-US/docs/Web/API/RequestInit
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
- https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API
- https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/working-with-local-content
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- https://vite.dev/guide/build


### Popup / janela externa RNSI — 2026-10-08
- MDN documenta que `window.open(url, target, "noopener")` devolve `null` por especificação, mesmo quando a nova janela é aberta. Por isso, não se deve usar esse retorno para diagnosticar bloqueio de pop-up.
- A aplicação V2 mantém `Referrer-Policy: no-referrer` no documento e o adaptador IMT abre a janela com retorno verificável, anulando imediatamente `opened.opener` antes de a página externa terminar de carregar.
- MDN também assinala que os browsers modernos exigem ativação do utilizador para cada nova janela. A V2 mantém botões individuais de inspeção/livrete como caminho explícito de recuperação quando o browser/host bloquear uma das aberturas automáticas.
- Referências: https://developer.mozilla.org/en-US/docs/Web/API/Window/open e https://developer.mozilla.org/en-US/docs/Web/Glossary/Transient_activation.
