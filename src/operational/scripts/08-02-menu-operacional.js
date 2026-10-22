// ========================= MENU OPERACIONAL =========================
const MODULES = {
 consulta: {
 title:'CONSULTA OPERACIONAL', sub:'VÉRIX // CENTRAL DE CONSULTA // ATIVO',
 html:`<div class="info-strip">CANAL PRINCIPAL DE FISCALIZAÇÃO — introduza a matrícula no terminal superior para iniciar uma consulta integrada.</div> <div class="module-grid"> <div class="module-card" onclick="fecharModulo();document.getElementById('MatriculaVeiculo').focus()"><div class="module-icon">⌕</div><h3>Nova consulta</h3><p>Focar imediatamente o campo de matrícula e iniciar uma nova verificação.</p><div class="module-status"><i></i> CANAL DISPONÍVEL</div></div> <div class="module-card" onclick="abrirHistorico();fecharModulo()"><div class="module-icon">◷</div><h3>Histórico</h3><p>Aceder às últimas 100 pesquisas guardadas localmente neste equipamento.</p><div class="module-status"><i></i> 100 REGISTOS MÁX.</div></div> <div class="module-card" onclick="toggleFullscreen()"><div class="module-icon">⛶</div><h3>Ecrã inteiro</h3><p>Expandir a consola para utilização em posto operacional.</p><div class="module-status"><i></i> CONTROLO DE ECRÃ</div></div> </div>`
 },
 ferramentas: {
 title:'FERRAMENTAS', sub:'VÉRIX // ACESSOS RÁPIDOS // SERVIÇOS EXTERNOS',
 html:`<div class="info-strip">Ferramentas externas utilizadas durante a fiscalização. Cada acesso abre o respetivo serviço numa janela separada.</div> <div class="module-grid"> <div class="module-card" onclick="fecharModulo();consultarIMTERRU()"><div class="module-icon">▤</div><h3>IMT-ERRU</h3><p>Consulta do sistema ERRU do IMT.</p><div class="module-status"><i></i> ACESSO EXTERNO</div></div> <div class="module-card" onclick="fecharModulo();consultarINEM()"><div class="module-icon">✚</div><h3>INEM</h3><p>Consulta do portal de certificados do INEM.</p><div class="module-status"><i></i> ACESSO EXTERNO</div></div> <div class="module-card" onclick="fecharModulo();consultarWAZE()"><div class="module-icon">⌁</div><h3>Waze</h3><p>Acesso ao serviço de trânsito em tempo real.</p><div class="module-status"><i></i> TRÂNSITO EM TEMPO REAL</div></div> <div class="module-card" onclick="fecharModulo();document.getElementById('MatriculaVeiculo').focus()"><div class="module-icon">▣</div><h3>Terminal matrícula</h3><p>Regressar ao terminal principal de consulta.</p><div class="module-status"><i></i> CONTROLO LOCAL</div></div> </div>`
 },
 legislacao: {
 title:'LEGISLAÇÃO', sub:'INFRAÇÕES // DESCRIÇÕES DE AUTO // CÓDIGOS',
 html: "__VERIX_PARTIAL_LEGISLATION_HTML__",
 },
 informacoes: {
 title:'INFORMAÇÕES', sub:'VÉRIX // SISTEMA DE CONSULTA VEICULAR',
 html:`<div class="info-strip">SISTEMA DE CONSULTA INTEGRADA — interface concebida para centralizar consultas utilizadas em fiscalização rodoviária.</div> <div class="module-grid"> <div class="module-card"><div class="module-icon">◎</div><h3>IMT</h3><p>Canal de consulta de inspeção e informação do veículo.</p><div class="module-status"><i></i> CANAL SEGURO</div></div> <div class="module-card"><div class="module-icon">✓</div><h3>ASF</h3><p>Consulta automática da informação de seguro automóvel.</p><div class="module-status"><i></i> CANAL DE SEGUROS</div></div>
<div class="module-card" onclick="abrirAvisoLegal()" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirAvisoLegal();}"><div class="module-icon">§</div><h3>Aviso Legal</h3><p>Informação legal, condições de utilização e limitações da aplicação.</p><div class="module-status"><i></i> CONSULTAR AVISO</div></div> </div>`
 },
 cinemometro: {
 title:'CINEMÓMETRO',
 sub:'OPERAÇÃO DE FISCALIZAÇÃO',
 html:`<div class="cin-one-screen"> <div class="cin-ema-topbar" id="cinEmaTopbar" aria-live="polite"> <div class="cin-ema-top-icon">⚠</div> <div class="cin-ema-top-label">ERRO MÁXIMO ADMISSÍVEL A APLICAR</div> <div class="cin-ema-top-value" id="cinEmaTopValor">—</div> <div class="cin-ema-top-context" id="cinEmaTopNota">Selecione o modo e a verificação.</div> </div> <section class="cin-fastbar"> <div class="cin-fast-label"> <span>VELOCIDADE REGISTADA</span> <small>Introduza apenas a velocidade de cada veículo.</small> </div> <div class="cin-fast-input"> <input id="cinRegistada" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" placeholder="000" oninput="cinVelocidadeDigitada(this)"> <b>km/h</b> </div> <div class="cin-ded-card"> <span>DEDUTIVA</span><strong id="cinDeducida">—</strong><small>km/h</small> </div> </section> <div class="cin-work-grid"> <section class="cin-result-card"> <div id="cinSemInfracao" class="cin-sem-infracao" aria-live="polite">SEM INFRAÇÃO</div> <div class="cin-card-cap">RESULTADO</div> <div class="cin-result-main"> <div class="cin-result-big"><span>VELOCIDADE DEDUZIDA</span><strong id="cinDeducida2">—</strong><small>km/h</small></div> <div class="cin-result-line"><span>EXCESSO</span><strong id="cinExcesso">—</strong><small>km/h</small></div> <div class="cin-result-line"><span>GRAVIDADE</span><strong id="cinGravidade">—</strong></div> </div> <div class="cin-code-box"><div><span>CÓDIGO</span><strong id="cinCodigo">—</strong></div><button id="cinCopiarCodigoBtn" onclick="cinCopiarCodigo()">COPIAR CÓDIGO</button></div> <div class="cin-sanctions-grid"> <div class="cin-sanction-card fine"><span>COIMA APLICÁVEL</span><strong id="cinCoima">—</strong></div> <div class="cin-sanction-card"><span>PONTOS</span><strong id="cinPontos">—</strong></div> <div class="cin-sanction-card"><span>INIBIÇÃO</span><strong id="cinInibicao">—</strong></div> <div class="cin-sanction-card legal"><span>BASE LEGAL</span><strong id="cinBaseLegal">—</strong></div> </div> <div class="cin-warning" id="cinAviso"></div> </section> <section class="cin-text-card"> <div class="cin-text-head"><span>TEXTO PARA AUTO</span><button id="cinCopiarTextoBtn" onclick="cinCopiarTexto()">COPIAR TEXTO</button></div> <textarea id="cinTexto" readonly spellcheck="false"></textarea> </section> </div> <div class="cin-action-tip">Depois de configurar o posto, introduza apenas a velocidade registada. O texto, o código e o enquadramento são atualizados automaticamente.</div> <section class="cinemometro-config-bottom cin-control-console"> <div class="cin-session-operator"> <div class="cin-session-operator-title"> <span>SESSÃO DE FISCALIZAÇÃO</span> <small>Dados da operação atual.</small> </div> <div class="cin-session-operator-fields"> <label><span>POSTO</span><input id="cinSessaoOperadorPosto" type="text" placeholder="Ex.: Guarda/Guarda-Principal/Cabo" oninput="cinAtualizarSessaoOperador()"></label> <label><span>N.º MECANOGRÁFICO</span><input id="cinSessaoOperadorNo" type="text" placeholder="Ex.: 0000000" oninput="cinAtualizarSessaoOperador()"></label> <label><span>OPERADOR</span><input id="cinSessaoOperadorNome" type="text" placeholder="Martins" oninput="cinAtualizarSessaoOperador()"></label> </div> </div> <div class="cin-operational-config-row"> <div class="cin-operational-config-label"> <strong>CONFIGURAÇÃO DA FISCALIZAÇÃO</strong> <small>Defina modo, veículo, enquadramento e limite da fiscalização.</small> </div> <div class="cin-operational-fields"> <label><span>MODO</span><select id="cinSessaoModo" onchange="cinAtualizarSessaoOperador()"> <option value="fixo">Fixo</option> <option value="movimento">Em movimento</option> <option value="perseguicao">Perseguição</option> <option value="media">Velocidade média</option> </select></label> <label><span>VEÍCULO</span><select id="cinVeiculo" onchange="cinAtualizarRegime()"> <optgroup label="AUTOMÓVEIS LIGEIROS"> <option value="ligeiro_passageiros_sem">Ligeiro passageiros / misto — sem reboque</option> <option value="ligeiro_passageiros_com">Ligeiro passageiros / misto — com reboque</option> <option value="ligeiro_mercadorias_sem">Ligeiro mercadorias — sem reboque</option> <option value="ligeiro_mercadorias_com">Ligeiro mercadorias — com reboque</option> </optgroup> <optgroup label="MOTOCICLOS"> <option value="motociclo_sem">Motociclo — sem carro lateral / reboque</option> <option value="motociclo_com">Motociclo — com carro lateral / reboque</option> <option value="triciclo">Motociclo — triciclo</option> </optgroup> <optgroup label="CICLOMOTORES"> <option value="ciclomotor">Ciclomotor / quadriciclo</option> </optgroup> <optgroup label="VEÍCULOS PESADOS"> <option value="pesado_passageiros_sem">Pesado passageiros — sem reboque</option> <option value="pesado_passageiros_com">Pesado passageiros — com reboque</option> <option value="pesado_mercadorias_sem">Pesado mercadorias — sem reboque / semirreboque</option> <option value="pesado_mercadorias_com">Pesado mercadorias — com reboque</option> </optgroup> <optgroup label="MÁQUINAS / AGRÍCOLAS"> <option value="trator">Trator agrícola ou florestal</option> <option value="maquina_agricola">Máquina agrícola / motocultivador / tratocarro</option> <option value="maquina_industrial_sem">Máquina industrial — sem matrícula</option> <option value="maquina_industrial_com">Máquina industrial — com matrícula</option> </optgroup> </select></label> <label><span>ENQUADRAMENTO</span><select id="cinRegime" onchange="cinAtualizarLimite()"> <optgroup label="Art. 27.º CE — Limites Gerais"> <option value="coexistencia">Zona De Coexistência</option> <option value="local_geral">Dentro Da Localidade — Outras Zonas</option> <option value="restante">Restantes Vias Públicas — Limite Geral</option> <option value="reservada">Via Reservada A Automóveis E Motociclos — Limite Geral</option> <option value="autoestrada" selected>Autoestrada — Limite Geral</option> </optgroup> <optgroup label="Art. 28.º CE — Limites Especiais / Sinalizados"> <option value="local_placas">Dentro Da Localidade — Entre Placas / Limite Sinalizado</option> <option value="fora_placas">Fora Da Localidade — Entre Placas / Limite Sinalizado</option> <option value="auto_placas">Autoestrada — Entre Placas / Limite Sinalizado (100 km/h)</option> <option value="especial">Limite Especial — Local / Veículo / Condutor</option> </optgroup> <optgroup label="Valor Manual"> <option value="personalizado">Velocidade Personalizada</option> </optgroup> </select></label> <label><span id="cinLimiteLabel">LIMITE</span><div class="cin-limit-wrap"><input id="cinLimite" type="number" min="1" max="300" inputmode="numeric" placeholder="km/h" oninput="this.dataset.manual='1';cinRecalcular()"><b>km/h</b></div><em id="cinLimiteFonte">Código da Estrada — valor automático</em></label> </div> </div> <div id="cinActiveDeviceCard" class="cin-active-device-card cin-active-device-top"></div> <div class="cin-config-dashboard"> <div class="cin-config-dashboard-head"> <div> <span>CONFIGURAÇÃO DOS CINEMÓMETROS</span> <small>Escolha o aparelho em serviço. As fichas ficam guardadas neste computador.</small> </div> <div class="cin-config-dashboard-actions"> <button type="button" class="cin-radar-toggle-main" onclick="cinAlternarListaCinemometros()" id="cinRadarToggleMain">▾ MOSTRAR CINEMÓMETROS</button> <button type="button" class="cin-new-profile-btn" onclick="cinNovoPerfil()">＋ REGISTAR NOVO CINEMÓMETRO</button> <button type="button" class="cin-config-toggle-btn" onclick="cinAlternarConfiguracao()">⚙ EDITAR FICHA DO ATUAL CINEMÓMETRO</button> </div> </div> <div id="cinOtherRadarsSection" class="cin-other-radars-section"> <div class="cin-other-title"> <div class="cin-other-title-text"><span>CINEMÓMETROS GUARDADOS</span><small>Toque num aparelho para o colocar em serviço.</small></div> <div class="cin-other-title-actions"> <span id="cinProfileCount" class="cin-profile-count">0 APARELHOS</span> <button type="button" class="cin-collapse-list-btn" onclick="cinAlternarListaCinemometros()" id="cinCollapseRadarListBtn">▴ RECOLHER</button> </div> </div> <div class="cin-radar-search-wrap"> <span>⌕</span><input id="cinRadarSearch" type="text" placeholder="Procurar aparelho, modelo ou n.º de série…" oninput="cinFiltrarListaCinemometros()"> </div> <div id="cinProfileList" class="cin-profile-list cin-profile-list-clean"></div> <div id="cinProfileEmpty" class="cin-profile-empty">Não existem cinemómetros guardados.</div> </div> </div> <div id="cinConfigPanel" class="cin-config-panel cin-config-bottom-panel collapsed"> <div class="cin-technical-header"> <div> <strong>FICHA TÉCNICA DO CINEMÓMETRO</strong> <small>Dados do aparelho usados na descrição do auto.</small> </div> <button type="button" class="cin-config-cancel-top" onclick="cinCancelarConfiguracao()">CANCELAR</button> </div> <div class="cin-config-grid cin-config-grid-tech"> <div class="cin-config-col"> <label><span>APARELHO / MARCA</span><input id="cinMarca" type="text"><em class="cin-field-help">Ex.: Laser Technology / Vitronic / Jenoptik</em></label> <label><span>MODELO</span><input id="cinModelo" type="text"><em class="cin-field-help">Ex.: TruCAM II / PoliScan M1 HP2</em></label> <label><span>N.º SÉRIE</span><input id="cinSerie" type="text"><em class="cin-field-help">Ex.: TC008108 / 554710</em></label> </div> <div class="cin-config-col"> <label><span>ANSR — APROVAÇÃO</span><input id="cinANSR" type="text"><em class="cin-field-help">Ex.: Despacho 7869/2020</em></label> <label><span>IPQ — APROVAÇÃO DE MODELO</span><input id="cinIPQ" type="text"><em class="cin-field-help">Ex.: Despacho 5304/2020 — modelo 111.24.19.3.44</em></label> <label><span>DATA VERIFICAÇÃO IPQ</span><input id="cinDataIPQ" type="text" placeholder="DD/MM/AAAA"><em class="cin-field-help">Ex.: 30/07/2026</em></label> </div> <div class="cin-config-col"> <label><span>VERIFICAÇÃO</span><select id="cinVerificacao" onchange="cinAtualizarEMA()"><option value="primeira">Primeira verificação</option><option value="periodica">Verificação periódica</option></select></label> <label><span>CERTIFICADO — TIPO</span><input id="cinCertTipo" type="text"><em class="cin-field-help">Ex.: 1.ª verificação / periódica</em></label> <label><span>N.º CERTIFICADO / REF.</span><input id="cinCert" type="text"><em class="cin-field-help">Ex.: 11124/2614446191</em></label> </div> </div> <div class="cin-config-foot"> <span id="cinEmaNota">EMA: —</span> <strong id="cinEmaValor">—</strong> <div class="cin-config-foot-actions"><button class="cin-config-cancel-bottom" type="button" onclick="cinCancelarConfiguracao()">CANCELAR</button><button class="cin-save-bottom" type="button" onclick="cinGuardarConfiguracao()">GUARDAR CINEMÓMETRO</button></div> </div> </div> </section> </div>`
 },
 definicoes: {
 title:'DEFINIÇÕES', sub:'VÉRIX // PREFERÊNCIAS LOCAIS',
 html:`<div class="info-strip">Personalize a apresentação da consola. As alterações ficam guardadas neste equipamento e não alteram os dados das consultas externas.</div> <div class="settings-command-hero"> <div class="settings-hero-kicker"><span class="settings-pulse"></span> PERFIL OPERACIONAL // CONTROLO DE INTERFACE</div> <div class="settings-hero-main"><div><h3>CONFIGURAÇÃO DA CONSOLA</h3><p>Ajusta a apresentação da aplicação ao operador e ao ecrã, mantendo o posto de trabalho limpo e legível.</p></div><div class="settings-live-chip"><strong id="settingsLiveMode">ESCUDO</strong><span>PERFIL ATIVO</span></div></div> </div> <div class="settings-section-title futurista">INTERFACE / PERFIL VISUAL</div> <div class="settings-grid"> <div class="setting-card"><div class="setting-card-head"><div class="setting-card-icon">◐</div><div><strong>Tema da interface</strong><span>Altera o aspeto de toda a consola.</span></div></div><select class="setting-select wide" id="settingTheme" onchange="VERIXSettings.setTheme(this.value)"><option value="dark">Modo operacional escuro</option><option value="light">Modo claro</option></select></div> <div class="setting-card"><div class="setting-card-head"><div class="setting-card-icon">▤</div><div><strong>Densidade</strong><span>Mais conteúdo por ecrã ou mais espaço.</span></div></div><select class="setting-select wide" id="settingDensity" onchange="VERIXSettings.setDensity(this.value)"><option value="compact">Compacta</option><option value="normal">Normal</option><option value="comfortable">Conforto</option></select></div> <div class="setting-card"><div class="setting-card-head"><div class="setting-card-icon">⛶</div><div><strong>Ajuste ao ecrã</strong><span>Adapta automaticamente a escala disponível.</span></div></div><select class="setting-select wide" id="settingScale" onchange="VERIXSettings.setScale(this.value)"><option value="auto">Automático</option><option value="80">80%</option><option value="90">90%</option><option value="100">100%</option><option value="110">110%</option><option value="120">120%</option></select></div> </div> <div class="settings-section-title futurista">EFEITOS / COMPORTAMENTO</div> <div class="settings-grid settings-grid-effects"> <div class="setting-card effect-card"><div class="setting-card-head"><div class="setting-card-icon">⌁</div><div><strong>Animações HUD</strong><span>Varrimento, brilho e atividade visual.</span></div></div><div id="settingHud" class="toggle on" onclick="VERIXSettings.toggle('hud',this)"><span>ATIVO</span></div></div> <div class="setting-card effect-card"><div class="setting-card-head"><div class="setting-card-icon">↝</div><div><strong>Transições de janelas</strong><span>Entrada e saída suave dos módulos.</span></div></div><div id="settingTransitions" class="toggle on" onclick="VERIXSettings.toggle('transitions',this)"><span>ATIVO</span></div></div> <div class="setting-card effect-card"><div class="setting-card-head"><div class="setting-card-icon">▣</div><div><strong>Guardar histórico</strong><span>Regista localmente as últimas 100 consultas.</span></div></div><div id="settingHistory" class="toggle on" onclick="VERIXSettings.toggle('history',this)"><span>ATIVO</span></div></div> <div class="setting-card effect-card"><div class="setting-card-head"><div class="setting-card-icon">⌃</div><div><strong>Lista de cinemómetros recolhida</strong><span>Ao abrir o módulo, a lista de aparelhos guardados fica recolhida por defeito.</span></div></div><div id="settingCinRadarCollapsed" class="toggle on" onclick="VERIXSettings.toggle('cinRadarCollapsed',this)"><span>ATIVO</span></div></div> </div> <div class="settings-section-title futurista">ESTADO DO SISTEMA</div> <div class="settings-status-grid"> <div class="settings-status-card"><span class="ss-label">VERSÃO</span><strong>1.5</strong><small>RELEASE ATUAL</small></div> <div class="settings-status-card"><span class="ss-label">ESCALA</span><strong id="settingsScaleStatus">AUTO</strong><small>ADAPTAÇÃO AO ECRÃ</small></div> </div> <div class="settings-section-title futurista">PERFIL OPERACIONAL</div> <div class="settings-profile-grid"> <div class="setting-card profile-card"> <div class="setting-card-head"><div class="setting-card-icon">◈</div><div><strong>Perfil de utilização</strong><span>Aplica de uma vez um conjunto de definições adequado ao modo de trabalho.</span></div></div> <select class="setting-select wide" id="settingProfile" onchange="VERIXSettings.setProfile(this.value)"> <option value="escudo">Escudo — equilíbrio operacional</option> <option value="fiscalizacao">Fiscalização — máximo conteúdo</option> <option value="leitura">Leitura — maior conforto</option> <option value="posto">Posto — ecrã pequeno</option> </select> <div class="profile-hint" id="settingProfileHint">Compacto · Auto · HUD ativo · Transições ativas</div> </div> <div class="setting-card profile-card"> <div class="setting-card-head"><div class="setting-card-icon">⛶</div><div><strong>Área de trabalho</strong><span>Controlos rápidos para adaptar a consola ao posto.</span></div></div> <div class="settings-quick-actions"> <button type="button" onclick="toggleFullscreen()">⛶ ECRÃ INTEIRO</button> <button type="button" onclick="abrirHistorico()">◷ HISTÓRICO</button> <button type="button" onclick="limparHistorico()">⌫ LIMPAR HISTÓRICO</button> </div> </div> <div class="setting-card profile-card"> <div class="setting-card-head"><div class="setting-card-icon">⌁</div><div><strong>Diagnóstico local</strong><span>Informação deste equipamento, sem comunicação externa.</span></div></div> <div class="settings-diagnostic" id="settingsDiagnostic">A verificar estado local…</div> <button type="button" class="settings-diagnostic-btn" onclick="VERIXSettings.refreshDiagnostic()">ATUALIZAR DIAGNÓSTICO</button> </div> </div> <div class="settings-section-title futurista">ESTADO DO SISTEMA</div> <div class="settings-status-grid"> <div class="settings-status-card"><span class="ss-label">VERSÃO</span><strong>1.5</strong><small>RELEASE ATUAL</small></div> <div class="settings-status-card"><span class="ss-label">PERFIL</span><strong id="settingsProfileStatus">ESCUDO</strong><small id="settingsProfileStatusSub">EQUILÍBRIO OPERACIONAL</small></div> </div> <div class="settings-actions settings-actions-main"> <button type="button" class="aux-btn" onclick="VERIXSettings.reset()">REPOR PREFERÊNCIAS</button> </div> <div class="settings-cache-refresh-card"> <div class="settings-cache-refresh-copy"> <div class="settings-cache-refresh-icon">↻</div> <div><strong>ATUALIZAÇÃO FORÇADA DA APLICAÇÃO</strong><span>Ignora a URL em cache do navegador e volta a carregar o ficheiro atual com um identificador novo. Útil depois de publicar uma versão nova do VÉRIX.</span></div> </div> <button type="button" class="settings-cache-refresh-btn" onclick="VERIXForceFreshLoad()">CARREGAR NOVOS DADOS</button> </div> <div class="settings-factory-reset"> <div class="settings-factory-reset-copy"> <div class="settings-factory-reset-icon">⚠</div> <div><strong>REPOSIÇÃO DE FÁBRICA</strong><span>Apaga todos os dados guardados localmente nesta consola: favoritos, histórico, cinemómetros, sessão do operador, preferências e restantes dados locais.</span></div> </div> <button type="button" class="settings-factory-reset-btn" onclick="VERIXSettings.factoryReset()">APAGAR TODOS OS DADOS</button> </div>`
 },
 ajuda: {
 title:'AJUDA', sub:'MANUAL OPERACIONAL // ATALHOS // SUPORTE',
 html:`<div class="info-strip"><strong>MANUAL OPERACIONAL RÁPIDO</strong> — referência de utilização da consola.</div> <div class="module-grid"> <div class="module-card"><div class="module-icon">⌨</div><h3>Atalhos</h3><p><strong>Enter</strong> — nova consulta. <strong>F2</strong> — histórico. <strong>Esc</strong> — fechar janelas.</p><div class="module-status"><i></i> TECLADO</div></div> <div class="module-card"><div class="module-icon">?</div><h3>Utilização</h3><p>Confirme sempre o enquadramento legal, procedimentos e restantes dados nas fontes oficiais antes da utilização em serviço.</p><div class="module-status"><i></i> APOIO OPERACIONAL</div></div> <div class="module-card"><div class="module-icon">✉</div><h3>Suporte</h3><p>Para apoio técnico, utilize o canal interno definido pelo responsável pela consola na unidade.</p><div class="module-status"><i></i> SUPORTE INTERNO</div></div> </div>`
 }
};


