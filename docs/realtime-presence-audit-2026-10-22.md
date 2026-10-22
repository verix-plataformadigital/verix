# VÉRIX — Auditoria de presença e identidade (22-10-2026)

## Decisão arquitetural

O número “online” da consola administrativa passa a ser calculado no backend, através da API stats-v2 autenticada e do RPC verix2_admin_live_summary_v1. A interface deixa de depender do canal público verix-live-presence-v1 para calcular a presença operacional.

O resumo distingue:
- **Perfis de navegador online**: IDs aleatórios persistidos no localStorage do origin que têm pelo menos um contexto de página com heartbeat recente.
- **Contextos de página online**: pares distintos installation_id + tab_id com heartbeat recente. Como tab_id é criado por carregamento, um fecho abrupto só desaparece quando chega session_close ou termina a janela de validade.
- **Perfis ativos**: perfis que também emitiram uma ação operacional real nos últimos 120 segundos; abrir a aplicação ou enviar heartbeat não conta como ação.
- **Vistos na última hora**: sinal recente no histórico; não significa que a instalação continue online.

Um perfil de navegador não é equivalente a um computador físico nem a uma pessoa. Um computador com dois perfis/browser pode contar duas vezes; limpar ou copiar o armazenamento pode alterar a identidade reportada. A categoria mobile/tablet/desktop e o sistema operativo são metadados reportados pelo cliente; a categoria também depende do user agent e do tamanho da janela, não de uma leitura do hardware. Não se usa fingerprinting. A identificação rigorosa de pessoas exige autenticação institucional; um inventário fiável de computadores exige enrollment explícito e uma identidade de equipamento gerida.

## Evidência observada no projeto

### 1. Limite de Realtime Presence

A documentação oficial da Supabase descreve um limite predefinido de cinco atualizações Presence por cliente em 30 segundos; track() e untrack() contam para esse limite e o canal é fechado quando o excede. A implementação anterior deixava eventos de clique/submissão forçarem atualizações a cada 2,5 segundos. Fontes:
- https://supabase.com/kb/troubleshooting/realtime-client-presence-rate-limit-reached
- https://supabase.com/docs/guides/realtime/presence
- https://supabase.com/docs/guides/realtime/limits

A solução do PR elimina o bypass de 2,5 segundos, remove o cliente Presence público do bundle publicado e obtém os números a partir de heartbeats aceites pelo servidor.

### 2. Heartbeats antigos em fila

Consulta read-only à base de dados em 22-10-2026:
- 23 220 eventos de ciclo de vida (app_open, heartbeat, session_close) recebidos nas últimas 24 horas;
- 8 414 desses eventos tinham uma diferença entre created_at (receção no servidor) e occurred_at (relógio do cliente) superior a 150 segundos;
- 12 004 chegavam com uma diferença superior a 30 segundos;
- diferença mediana aproximada: 60,4 segundos; percentil 95: cerca de 5 dias.

Este padrão confirma que o histórico pode receber sinais antigos muito depois da sua criação — compatível com filas offline/reenvios e também suscetível a relógios de cliente desalinhados. Por isso, não basta consultar last_seen ou o momento de receção isoladamente. A nova presença exige que ambos os timestamps sejam recentes. Além disso, um heartbeat ocorrido antes de session_close não pode reabrir a presença só porque foi recebido depois.

A consulta não alterou dados. Os números são uma fotografia daquela janela e não uma estatística permanente.

### 2.2 Plano de execução (read-only)

O plano do SELECT principal foi medido com EXPLAIN ANALYZE na base de produção, sem executar INSERT/UPDATE/DDL: ~0,63 ms para obter as contagens de presença e ~0,86 ms para a variante que também materializa as ações recentes. Foram usados poucos blocos de cache (13 e 35, respetivamente), e a leitura do heartbeat usou os índices temporais existentes. Estes valores são fotografias de uma execução, não garantias de latência sob concorrência/carga. Por agora, não há justificação para adicionar índices antes de medir com mais sessões ativas.

### 2.1 Validação do SQL proposto em modo read-only

O corpo SELECT do RPC proposto foi executado diretamente sobre os dados atuais, substituindo apenas o parâmetro p_now por clock_timestamp(); a migração não foi aplicada e não foi criada nem substituída nenhuma função na base de dados. Fotografia em 2026-10-22 07:31:07 UTC:
- 7 perfis de navegador online;
- 7 contextos de separador online;
- 3 perfis com ações operacionais reais nos últimos 120 segundos;
- 1 622 IDs de instalação registados na tabela histórica;
- 12 perfis com sinal na última hora e 6 instalações com consulta de veículo nessa janela.

Os números são a saída da consulta candidata, não o painel de produção; só passam a refletir o painel após revisão, merge e aplicação controlada da migração.

Um EXPLAIN ANALYZE read-only sobre o corpo completo da consulta, na mesma base de dados, terminou em aproximadamente 68,2 ms (planeamento ~5,7 ms; 566 buffers partilhados em cache). Nesse instante, a consulta encontrou 8 contextos de página e 3 perfis ativos. Isto é uma medição pontual, não um benchmark de carga concorrente.

