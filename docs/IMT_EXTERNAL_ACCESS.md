# Acesso externo autorizado ao IMT/RNSI a partir do VÉRIX

## Objetivo

Permitir que um utilizador GNR devidamente autorizado consulte, a partir de um computador fora da rede interna, os mesmos dois tipos de informação usados no fluxo operacional do VÉRIX:

- última ficha de inspeção;
- livrete / características técnicas do veículo.

O objetivo é acesso remoto controlado ao serviço oficial, não disponibilizar a base de dados de veículos ao público em geral.

## Conclusão da investigação

Os endereços atualmente utilizados pelo fluxo legado pertencem a um domínio interno `rnsi.local`. Isto é compatível com um serviço que depende de DNS e conectividade da rede institucional. O browser público ou uma função de backend na Internet não ganha acesso a essa rede apenas por conhecer o URL.

Não foi identificada, na investigação de fontes públicas, uma API pública documentada que substitua diretamente as duas consultas operacionais com os mesmos campos e histórico. O IMT Online disponibiliza pedidos documentais, incluindo certidões e histórico de inspeções, mas não é equivalente a uma consulta operacional gratuita em tempo real.

O artigo 31.º do Decreto-Lei n.º 128/2006, na redação republicada pelo Decreto-Lei n.º 152-A/2017, contempla o acesso das entidades fiscalizadoras por linha de transmissão, e prevê condições para acesso por outras entidades. A autorização jurídica e técnica concreta para acesso fora da RNSI deve ser confirmada pelo IMT e pela GNR/SGMAI antes de disponibilizar o serviço.

## Opções a avaliar, por ordem de preferência

### A. Serviço oficial disponibilizado pelo IMT

Solicitar ao IMT uma API/web service institucional, ou uma interface oficial de acesso remoto, com autenticação de utilizadores/entidades, contrato de dados, quotas, auditoria e condições de utilização. É a opção preferível porque o proprietário do sistema controla a fronteira de acesso.

### B. Gateway institucional aprovado

Se o IMT não disponibilizar diretamente o serviço externo, a GNR/SGMAI e o IMT podem avaliar uma gateway de aplicação aprovada, ligada aos sistemas internos por conectividade institucional autorizada. A gateway deve expor apenas duas operações tipadas, sem permitir escolher livremente host, URL ou caminho.

Fluxo lógico:

`PC externo -> VÉRIX (sessão autenticada) -> API gateway aprovada -> ligação privada/autorizada -> serviço oficial IMT/RNSI`

A localização da gateway e o percurso de rede têm de ser aprovados pelos responsáveis técnicos e de segurança. Não se deve expor diretamente o serviço interno à Internet nem criar um túnel informal a partir de um PC de utilizador.

### C. Acesso remoto institucional ao posto/dispositivo

Se já existir solução GNR de acesso remoto a equipamento gerido, esta pode ser uma solução transitória para utilizadores e equipamentos aprovados. Não deve ser presumido que um PC pessoal está autorizado a entrar na RNSI.

## Requisitos mínimos de segurança

1. **Autorização e finalidade:** confirmação formal de que os utilizadores, finalidades e campos consultados estão abrangidos.
2. **Identidade individual:** não usar uma credencial partilhada embutida na aplicação. Integrar o mecanismo de identidade aprovado pela GNR/SGMAI, com MFA quando aplicável.
3. **Autorização por utilizador e equipamento:** bloquear utilizadores sem perfil autorizado; avaliar conformidade/gestão do dispositivo para acesso a partir de PCs externos.
4. **Segredos no servidor:** credenciais técnicas e certificados nunca no HTML/JavaScript, em parâmetros URL, no bundle ou no repositório Git.
5. **API fechada:** duas operações explícitas (inspeção e características); nunca aceitar um URL arbitrário fornecido pelo cliente.
6. **Ligação protegida:** TLS no percurso público, autenticação forte entre serviços e conectividade privada/institucional aprovada no percurso até à RNSI.
7. **Auditoria proporcional:** registar utilizador, timestamp, operação, resultado e finalidade quando exigida. Definir com o responsável pelo tratamento se a matrícula deve ser retida, mascarada ou transformada nos logs e durante quanto tempo.
8. **Minimização:** devolver apenas os campos autorizados, não guardar respostas oficiais no browser/backend sem necessidade aprovada e não enviar resultados à telemetria geral.
9. **Defesa da aplicação:** rate limit por utilizador, timeout, limites de resposta, proteção contra repetição, alertas de abuso, gestão de chaves e plano de revogação.
10. **Sem contornos:** não desativar segurança do Chromium, não criar proxy aberto, não reutilizar credenciais extraídas de URLs e não contornar VPN, firewall, autenticação ou segmentação de rede.