function filtrarLegislacao(valor){
 const q=String(valor||'').trim().toLowerCase();
 const panels=[...document.querySelectorAll('.leg-category-panel')];
 const buttons=[...document.querySelectorAll('.leg-category-grid .leg-category')];
 const grid=document.querySelector('.leg-category-grid');
 const clearBtn=document.querySelector('.leg-search-clear');
 if(clearBtn) clearBtn.style.visibility = q ? 'visible' : 'hidden';
 const intro=document.querySelector('.leg-intro-new');

 // Limpar pesquisa
 if(!q){
 panels.forEach(p=>{
 p.classList.remove('open');
 p.querySelectorAll('.leg-card-new').forEach(c=>c.style.display='');
 });
 buttons.forEach(b=>{b.classList.remove('active'); b.style.display='';});
 if(grid) grid.style.display='';
 if(intro) intro.style.display='';
 return;
 }

 let totalFound=0;
 let firstPanel=null;
 let firstCard=null;

 panels.forEach(p=>{
 let found=0;
 p.querySelectorAll('.leg-card-new').forEach(c=>{
 const ok=c.textContent.toLowerCase().includes(q);
 c.style.display=ok?'':'none';
 if(ok){found++; totalFound++; if(!firstCard) firstCard=c;}
 });
 p.classList.toggle('open',found>0);
 if(found>0 && !firstPanel) firstPanel=p;
 });

 // Mostrar apenas categorias onde existe resultado.
 buttons.forEach(b=>{
 const onclick=b.getAttribute('onclick')||'';
 const m=onclick.match(/alternarCategoriaLeg\('([^']+)'/);
 const target=m?document.getElementById(m[1]):null;
 const has=!!(target && target.querySelector('.leg-card-new:not([style*="display: none"])'));
 b.style.display=has?'':'none';
 b.classList.toggle('active',has);
 });

 if(grid){
 grid.style.display=buttons.some(b=>b.style.display!=='none')?'':'none';
 }
 if(intro) intro.style.display='none';

 // Levar o primeiro resultado para a vista sem obrigar o utilizador a procurar.
 if(firstPanel){
 setTimeout(()=>{
 const target=firstCard || firstPanel;
 if(target && typeof target.scrollIntoView==='function') target.scrollIntoView({behavior:'smooth',block:'nearest'});
 },60);
 }

 // Enter no campo de pesquisa também confirma a pesquisa.
 return totalFound;
}