Foi também executada uma simulação SQL com três sequências de eventos:
- heartbeat ocorrido antes de session_close, mas recebido depois: **offline**, apesar de a regra antiga baseada apenas no instante de receção o considerar online;
- heartbeat novo, ocorrido depois de session_close: **online**;
- app_open recente sem fecho: **online**.


### 3. Endpoint legado de telemetria

Na janela móvel de 24 horas consultada às 07:39:47 UTC, os logs registavam **14 412 chamadas OPTIONS** a /functions/v1/telemetry, todas com HTTP 404 e com `execution_id` vazio. A agregação apresentava um único valor de IP encaminhado e três variantes de User-Agent (Chrome/Windows e Edge/Windows), entre 21 e 22 de outubro. Em todas estas linhas faltavam Origin, Referer e Access-Control-Request-Method; o tráfego não tinha a forma habitual de um preflight CORS de browser. A documentação da Supabase explica que `execution_id` vazio em respostas 404 é consistente com `FUNCTION_NOT_FOUND` (nome de função não reconhecido), antes da execução do código da Edge Function:
- https://supabase.com/docs/guides/troubleshooting/edge-function-404-error-response

O código-fonte principal atual só referencia /functions/v1/telemetry-v2; o service worker atual não reescreve pedidos de telemetria. Apesar do padrão ser compatível com um cliente/script antigo ou uma ferramenta a repetir pedidos ao endpoint removido, os logs, por si só, não permitem atribuir a origem a uma versão específica, extensão, scanner ou serviço. Não criar um alias para o endpoint antigo antes de identificar a origem.

### 4. Identidade de separador

O MDN documenta que sessionStorage pode ser copiado inicialmente para uma nova janela que tenha opener; o comportamento de duplicação de separadores também é reportado em Chromium. Isso significa que uma chave guardada em sessionStorage não deve ser assumida como sempre única entre separadores duplicados:
- https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage
- https://github.com/mdn/content/issues/3688
- https://stackoverflow.com/questions/21463696/duplicate-tab-copying-sessionstorage-in-chrome

O cliente mantém o session_id de análise no sessionStorage para que um recarregamento não crie artificialmente uma nova sessão; esse ID pode ser copiado quando um separador é duplicado. Em contrapartida, tab_id é gerado por cada contexto de página e não é persistido no sessionStorage. O runtime de segurança e o runtime de telemetria usam o mesmo par de IDs emitido na página. A presença agrupa os contextos por installation_id + tab_id, em vez de contar session_id como se provasse um separador físico. Assim, os separadores duplicados não colapsam na contagem online, mantendo a continuidade das métricas analíticas de sessão.

## Estado e limites de segurança

- A consulta administrativa é executada pela função stats-v2; o RPC de resumo tem permissão de execução apenas para service_role no estado atual da base de dados.
- Não foram aplicadas migrações, publicadas Edge Functions, alteradas tabelas históricas ou alterado o motor ASF durante esta auditoria.
- Os IDs aleatórios de instalação não provam identidade física ou humana. A validação do canal administrativo e as contagens não devem ser usadas como prova disciplinar ou como identificação individual.
- Um cliente web nunca pode, por si só, atestar de forma irrefutável que é um computador específico. Se o requisito evoluir para identificação nominal de utilizadores ou inventário de computadores GNR, deve ser concebido um fluxo explícito de autenticação/enrollment, com auditoria de acesso e minimização de dados.
- Não se cria um fingerprint nem se combinam metadados técnicos já recolhidos para inferir identidade física. A telemetria atual pode registar dados de diagnóstico (por exemplo, navegador/OS reportados, largura/altura da janela, resolução efetiva, número de processadores reportado ou memória estimada); estes campos não são usados para construir uma identidade de hardware e não são prova de um computador físico.

## Plano mínimo de validação antes de integrar

1. Um navegador com uma página: online = 1 perfil / 1 separador.
2. O mesmo perfil com duas páginas: online = 1 perfil / 2 contextos de página.
3. Dois perfis de navegador independentes: online = 2 perfis; não afirmar automaticamente que são dois computadores.
4. Duplicar um separador Chrome/Edge, recarregar, voltar atrás/forward-cache, fechar separador, fechar browser, suspender e acordar o computador.
5. Perda de rede com fila de telemetria; reenvio de heartbeat antigo após session_close não deve reviver presença.
6. Relógio do cliente desalinhado, localStorage limpo, diferentes origens, admin sem sessão e indisponibilidade da API.
7. Confirmar em PCs Windows reais (Chrome e Edge, incluindo o host WebView2) antes do merge/deploy.

## Links de referência adicionais

- Supabase Realtime Presence: https://supabase.com/docs/guides/realtime/presence
- Limite de eventos e relatórios Realtime: https://supabase.com/docs/guides/realtime/settings
- Firebase presença com onDisconnect e timestamp de servidor: https://firebase.google.com/docs/database/web/offline-capabilities
- W3C — mitigação de browser fingerprinting: https://www.w3.org/TR/fingerprinting-guidance/
