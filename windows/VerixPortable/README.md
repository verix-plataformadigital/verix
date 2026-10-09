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

Compilação a partir da raiz do repositório:
```powershell
npm ci
npm run build:v2
dotnet restore .\windows\VerixPortable\VerixPortable.csproj
dotnet publish .\windows\VerixPortable\VerixPortable.csproj -c Release -r win-x64 --self-contained true --no-restore
```

O Microsoft Edge WebView2 Runtime tem de existir no PC; o executável .NET é self-contained, mas isso não inclui o runtime do WebView2.

## Modos de execução

- `VERIX.exe`: mantém o arranque de produção em `https://verix-plataformadigital.github.io/verix/`.
- `Run-V2-Local.cmd`: abre a V2 compilada e incluída em `v2-assets\`, sem substituir o arranque de produção.

O modo local só é ativado pelo argumento `--v2-local`. O host verifica que `v2-assets\index.html` existe, usa `SetVirtualHostNameToFolderMapping` em vez de `file://`, limita a navegação principal à entrada local e continua a bloquear novas janelas não iniciadas pelo utilizador, downloads, frames externos e destinos fora das allowlists.

A V2 local usa, apenas dentro da instância WebView2, a origem já autorizada pelo backend para evitar alterar a política CORS de produção. A navegação fica limitada à raiz/entrada `index.html` mapeada; os assets são servidos do pacote local. O hash do HTML é acrescentado ao URL para evitar reutilizar uma entrada HTML em cache após atualizar o pacote.