function selecionarRail(el){document.querySelectorAll('.rail-item').forEach(x=>x.classList.remove('selected'));if(el)el.classList.add('selected');}
function mostrarMenuPrincipal(){
 const home=document.getElementById('mainMenuScreen');
 const mod=document.getElementById('moduleOverlay');
 const hist=document.getElementById('historyOverlay');
 const main=document.querySelector('.main');
 if(home) home.classList.add('show');
 if(mod) mod.classList.remove('show','cinemometro-fullpage');
 mod?.querySelector('.module-window')?.classList.remove('cinemometro-fullpage-window');
 if(hist) hist.classList.remove('show');
 document.body.classList.add('main-menu-active');
 document.body.classList.remove('cinemometro-page-active','fixed-workspace-active','history-page-active','consultation-screen-active');
 if(main) main.classList.remove('consultation-fixed-active');
 document.getElementById('consultaHistoryTool')?.classList.remove('history-active');
 selecionarRail(null);
}

function abrirConsultaPrincipal(){
 const home=document.getElementById('mainMenuScreen');
 const main=document.querySelector('.main');
 const mod=document.getElementById('moduleOverlay');
 const hist=document.getElementById('historyOverlay');
 if(home) home.classList.remove('show');
 if(mod) mod.classList.remove('show','cinemometro-fullpage');
 mod?.querySelector('.module-window')?.classList.remove('cinemometro-fullpage-window');
 if(hist) hist.classList.remove('show');
 document.body.classList.remove('main-menu-active','cinemometro-page-active','history-page-active');
 document.body.classList.add('fixed-workspace-active','consultation-screen-active');
 if(main) main.classList.add('consultation-fixed-active');
 document.getElementById('consultaRail')?.classList.add('active','selected');
 document.getElementById('consultaHistoryTool')?.classList.add('history-active');
}

