# VÉRIX — Segurança

## Estado de confidencialidade

O repositório atual é **público**. Os ficheiros-fonte, incluindo `verix-app.html` e `admin_v2.html`, podem ser consultados e copiados. A ofuscação e o bloqueio por domínio aumentam o custo de análise, mas não tornam o código confidencial nem constituem uma fronteira de segurança.

A separação entre código-fonte privado e artefacto público exigiria uma arquitetura de repositórios distinta; não está configurada neste repositório.

## Publicação

O workflow `.github/workflows/deploy-pages.yml`:

1. Executa `npm run build:secure`.
2. Verifica estrutura HTML, marcadores críticos e ausência de source maps.
3. Publica apenas o conteúdo de `dist/` através do GitHub Pages.

A publicação do site não oculta o código-fonte guardado neste repositório público. Nunca publicar manualmente ficheiros de origem como se fossem o artefacto de produção.

## Fronteira de confiança

O browser é considerado não confiável. A autorização, a autenticação do Admin, os limites de utilização e o acesso aos serviços externos devem ser validados no servidor, incluindo através das Edge Functions Supabase. Não confiar em verificações que existam apenas no JavaScript do cliente.

## Segredos

Nunca guardar no repositório, no HTML ou no JavaScript do cliente:

- chaves Supabase de serviço;
- palavras-passe ou segredos do Admin;
- segredos usados para assinar tokens;
- credenciais ou certificados privados de serviços externos.

Guardar os segredos nos mecanismos próprios do servidor e do CI. Se um segredo for exposto, revogá-lo/rodá-lo e investigar os registos relevantes; não reproduzir o valor exposto em issues, pull requests ou mensagens de commit.

## Host Windows

O host em `windows/VerixPortable/` restringe a navegação e não deve conter segredos de servidor. O controlo de autorização continua a pertencer ao backend; o executável não substitui a validação do servidor.

## Comunicação de problemas

Não publicar credenciais nem dados operacionais sensíveis em issues públicas. Comunicar vulnerabilidades com detalhes suficientes para reproduzir o problema, mas sem expor segredos ou dados pessoais.
