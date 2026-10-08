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
