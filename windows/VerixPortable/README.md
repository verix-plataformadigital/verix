# VÉRIX Portable

Shell Windows portátil baseado em Microsoft WebView2.

Segurança:
- DevTools desativados.
- Menus de contexto desativados.
- Downloads cancelados.
- Host objects não expostos à página.
- Navegação interna limitada ao domínio de produção https://verix-plataformadigital.github.io/verix/.
- Ligações para serviços externos oficiais (ASF, ERRU/IMT, INEM e Waze) são abertas no navegador predefinido; restantes destinos são bloqueados.
- A autorização continua a ser feita pelo backend; o EXE não contém segredos de servidor.

Compilação:
dotnet publish .\VerixPortable.csproj -c Release -r win-x64 --self-contained true

O Microsoft Edge WebView2 Runtime deve existir no PC ou ser distribuído através do mecanismo Fixed Version apropriado para uma release totalmente portátil.


## V2 local package

A futura release portátil da V2 poderá incluir a pasta `dist-v2` junto ao executável e servir os assets locais através de WebView2 virtual host mapping. Isto evita `file://` e fornece uma origem HTTPS local apropriada para `localStorage`, IndexedDB e APIs de secure context.

Esta capacidade ainda não é o modo predefinido. A produção continua a abrir o site HTTPS oficial até a V2 passar a validação funcional completa.