function abrirModulo(nome, el){
 if(nome==='consulta'){abrirConsultaPrincipal();return;}
 const mod=MODULES[nome]; if(!mod)return;
 document.getElementById('mainMenuScreen')?.classList.remove('show');
 document.querySelector('.main')?.classList.remove('consultation-fixed-active');
 document.getElementById('historyOverlay')?.classList.remove('show');
 document.body.classList.remove('main-menu-active','fixed-workspace-active','consultation-screen-active');
 document.getElementById('moduleTitle').textContent=mod.title;
 document.getElementById('moduleSub').textContent=mod.sub;
 document.getElementById('moduleBody').innerHTML=mod.html;

 if(window.VÉRIXSettings && nome==='definicoes') window.VÉRIXSettings && setTimeout(function(){
 var e=document.getElementById('settingTheme'); if(e)e.value=(JSON.parse(localStorage.getItem('VÉRIX_PREFS_V1')||'{}').theme||'dark');
 },0);
 const overlay=document.getElementById('moduleOverlay');
 const win=overlay.querySelector('.module-window');
 const close=overlay.querySelector('.module-close');
 document.body.classList.add('fixed-workspace-active');
 // Só o Cinemómetro usa o modo de ecrã integral. Os módulos secundários
 // (Legislação, Ferramentas, Informações e Definições) usam a janela normal,
 // evitando que as regras específicas do Cinemómetro bloqueiem a interface.
 overlay.classList.add('show');
 overlay.classList.toggle('cinemometro-fullpage', nome==='cinemometro');
 win.classList.toggle('cinemometro-fullpage-window', nome==='cinemometro');
 close.textContent='←';
 close.title='Voltar ao Menu Principal';
 close.onclick=()=>mostrarMenuPrincipal();
 if(nome==='cinemometro') document.body.classList.add('cinemometro-page-active');
 else document.body.classList.remove('cinemometro-page-active');
 document.getElementById('consultaHistoryTool')?.classList.remove('history-active');
 selecionarRail(el);
}
function fecharModulo(){ mostrarMenuPrincipal(); }
function abrirAvisoLegal(){
 const o=document.getElementById('legalNoticeOverlay');
 if(!o) return;
 o.classList.add('open');
 o.setAttribute('aria-hidden','false');
}
function fecharAvisoLegal(){
 const o=document.getElementById('legalNoticeOverlay');
 if(!o) return;
 o.classList.remove('open');
 o.setAttribute('aria-hidden','true');
}
function fecharAvisoLegalFora(event){
 if(event && event.target===event.currentTarget) fecharAvisoLegal();
}
document.addEventListener('keydown',function(e){
 if(e.key!=='Escape')return;
 const o=document.getElementById('legalNoticeOverlay');
 if(o&&o.classList.contains('open')){
  e.preventDefault();e.stopImmediatePropagation();
  fecharAvisoLegal();
 }
});