## Impacto na arquitetura VÉRIX

- O cliente VÉRIX deverá chamar uma API estreita e autenticada; não deve comunicar diretamente com o host interno.
- A gateway deverá validar identidade e autorização a cada pedido, e não confiar apenas no facto de a origem ser o domínio público do VÉRIX.
- Os resultados oficiais devem ser apresentados com origem, momento da consulta e estado inequívoco (sucesso, sem registo, indisponível, não autorizado).
- Os erros de conectividade externa devem ser diferenciados de respostas oficiais sem dados.
- A telemetria de utilização não deverá registar conteúdo de inspeções nem devolver dados do IMT ao painel de analytics.
- O acesso por computador externo deve permanecer desativado por defeito até existir um fluxo de autenticação e autorização aprovado.

## Plano de implementação com pontos de controlo

### Fase 0 — Aprovação institucional

Pedir à DCSI/estrutura técnica competente da GNR e à SGMAI/RNSI confirmação da conectividade admissível e ao IMT confirmação do serviço/interface autorizado, campos e perfis. Definir formalmente se são permitidos PCs não geridos ou se apenas dispositivos aprovados podem aceder.

### Fase 1 — Contrato técnico

Obter endpoint/documentação oficial, autenticação suportada, esquema de resposta, limites, SLA, ambiente de testes e regras de auditoria. Não construir scraping para produção sem concordância formal do IMT.

### Fase 2 — Gateway de teste

Implementar fora do runtime de produção, com autenticação, duas operações allowlisted, testes de contrato, proteção contra URL injection, timeouts, rate limits e logs sem conteúdo sensível. Usar dados de teste ou equipamento de homologação.

### Fase 3 — Validação conjunta

Testar com perfis autorizados em PC dentro da rede, PC institucional remoto e PC externo expressamente aprovado. Comparar os campos devolvidos com os ecrãs oficiais para matrículas de teste aprovadas e confirmar que nega utilizadores, dispositivos e operações não autorizados.

### Fase 4 — Publicação gradual

Só depois de autorização escrita, testes de segurança e aceitação operacional. Publicar com ativação por feature flag, monitorização, plano de rollback e procedimento de revogação imediata.

## Critérios de aceitação

- Só utilizadores autorizados conseguem consultar.
- Acesso externo é negado sem sessão válida e autorização explícita.
- Não existem credenciais ou tokens de serviço no bundle do cliente.
- O cliente não pode transformar a gateway num proxy arbitrário.
- A gateway não permite ler outros endpoints ou caminhos RNSI.
- Os resultados e erros são comparáveis aos do serviço oficial e identificam a origem.
- Todos os pedidos ficam auditáveis segundo a política aprovada.
- Nenhum dado de inspeção é enviado para analytics genéricos.
- CI e testes de segurança passam; o teste end-to-end é feito com conectividade e autorização institucional reais.

## Referências oficiais iniciais

- Decreto-Lei n.º 152-A/2017 e artigo 31.º do regulamento republicado: https://diariodarepublica.pt/dr/detalhe/decreto-lei/152-a-2017-114337012
- IMT Online: https://servicos.imt-ip.pt/
- Contactos do IMT: https://www.imt-ip.pt/contactos/
- Contexto documentado de ligações dedicadas/seguras RNSI a sistemas da Administração Pública (exemplo institucional, não especificação de acesso à consulta IMT): https://www.sg.mai.gov.pt/AdministracaoEleitoral/Autarquias/Estamos-on/Documents/2021/S%20%20SGA_AEDAE%20%20Instala%C3%A7%C3%A3o%20de%20circuitos%20de%20dados%20da%20RNSI%20nas%20CM.pdf