function fecharModuloFora(event){ /* módulos são páginas fixas; não fecham ao clicar fora */ }
document.addEventListener('keydown',function(e){
 if(e.key!=='Escape')return;
 const body=document.body;
 const byId=id=>document.getElementById(id);
 const active=(id,cls='active')=>{const el=byId(id);return !!(el&&el.classList.contains(cls));};
 const finish=()=>{e.preventDefault();e.stopImmediatePropagation();};
 // Fecha apenas a camada transitória mais interna; nunca fecha vários painéis de uma só vez.
 if(body.classList.contains('cin-config-modal-open')){finish();return;}
 if(active('systemFactoryResetModal','open')){window.VÉRIXFactoryResetModal?.close?.();finish();return;}
 const notice=byId('verixAsfNoticeOverlay');
 if(notice&&notice.getAttribute('aria-hidden')==='false'&&typeof window.fecharAvisoASFInicial==='function'){window.fecharAvisoASFInicial();finish();return;}
 if(active('legalNoticeOverlay','open')){fecharAvisoLegal();finish();return;}
 if(active('cinConfigCancelModal')){cinFecharCancelConfigModal();finish();return;}
 if(active('cinDeleteModal')){cinFecharDeleteModal();finish();return;}
 if(active('clearHistoryModal')){fecharConfirmacaoLimparHistorico();finish();return;}
 if(active('wazeGpsModal')){fecharWazeGpsModal();finish();return;}
 const module=byId('moduleOverlay');
 if(module&&module.classList.contains('show')){fecharModulo();finish();return;}
 const history=byId('historyOverlay');
 if(history&&history.classList.contains('show')){fecharHistorico();finish();return;}
 const home=byId('mainMenuScreen');
 if((body.classList.contains('consultation-screen-active')||body.classList.contains('fixed-workspace-active'))&&!(home&&home.classList.contains('show'))){
  mostrarMenuPrincipal();finish();return;
 }
 // No menu principal, Esc não altera a navegação.
 finish();
});

function legRestaurarGrelhaCategorias(){
 try{
 const anyOpen=document.querySelector('.leg-category-panel.open');
 const grid=document.querySelector('.leg-category-grid');
 if(grid) grid.style.display = anyOpen ? 'none' : '';
 }catch(e){}
}

function alternarCategoriaLeg(id, botao){
 const painel=document.getElementById(id);
 if(!painel)return;
 const aberto=painel.classList.contains('open');
 document.querySelectorAll('.leg-category-panel').forEach(p=>p.classList.remove('open'));
 document.querySelectorAll('.leg-category').forEach(b=>b.classList.remove('active'));
 const grid=document.querySelector('.leg-category-grid');
 if(!aberto){
 painel.classList.add('open');
 if(botao && botao.classList) botao.classList.add('active');
 if(grid) grid.style.display='none';
 setTimeout(()=>painel.scrollIntoView({behavior:'smooth',block:'nearest'}),30);
 } else {
 if(grid) grid.style.display='';
 }
 legRestaurarGrelhaCategorias();
}

