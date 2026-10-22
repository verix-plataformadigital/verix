


 let ultimaMatriculaPesquisada = "";
let ultimaMatriculaInspecao = "";
let ultimaMatriculaLivrete = "";

 function mostrarToast(mensagem) {
 const toast = document.getElementById('toastNotification');
 if (!toast) return;
 toast.textContent = String(mensagem || '');
 toast.classList.add('show');
 clearTimeout(window.__untToastTimer);
 window.__untToastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
 }


 function formatarMatriculaVeiculo(valor) {
   let value = String(valor || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
   let formattedValue = value.replace(/(.{2})(.{2})?(.*)/, (_, p1, p2, p3) =>
     [p1, p2, p3].filter(Boolean).join('-')
   );
   return formattedValue.substring(0, 8);
 }

 function formatMatricula(input) {
   input.value = formatarMatriculaVeiculo(input.value);
 }

 function formatMatriculaReboque(input) {
 const siglas = [
 'A', 'AN', 'AV', 'BE', 'BG', 'BR', 'C', 'CB', 'E', 'FA',
 'GD', 'H', 'L', 'LE', 'M', 'P', 'PT', 'SA', 'SE', 'VC', 'VI', 'VR', 'VS'
 ];

 let value = input.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
 let matchLetras = value.match(/^([A-Z]+)/);

 if (matchLetras) {
 let letrasDigitadas = matchLetras[1];
 let prefixoValido = siglas.some(sigla => sigla.startsWith(letrasDigitadas));

 if (!prefixoValido) {
 value = value.substring(0, value.length - 1);
 matchLetras = value.match(/^([A-Z]+)/);
 }
 }

 if (matchLetras) {
 let siglaDefinitiva = matchLetras[1];

 if (!siglas.includes(siglaDefinitiva)) {
 value = siglaDefinitiva;
 } else {
 let restante = value.substring(siglaDefinitiva.length).replace(/[^0-9]/g, '');
 restante = restante.substring(0, 6);

 if (restante.length > 0) {
 value = siglaDefinitiva + '-' + restante;
 } else if (input.value.endsWith('-')) {
 value = siglaDefinitiva + '-';
 } else {
 value = siglaDefinitiva;
 }
 }
 } else {
 value = '';
 }

 input.value = value;
 }

 // IMT — carregamento direto, seguindo o comportamento simples validado no HTML de referência.
// Não inferir falha de rede a partir de about:blank, do estado cross-origin ou de um timeout.
// Os navegadores não expõem de forma fiável os erros de navegação de uma iframe.
let imtQuerySequence = 0;

function carregarConsultaIMT(frameId, overlayId, url, source, sequence) {
  const overlay = document.getElementById(overlayId);
  const frame = document.getElementById(frameId);
  if (!overlay || !frame) return;

  const requestSequence = Number(sequence || imtQuerySequence || 0);

  overlay.classList.remove('imt-offline-state');
  overlay.innerHTML = `<div class="spinner"></div>A CARREGAR CONSULTA<div><small>IMT • ACESSO À REDE RNSI</small></div>`;
  overlay.style.display = 'flex';
  frame.style.zIndex = '2';

  // No mesmo padrão do HTML de referência: só retirar o carregamento quando
  // a navegação da própria iframe dispara load. Não alterar o canal ASF.
  frame.onload = function () {
    if (requestSequence !== imtQuerySequence) return;
    overlay.classList.remove('imt-offline-state');
    overlay.style.display = 'none';
    frame.style.zIndex = '2';
  };

  try {
    frame.removeAttribute('loading');
    frame.src = url;
  } catch (error) {
    console.error('[IMT] Não foi possível iniciar a navegação:', error);
    if (requestSequence !== imtQuerySequence) return;
    overlay.classList.add('imt-offline-state');
    overlay.innerHTML = `
      <div class="imt-offline-card" role="alert" aria-live="polite">
        <div class="imt-offline-title">NÃO FOI POSSÍVEL INICIAR A CONSULTA</div>
        <div class="imt-offline-text">O navegador não conseguiu iniciar a abertura da página IMT.</div>
        <button type="button" class="imt-retry-btn" onclick="repetirConsultaIMT()">↻ &nbsp; TENTAR NOVAMENTE</button>
      </div>
    `;
    overlay.style.display = 'flex';
  }
}

function repetirConsultaIMT() {
 const inspecao = (ultimaMatriculaInspecao || ultimaMatriculaPesquisada || '').trim().toUpperCase();
 const livrete = (ultimaMatriculaLivrete || ultimaMatriculaPesquisada || '').trim().toUpperCase();
 if (!inspecao && !livrete) return;

 const base = 'http://consultapsp.imtt.external.rnsi.local/veiculos/';
 const sequence = ++imtQuerySequence;
 window.__VERIX_CURRENT_IMT_QUERY_SEQUENCE = sequence;
 if (inspecao) carregarConsultaIMT('veiculoFrame', 'veiculoLoading', `${base}consulta_inspecao.php?Matricula=${inspecao}`, 'inspecao', sequence);
 if (livrete) carregarConsultaIMT('reboqueFrame', 'reboqueLoading', `${base}consulta_livrete.php?Matricula=${livrete}`, 'livrete', sequence);
 }

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
 html: "<div class=\"leg-search-new\"><span class=\"leg-search-icon\">⌕</span><input id=\"legSearch\" type=\"text\" autocomplete=\"off\" placeholder=\"Pesquisar infração, descrição, código ou palavra...\" oninput=\"filtrarLegislacao(this.value)\" onkeydown=\"if(event.key==='Escape'){this.value='';filtrarLegislacao('');}\"><button class=\"leg-search-clear\" type=\"button\" title=\"Limpar pesquisa\" onclick=\"const i=document.getElementById('legSearch');i.value='';filtrarLegislacao('');i.focus();\">×</button><span class=\"leg-search-hint\">PESQUISA LOCAL</span></div>\n<div class=\"leg-intro-new\"><div><div class=\"leg-intro-title-new\">CONSULTA RÁPIDA DE INFRAÇÕES</div><div class=\"leg-intro-text-new\">Pesquise por palavra, artigo ou código. Pode copiar o <strong>código</strong> ou a <strong>descrição</strong>.</div></div></div>\n<div class=\"leg-database-alert\"><span class=\"leg-alert-icon\">!</span><div><strong>ATENÇÃO — BASE DE DADOS NÃO EXAUSTIVA</strong><p>Esta base de dados contém apenas as infrações trabalhadas na base operacional fornecida. Confirme sempre o enquadramento legal e o código de infração nas fontes oficiais antes de emitir o auto.</p></div></div>\n<div class=\"leg-category-grid leg-category-grid-expanded\"><button class=\"leg-category red\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX1',this)\"><span class=\"leg-cat-icon\">✓</span><span class=\"leg-cat-text\"><strong>CINTO DE SEGURANÇA</strong><small>Cintos, sistemas de retenção e utilização obrigatória · 11 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category amber\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX2',this)\"><span class=\"leg-cat-icon\">◉</span><span class=\"leg-cat-text\"><strong>TELEMÓVEL / APARELHOS</strong><small>Telemóveis e aparelhos utilizados durante a condução · 15 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category blue\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX3',this)\"><span class=\"leg-cat-icon\">▤</span><span class=\"leg-cat-text\"><strong>RCE — REQUISITOS DO VEÍCULO</strong><small>Requisitos, equipamentos e características dos veículos · 36 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category violet\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX4',this)\"><span class=\"leg-cat-icon\">◌</span><span class=\"leg-cat-text\"><strong>PNEUMÁTICOS</strong><small>Estado, desgaste e condições dos pneumáticos · 4 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category orange\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX5',this)\"><span class=\"leg-cat-icon\">◉</span><span class=\"leg-cat-text\"><strong>MOTOCICLOS / CICLOMOTORES</strong><small>Equipamento e requisitos específicos de duas e três rodas · 18 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category blue2\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX6',this)\"><span class=\"leg-cat-icon\">▣</span><span class=\"leg-cat-text\"><strong>PLACAS / REFLETORES</strong><small>Placas, refletores e identificação do veículo · 25 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category green\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX7',this)\"><span class=\"leg-cat-icon\">⇥</span><span class=\"leg-cat-text\"><strong>RST — SINALIZAÇÃO</strong><small>Sinalização vertical, marcas e sinais de trânsito · 13 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category darkred\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX8',this)\"><span class=\"leg-cat-icon\">!</span><span class=\"leg-cat-text\"><strong>OUTRAS INFRAÇÕES CE</strong><small>Infrações constantes do Código da Estrada não agrupadas acima · 23 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category amber\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX9',this)\"><span class=\"leg-cat-icon\">⚖</span><span class=\"leg-cat-text\"><strong>PESO / PESAGEM</strong><small>Pesos, eixos e verificações por pesagem · 2 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category red\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX10',this)\"><span class=\"leg-cat-icon\">△</span><span class=\"leg-cat-text\"><strong>TRIÂNGULO / COLETE</strong><small>Pré-sinalização de perigo e equipamento de segurança · 3 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category green2\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX11',this)\"><span class=\"leg-cat-icon\">◉</span><span class=\"leg-cat-text\"><strong>ILUMINAÇÃO / LUZES</strong><small>Iluminação, sinalização luminosa e refletores · 26 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category violet\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX12',this)\"><span class=\"leg-cat-icon\">⚙</span><span class=\"leg-cat-text\"><strong>TRANSFORMAÇÕES / CARACTERÍSTICAS</strong><small>Transformações e alterações às características do veículo · 15 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category green\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX13',this)\"><span class=\"leg-cat-icon\">✓</span><span class=\"leg-cat-text\"><strong>IPO / SEGURO</strong><small>Inspeção periódica e seguro automóvel · 9 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category darkred\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX14',this)\"><span class=\"leg-cat-icon\">▣</span><span class=\"leg-cat-text\"><strong>MATRÍCULAS</strong><small>Chapas de matrícula, fixação e requisitos regulamentares · 13 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category blue\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX15',this)\"><span class=\"leg-cat-icon\">▤</span><span class=\"leg-cat-text\"><strong>DOCUMENTOS</strong><small>Documentos do veículo e do condutor · 2 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category orange\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX16',this)\"><span class=\"leg-cat-icon\">⚠</span><span class=\"leg-cat-text\"><strong>ADR — MERCADORIAS PERIGOSAS</strong><small>Transporte rodoviário de mercadorias perigosas · 3 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category blue2\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX17',this)\"><span class=\"leg-cat-icon\">➤</span><span class=\"leg-cat-text\"><strong>AUTOESTRADAS</strong><small>Circulação, paragem e regras específicas em autoestrada · 11 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category slate\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX18',this)\"><span class=\"leg-cat-icon\">+</span><span class=\"leg-cat-text\"><strong>RHLC — HABILITAÇÃO / CONDUTORES</strong><small>Habilitação, títulos, categorias e restrições à condução · 34 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button><button class=\"leg-category amber\" type=\"button\" onclick=\"alternarCategoriaLeg('legAutoX19',this)\"><span class=\"leg-cat-icon\">↗</span><span class=\"leg-cat-text\"><strong>CARGA / TRANSPORTE</strong><small>Acondicionamento, transporte e disposição da carga · 16 REGISTOS</small></span><span class=\"leg-cat-arrow\">›</span></button></div>\n<section id=\"legAutoX1\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>01</span><div><strong>CINTO DE SEGURANÇA</strong><small>Cintos, sistemas de retenção e utilização obrigatória</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">11 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CINTO SEGURANÇA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900820101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900820101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor e único ocupante do veículo, durante a marcha do veículo circulava na via pública, não fazendo uso do cinto de segurança, estando o mesmo em perfeitas condições de utilização, não utilizando o cinto de segurança durante a marcha.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MOLA CINTO DE SEGURANÇA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900820101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900820101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Utilização do cinto de segurança com aplicação de uma mola no sistema de segurança impedindo a retração das percintas. Fazendo desta forma uma utilização incorreta do cinto segurança conforme n.º 2 Art.º7 DL.n.º170-A/2014, de 07 NOV. Após retirado o referido dispositivo o cinto de segurança encontrava-se em plenas condições de funcionamento. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CINTO DE SEGURANÇA (TÁXIS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900820101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900820101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor não utilizava o cinto de segurança, durante a marcha do veículo, estando o mesmo em perfeitas condições de utilização. O veículo está afeto ao serviço de táxi, e no momento da infração (transportava XX passageiros e encontrava-se a circular fora de localidade), conforme o disposto na al. b) do Art.º 10º do DL 170-A/14.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CINTO SEGURANÇA AVARIADO (Apreensão Veículo e Guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, tendo instalados cintos de segurança, sendo que o do condutor não se encontrava em correto funcionamento, uma vez que o pré-tensor não enrola todo o tecido em excesso do cinto quando utilizado pelo condutor, ficando solto, impedindo a sua correta utilização, alterando assim as suas caraterísticas funcionais e construtivas com que foi homologado. De referir que é um dispositivo de segurança passiva, de proteção dos ocupantes de um veículo e serve para, em caso de colisão, impedir a projeção dos mesmos dentro ou para fora do veículo, o embate ou colisão.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CRIANÇA MENOS 3 ANOS, VEÍCULO SEM CINTOS DE SEGURANÇA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900550301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900550301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um menor (nome, idade, CC) com idade inferior a 3 anos em automóvel não equipado com cintos de segurança.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CRIANÇA SEM SRC QUANDO OBRIGATÓRIO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900550101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900550101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um menor (nome, idade, altura, CC), com idade inferior a 12 anos e com menos de 135 cm de altura, em automóvel equipado com cintos de segurança, não utilizando sistema de retenção homologado e adaptado ao seu tamanho e peso.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CRIANÇA COM SRC, MAIS 3 ANOS, BANCO DA FRENTE, C/ BANCOS RETAGUARDA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900550203</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900550203&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um menor (nome, idade, altura, CC) no banco da frente, com idade igual ou superior a 3 anos e inferior a 12 anos e com menos de 135 cm de altura, em automóvel equipado com cintos de segurança no banco da retaguarda.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CRIANÇA COM SRC, MENOS 3 ANOS, VIRADO PARA A FRENTE</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900550201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900550201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um menor (nome, idade) com idade inferior a 3 anos, no banco da frente de automóvel equipado com cintos de segurança, utilizando sistema de retenção virado para a frente.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CRIANÇA COM SRC, MENOS 3 ANOS, AIRBAG LIGADO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900550202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900550202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um menor (nome, idade) com idade inferior a 3 anos, no banco da frente de automóvel equipado com cintos de segurança, utilizando sistema de retenção virado para a retaguarda, estando ativada a almofada de ar frontal no lugar do passageiro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CRIANÇA, MENOS 12 ANOS, BANCO DA FRENTE (TÁXI)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900550501</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900550501&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um menor (nome, idade, altura, CC) no banco da frente de automóvel destinado ao transporte público de passageiros, com idade igual ou superior a 3 anos e inferior a 12 anos e com menos de 135 cm de altura.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CRIANÇA, MENOS 12 ANOS, BANCO DA FRENTE (TVDE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900550502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900550502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um menor (nome, idade, altura, CC) no banco da frente de automóvel destinado ao transporte público de passageiros, com idade igual ou superior a 3 anos e inferior a 12 anos e com menos de 135 cm de altura.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX2\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>02</span><div><strong>TELEMÓVEL / APARELHOS</strong><small>Telemóveis e aparelhos utilizados durante a condução</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">15 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840106</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840106&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor fazia utilização de forma continuada durante a marcha do veículo de aparelho radiotelefónico (Telemóvel), junto ao ouvido esquerdo, agarrando o telemóvel com a mão esquerda. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL (MANUSEAMENTO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840107</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840107&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor fazia manuseamento de forma continuada durante a marcha do veículo de aparelho radiotelefónico (Telemóvel), agarrando o telemóvel com a mão esquerda. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL (DOIS AURICULARES)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840105</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840105&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor e único ocupante do veículo, durante a marcha do veículo, circulava na via publica, fazendo uso de auscultadores sonoros, não sendo o aparelho dotado de um único auricular.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>UTILIZAÇÃO EQUIPAMENTO DURANTE CONDUÇÃO (TABLET-GPS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor e único ocupante do veículo fazia utilização de forma continuada durante a marcha do veículo de equipamento (tablet), suscetível de prejudicar a condução.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MANUSEAMENTO EQUIPAMENTO DURANTE CONDUÇÃO (TABLET-GPS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor e único ocupante do veículo fazia manuseamento de forma continuada durante a marcha do veículo de equipamento (tablet), suscetível de prejudicar a condução.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL EM VELOCÍPEDE</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840113</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840113&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o condutor, durante a marcha do veículo, circulava na via publica, fazendo utilização continuada de aparelho radiotelefónico (telemóvel), usando para o efeito a mão XXXX no pavilhão auricular XXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL EM VELOCÍPEDE (MANUSEAMENTO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840114</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840114&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o condutor, durante a marcha do veículo, circulava na via publica, fazendo o manuseamento de forma continuada de aparelho radiotelefónico (telemóvel), usando para o efeito a mão XXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL EM VELOCÍPEDE (DOIS AURICULARES)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840112</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840112&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o condutor, durante a marcha do veículo, circulava na via publica, fazendo utilização de auscultadores sonoros, não sendo o aparelho dotado de um único auricular.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL EM VELOCÍPEDE COM MOTOR</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840120</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840120&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o conduto, durante a marcha do veículo, circulava na via publica, fazendo utilização continuada de aparelho radiotelefónico (telemóvel), usando para o efeito a mão XXXX no pavilhão auricular XXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL EM VELOCÍPEDE COM MOTOR (MANUSEAMENTO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840121</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840121&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">erifiquei em ato de fiscalização que o condutor, durante a marcha do veículo, circulava na via publica, fazendo o manuseamento de forma continuada de aparelho radiotelefónico (telemóvel), usando para o efeito a mão XXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL EM VELOCÍPEDE COM MOTOR (DOIS AURICULARES)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840119</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840119&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o condutor, durante a marcha do veículo, circulava na via publica, fazendo utilização de auscultadores sonoros, não sendo o aparelho dotado de um único auricular.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL EM TROTINETE</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840134</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840134&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o conduto, durante a marcha do veículo a motor elétrico, autoequilibrado e automotor, circulava na via publica, fazendo utilização continuada de aparelho radiotelefónico (telemóvel), usando para o efeito a mão XXXX no pavilhão auricular XXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL EM TROTINETE (MANUSEAMENTO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840135</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840135&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o condutor, durante a marcha do veículo a motor elétrico, autoequilibrado e automotor, circulava na\nvia publica, fazendo o manuseamento de forma continuada de aparelho radiotelefónico (telemóvel), usando para o efeito a mão XXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELEMÓVEL EM TROTINETE (DOIS AURICULARES)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2900840133</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2900840133&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o condutor, durante a marcha do veículo a motor elétrico, autoequilibrado e automotor, circulava na via publica, fazendo utilização de auscultadores sonoros, não sendo o aparelho dotado de um único auricular.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>APARELHO DETETOR DE RADARES - (Remoção e Apreensão do equipamento n.º 5 Art. 161º CE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900840301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900840301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 500€ 2500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que no referido veículo se encontrava instalado aparelho suscetível de revelar a presença de instrumento destinado à deteção de infrações de velocidade.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX3\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>03</span><div><strong>RCE — REQUISITOS DO VEÍCULO</strong><small>Requisitos, equipamentos e características dos veículos</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">36 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Para-brisa Partido</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340220101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340220101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, encontrando-se o para-brisas estilhaçado no lado esquerdo em frente ao lugar do condutor, abrangendo a área de varrimento das escovas e deformando assim os objetos vistos por transparência. O condutor declarou que o para-brisas encontrasse partido à cerca de um mês. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM PALAS PARA O SOL</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340230302</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340230302&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 7,48€ 37,41€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, cujo para-brisas não possui dispositivo destinado a impedir o encandeamento do condutor pela luz do sol.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>VIDRO NÃO ESTANQUE Á CHUVA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 7,48€\n37,41€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública com o vidro traseiro da porta traseira do lado esquerdo quebrado estando o mesmo todo tapado com plástico e fita-cola, não sendo assim estanque ao vento e á chuva.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ESCOVAS LIMPA PARABRISAS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340220303</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340220303&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 14,96€\n74,82€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública cujo para-brisas não possui um limpador automático cuja superfície de ação seja suficiente para que o condutor possa ver através dela a via em que transita.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ANTEPARA PARCIAL VEÍCULO MERCADORIAS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340230304</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340230304&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 7,48€\n37,41€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que veículo misto, circulava na via pública, sem uma antepara parcial (ou total) limitando o compartimento destinado às mercadorias.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Banco roto</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340230101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340230101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 7,48€ 37,41€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, não possuindo o banco do condutor devidamente estofado, encontrando-se o mesmo rasgado com a esponja/estrutura metálica visível.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Automóveis Pesados de Passageiros, bem como veículos Carro Funerário - Ambulâncias - Transporte Carne -Ventilador</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340200801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340200801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Circulação de veículo pesado de passageiros da categoria I (ou II ou veículo do tipo ambulância ou funerário ou de transporte de carnes) de caixa fechada não dotada de ventilador.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Abertura Fácil quer do interior quer do exterior</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Circulação de veículo cujas portas não permitam abertura fácil, quer do interior quer do exterior.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Espelhos no autocarro junto portas (dispositivo ótico)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210306</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210306&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Circulação de veículo pesado de passageiros não tendo visibilidade direta suficiente e não possuindo instalado dispositivo ótico que lhe permita ver claramente as zonas interior e exterior de acesso às portas.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Transporte de passageiro em pé, em veículos pesados de passageiros na zona junto ao motorista</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340240301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340240301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 24,94€\n124,70€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Transporte de passageiro em pé, em veículos pesados de passageiros, na zona situada à frente do plano vertical que passa pela parte anterior das costas do banco do motorista na sua posição mais recuada.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Extintor em transporte passageiros</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Circulação de automóvel ligeiro (ou pesado) de transporte público de passageiros sem extintor de incêndio conforme as características regulamentares (ou com extintor sem se encontrar em condições de imediato funcionamento ou colocado em local pouco visível ou de fácil alcance).conforme Ref.ª Despacho DGV n.º15680/2002, 24JUN.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>EXTINTOR (SELAGEM/ACESSO FÁCIL/VISIBILIDADE/CARATERÍSTICAS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que veículo pesado de passageiros, circulava na via pública, com o extintor de incêndio mais próximo do condutor, não se encontrando regulamentar, pois não possuía selagem, não oferecendo assim condições de imediata utilização, com referência ao Despacho 15680/2002.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Públicidade em autocarros</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340301001</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340301001&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros, circulava na via pública, com anúncios afixados (publicidade) em zonas ou condições diferentes das aprovadas. Conforme Ref.ª Deliberação n.º 769/2019, 09JUL. ________________________________________________________________________________________________________________*No exterior não pode afetar dispositivos de iluminação e de sinalização e no interior não pode afetar dístico identificativo de lugares reservados. Apenas pode ter publicidade no vidro da retaguarda.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MARTELOS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210601</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210601&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros, circulava na via pública sem que possua dispositivo apropriado para quebrar as janelas. (indicar o local em falta)</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CORTINAS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300701</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300701&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que automóvel pesado de transporte público de passageiros circulava na via pública, não dispondo de cortina/dispositivo equivalente na janela.(indicar o local em falta)</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM SAÍDAS DE EMERGÊNCIA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210601</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210601&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros circulava na via pública, sem possuir saídas de emergência.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PELÍCULA VIDRO TRASEIRO MARCADO COMO “SAÍDA DE EMERGÊNCIA”</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública com película colorida com publicidade XXXX afixada no vidro traseiro que se encontra marcado como “Saída de Emergência”, com ref.ª n.º 1 do Art.º 2º do Regulamento aprovado pelo DL 40/2003, de 11 de março. (Apreensão Veiculo e Guia até ao destino)</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM INSCRIÇÃO “SAÍDAS DE EMERGÊNCIA”</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210604</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210604&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros circulava na via pública, sem que as saídas de emergência estejam assinaladas com a inscrição “Saída de Emergência”.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM NÚMERO MÍNIMO DE SAÍDAS DE EMERGÊNCIA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210605</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210605&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros circulava na via pública, cuja lotação é de 23 lugares, com saídas de emergência em número inferior a 3.\nVerifiquei que o veículo pesado de passageiros circulava na via pública, cuja lotação é de 24 a 36 lugares, com saídas de emergência em número inferior a 4.\nVerifiquei que o veículo pesado de passageiros circulava na via pública, cuja lotação é de mais de 36 lugares, com saídas de emergência em número inferior a 5.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>DISTINTIVO AUTOCOLANTE LUGARES CATIVOS - (APENAS PARA CATEGORIA I)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340301101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340301101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros, circulava na via pública, não dispondo de distintivo de lugares cativos (reservado a deficientes físicos, grávidas e acompanhantes de crianças ao colo), em material autocolante, afixado em local bem visível no interior do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MAU ESTADO DE CONSERVAÇÃO/ASSEIO INTERIOR OU EXTERIOR</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros circulava na via pública, em mau estado de conservação/ falta de asseio no interior ou no exterior.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM ILUMINAÇÃO INTERIOR</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o automóvel ligeiro/pesado de passageiros circulava na via pública, não dispondo no interior sistema de iluminação.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM ILUMINAÇÃO INTERIOR PERMANENTE - LUZES NOS BANCOS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300302</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300302&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de transporte público de passageiros circulava na via pública, não dispondo no interior de sistema de iluminação permanente ou não permitindo a fácil leitura em todos os lugares.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM ILUMINAÇÃO DEGRAUS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300303</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300303&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que automóvel pesado de transporte público de passageiros circulava na via pública, não estando convenientemente iluminados os degraus destinados a auxiliar a entrada/saída de passageiros.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PORTAS COM ABERTURA FÁCIL - (BOTÃO DE EMERGÊNCIA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros, circulava na via pública cujas portas não permitam abertura fácil, quer do interior, quer do exterior.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PORTAS (NÃO TER 2 PORTAS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300402</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300402&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o automóvel pesado de transporte público de passageiros de categoria II circulava na via pública, com lotação superior a 17 lugares não possuindo 2 portas no painel lateral direito, para a entrada e saída dos passageiros.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PORTAS (NÃO TER 3 PORTAS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300403</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300403&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o automóvel pesado de transporte público de passageiros de categoria II circulava na via pública, com lotação superior a 60 lugares não possuindo 3 portas no painel lateral direito, para a entrada e saída dos passageiros. (se porta traseira for de duas folhas c/ largura &gt; 1,20 é válido)</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>RODADO MAIS LARGO QUE 12CM</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340290301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340290301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros, circulava na via pública com caixa excedendo mais de 12 cm para cada lado a largura do rodado mais largo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LOGOTIPO/DESIGNAÇÃO DA EMPRESA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340301001</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340301001&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o automóvel pesado de transporte público de passageiros circulava na via pública, não dispondo do logótipo ou da designação da empresa a que o veículo está afeto nos painéis da frente e laterais do veículo, com referência ao Despacho DGV n.º 12802/04, de 30 de junho.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CABOS ELÉTRICOS À VISTA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340290601</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340290601&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros circulava na via pública, cujos cabos das instalações elétricas não estejam convenientemente isolados (ou não estando convenientemente fixos ou não estando convenientemente protegidos contra curto-circuitos).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>DISPOSITIVO ACÚSTICO (RECOMEÇO DA MARCHA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300901</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300901&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros circulava na via pública, não dispondo de sinal acústico (ou luminoso) para os passageiros (ou condutor) determinarem a paragem (ou o recomeço) da marcha. (APENAS PARA CATEGORIA I E II)</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>DISPOSITIVO ACÚSTICO (FECHO/ABERTURA PORTA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340300901</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340300901&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros circulava na via pública, não dispondo de dispositivo acústico adequado para assinalar aos passageiros o fecho de porta servo comandada situada para trás do eixo anterior do veículo. (APENAS PARA CATEGORIA I)</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>VIDRO TRASEIRO NÃO ESTANQUE Á CHUVA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340200802</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340200802&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros, circulava na via pública com o vidro traseiro quebrado estando o mesmo todo tapado com plástico e fita-cola, não sendo assim estanque ao vento e á chuva.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>DISPOSITIVO FIXO PROTEÇÃO CONDUTOR</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340230202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340230202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 7,48€\n37,41€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de passageiros, circulava na via pública, em que é autorizado o transporte de passageiros de pé, na proximidade do lugar do condutor não estando este eficazmente protegido por um dispositivo fixo, sólido e capaz de proteger o condutor contra qualquer choque ou pressão provocado pelos passageiros.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CINTAS NAS PORTAS DA RETAGUARDA – PORTAS ABREM MAIS QUE A LARGURA DO VEÍCULO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210703</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210703&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 14,96€\n74,82€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, pesado de mercadorias de caixa fechada, circulava na via pública, sendo que as portas da retaguarda quando abertas ultrapassavam a largura máxima do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>As PORTAS LATERAIS estando abertas não se fixam nas laterais</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340210702</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340210702&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 14,96€\n74,82€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o veículo pesado de mercadorias de caixa fechada circulava na via pública, sendo que as portas da laterais quando abertas não se fixam no painel onde estão colocadas. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX4\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>04</span><div><strong>PNEUMÁTICOS</strong><small>Estado, desgaste e condições dos pneumáticos</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">4 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TELA À VISTA (PESADO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1570070103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1570070103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n498,80€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, de peso bruto igual ou superior a 3500 Kg, circulava na via pública, apresentando na zona de rolagem lesões que atingem a tela e a coloca a descoberto, no pneumático esquerdo do (primeiro/segundo) eixo, do lado de (dentro/fora) (rodado duplo).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Altura inferior a 1mm (PESADO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1570060203</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1570060203&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 99,76€\n498,80€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo pesado de mercadorias circulava na via pública, cujo pneu do segundo eixo do lado esquerdo exterior e do lado direito exterior apresentam na zona de rolagem desenhos com altura inferior a 1 mm nos relevos principais.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Altura inferior a 1,6mm (LIGEIRO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>Não repara 1570060101 Repara 1570060102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;Não repara 1570060101 Repara 1570060102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 49,88€ 249,40€ 24,94€\n124,70€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo ligeiro de mercadorias circulava na via pública, cujo pneu do primeiro eixo do lado esquerdo apresenta na zona de rolagem desenhos com altura inferior a 1,6 mm nos relevos principais.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LESÕES TELA (LIGEIRO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>Não repara 1570060101 Repara 1570060102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;Não repara 1570060101 Repara 1570060102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 49,88€ 249,40€ 24,94€\n124,70€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, ligeiro de passageiros, circulava na via pública, apresentando na zona de rolagem do pneumático da (frente direito), lesões que atingem a tela e a coloca a descoberto.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX5\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>05</span><div><strong>MOTOCICLOS / CICLOMOTORES</strong><small>Equipamento e requisitos específicos de duas e três rodas</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">18 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Motociclo sem dois espelhos retrovisores.</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140501</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140501&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública não dispondo do componente (espelhos retrovisores) com que foi aprovado, conforme o estipulado no nº 3 e 5 do Art.º 114º do CE, com referência ao nº 1 do Art.º 136º e 4.1 do anexo XXXII, do Regulamento aprovado pelo DL 86-A/2010 de 15 de julho.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Motociclo sem refletor - à retaguarda</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública, não estando equipado com um refletor vermelho não triangular à retaguarda, conforme o disposto no parágrafo 16º da Portaria 851/94, de 22 de setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Motociclo não dispõe de dispositivo com sistema de minimos e médios - tendo feito nos 8 dias ou no local a reparação</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860640102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860640102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Condução de motociclo (ou de triciclo ou de quadriciclo ou de ciclomotor), com avaria nas luzes, não utilizando um médio (conjuntamente com um mínimo) para a frente e um indicador de presença e a luz de travagem à retaguarda (ou não utilização em alternativa as luzes avisadoras de perigo), quando a mesma seja de fácil reparação e o infrator apresente, no prazo de oito dias, em posto policial o veículo com a avaria reparada.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Dispositivo não dispõe de minimos e médios - não tendo feito nos 8 dias ou no local a reparação</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860620101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860620101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Condução de motociclo (ou de triciclo ou de quadriciclo ou de ciclomotor), com avaria nas luzes, não utilizando um médio (conjuntamente com um mínimo) para a frente e um indicador de presença e a luz de travagem à retaguarda (ou não utilização em alternativa as luzes avisadoras de perigo).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRÍCULA INCLINADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180802</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180802&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública, matriculado provido de chapa de matrícula não obedecendo aos termos fixados em regulamento conforme nº3 do Art.º 7º do RNCMA aprovado pelo DL 54/05, de 03 de março. A mesma não se encontrava posição perpendicular e centrada relativamente ao plano longitudinal médio do veículo. O condutor efetuou a reparação no local.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRÍCULA NÃO REGULAMENTAR - (ATÉ 01JAN07) (alt. 11.5cm/comp. 17cm)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública provido de chapa de matrícula não obedecendo aos termos fixados em regulamento, com referência ao nº7 Art.º 5º do RNCMA aprovado pelo DL 54/05, conjugado com o DL 106/2006. (modelo IV Anexo IV).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRICULA NÃO CORRESPONDENTE - (A PARTIR DE 01JAN07 ATÉ 01MAR20) (alt. 13.5cm/comp. 17cm)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública provido de chapa de matrícula não obedecendo aos termos fixados em regulamento, com referência ao nº7 Art.º 5º do RNCMA aprovado pelo DL 54/05 (modelo V Anexo IV).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRÍCULA NÃO REGULAMENTAR - (A PARTIR DE 02MAR20) - (alt. 14cm / comp. 22cm) / P fundo azul)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública provido de chapa de matrícula não obedecendo aos termos fixados em regulamento, com referência a al. d) nº1 Art.º 5º e nº6 Art.º 5º do RNCMA aprovado pelo DL 54/05, conjugado com o DL 2/2020 (modelo IV/V Anexo V).\nOBS: DL 2/2020 alterou o tamanho das matrículas e inseriu o símbolo do país em fundo azul.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZ CRUZAMENTO/PRESENÇA MOTOCICLO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2860930201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2860930201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública, sem a luz de cruzamento para a frente acesa / luz de presença para a retaguarda acesa, quando não for imposta a utilização de outras luzes.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FALTA DE APOIO DE MÃOS PASSAGEIROS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340240501</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340240501&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 24,94€ 124,70€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública, não estando o banco destinado ao transporte de passageiros dotado de um apoio para as mãos.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FALTA DE APOIO DE PÉS PASSAGEIROS/DESCANSO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1340240502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1340240502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 24,94€ 124,70€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública, não estando equipado com um descanso (ou estribo) para os pés do passageiro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PNEUS ALTURA INFERIOR A 1 MM</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1570060201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1570060201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 49,88€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública, cujo pneu traseiro/dianteiro apresenta na zona de rolagem desenhos com altura inferior a 1 mm nos relevos principais.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PNEUMÁTICOS C/ LESÕES TELA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1570070101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1570070101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 49,88€\n249,40€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública, apresentando na zona de rolagem do pneumático da (frente direito), lesões que atingem a tela e a coloca a descoberto.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SUPORTE DE MATRICULA (RABO DE BACALHAU) DEPOIS 2014</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861150201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861150201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Transformação às caraterísticas construtivas e funcionais do veículo, sem estar legalmente autorizado, uma vez que o mesmo não dispunha do suporte de matrícula com o qual foi homologado (e13*168/2013*00001*01), obrigando desta forma a colocar a matricula/sistema de iluminação num novo local do veículo, local esse, onde tais componentes não foram aprovados, desrespeitando os requisitos aplicáveis ao espaço para a chapa de matrícula constantes em 1.2, 1.4 e 1.5 do anexo XIV do Regulamento Delegado (UE) N.º 44/2014 da Comissão de 21NOV13 que completa o Regulamento (UE) n.º 168/2013 do Parlamento Europeu e do Conselho no que respeita à construção de veículos e requisitos gerais para a homologação dos veículos de duas ou três rodas e dos quadriciclos. ________________________________________________________________________________\nForma e dimensões do espaço para a montagem de uma chapa de matrícula:\n1.4.1. O espaço para montagem deve compreender uma área retangular com as seguintes dimensões mínimas:\nPara veículos das categorias L3e, L4e, L5e e L7e: largura: 280 mm / altura: 200 mm.\n1.5. Montagem e fixação de uma chapa de matrícula da retaguarda em veículos das categorias L1e, L2e, L3e, L4e e L5e\n1.5.1. O espaço para a montagem de uma chapa de matrícula</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SUPORTE DE MATRICULA (RABO DE BACALHAU) ANTES 2014</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861150201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861150201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Transformação às caraterísticas construtivas e funcionais do veículo, sem estar legalmente autorizado, uma vez que o mesmo não dispunha do suporte de matrícula com o qual foi homologado (e3*92/61*0101*01), obrigando desta forma a colocar a matricula/sistema de iluminação num novo local do veículo, local esse, onde tais componentes não foram aprovados, desrespeitando os requisitos aplicáveis ao espaço para a chapa de matrícula.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CAPACETE MOTOCICLO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900820309</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900820309&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo, circulava na via pública, sem que o condutor faça uso de capacete de modelo oficialmente aprovado. ______________________________________________\n1900820310 – Utilização incorreta, pelo condutor de motociclo, de capacete de modelo oficialmente aprovado.\n1900820311 – Não utilização, pelo passageiro transportado em motociclo, de capacete de modelo oficialmente aprovado.\n1900820312 – Utilização incorreta, pelo passageiro transportado em motociclo, de capacete de modelo oficialmente aprovado.\n2900820315 – Não utilização, pelo menor, transportado em motociclo, de capacete de modelo oficialmente aprovado.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CAPACETE CICLOMOTOR</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900820301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900820301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido ciclomotor, circulava na via pública, sem que o condutor faça uso de capacete de modelo oficialmente aprovado. _______________________________________________\n1900820302 – Utilização incorreta, pelo condutor de ciclomotor, de capacete de modelo oficialmente aprovado.\n1900820304 – Não utilização, pelo passageiro transportado em ciclomotor, de capacete de modelo oficialmente aprovado.\n1900820305 – Utilização incorreta, pelo passageiro transportado em ciclomotor, de capacete de modelo oficialmente aprovado.\n2900820306 – Não utilização, pelo menor, transportado em motociclo, de capacete de modelo oficialmente aprovado.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CAPACETE MENOR</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860820303</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860820303&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido motociclo/ciclomotor/triciclo/quadriciclo, circulava na via pública, transportando menor, sem que o mesmo faça uso de capacete de modelo oficialmente aprovado.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX6\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>06</span><div><strong>PLACAS / REFLETORES</strong><small>Placas, refletores e identificação do veículo</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">25 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Placa “Veículo Longo” – “Altura” - MENOS DE 50CM ATÉ 150CM DO SOLO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei a circulação do veículo de matrícula XX-XX-XX que fazia conjunto de veículos com o semirreboque supracitado que utilizava/refletores que não obedeciam às características legalmente fixadas. Designadamente, as placas \"Veículo Longo\", colocadas à retaguarda do semirreboque, estavam colocadas a uma altura do solo de 0,40 m. Não estando conforme a alínea e) do parágrafo 20 da portaria 851/94, de 22 setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Placas Normas – “Altura” - MENOS DE 50CM ATÉ 150CM DO SOLO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública encontrando-se o bordo inferior das suas placas refletoras (anexo I – modelo nº 2) instaladas à retaguarda a XX cm do solo, não se encontrando em conformidade com o disposto na al. e) do parágrafo 20º, da Portaria 851/94, de 22 de setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM POSSUIR PLACAS REFLETORAS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública não possuindo placas refletoras à retaguarda, conforme o disposto no parágrafo 20º da Portaria 851/94, de 22 de setembro, com referência à Deliberação n.º 1109/2022.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PLACAS REFLETORAS SEM MARCA DE HOMOLOGAÇÃO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública possuindo placas refletoras à retaguarda (anexo I - modelo n.º 2), não contendo marca de fabrico ou comercial, conforme disposto na al. e) do n.º 1, n.º 8 e n.º 9 do Anexo I da Deliberação n.º 1109/2022.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Têm Placa “Veículo Longo” e o veículo não tem menos 12 metros</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização a circulação de veículo de matrícula XX-XX-XX que fazia conjunto de veículos com o semirreboque supracitado possuindo este na sua retaguarda refletores “VEÍCULO LONGO”, não tendo o conjunto do veículo comprimento igual ou superior a 12 m. Conforme o parágrafo 20 da portaria 851/94, de 22 setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PLACAS REFLETORAS DESCOLORADAS/DETERIORADAS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública possuindo placas refletoras à retaguarda (anexo I - modelo n.º 2) descoloradas, não contendo as cores amarelo refletor combinado com vermelho fluorescente, conforme o disposto na al. d) do parágrafo 20º da Portaria 851/94, de 22 de setembro, com referência à al. i) e al.) l) do n.º 1 e n.º 10 do Anexo I à Deliberação n.º 1109/2022.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PLACAS NÃO RETRORREFLETORAS/FLUORESCENTES</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública possuindo placas refletoras à retaguarda (anexo I - modelo n.º 2), não contendo material refletor e fluorescente, conforme o disposto na al. d) do parágrafo 20º da Portaria 851/94, de 22 de setembro, com referência à al. i) e al.) l) do n.º 1 e n.º 10.2.1.1 e 10.2.1.2 do Anexo I à Deliberação n.º 1109/2022.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PLACAS REFLETORAS NÃO PERPENDICULARES</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública possuindo placas refletoras à retaguarda (anexo I – modelo n.º 2), não se encontrando colocadas num plano vertical perpendicular ao plano longitudinal médio do veículo e simetricamente em relação a este, de modo a serem inteiramente visíveis qualquer que seja a carga do veículo, em conformidade com o disposto na al. e) do parágrafo 20º, da Portaria 851/94, de 22 de setembro, com referência à al. s) e al.) w) do n.º 1 do Anexo I à Deliberação n.º 1109/2022.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM POSSUIR ALGUNS REFLETORES LATERAIS NÃO TRIANGULARES</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX), não possuindo refletores laterais, conforme o disposto al. c) do parágrafo 15º da Portaria 851/94, de 22 de setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>REFLETORES LATERAIS NÃO TRIANGULARES A MENOS DE 35CM ATÉ 150CM (altura)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX). Efetuada a medição em altura os refletores laterais encontravam-se instalados a XX cm do solo, não se encontrando em conformidade com o disposto na al. c) do parágrafo 15º, da Portaria 851/94, de 22 de setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>REFLETORES LATERAIS NÃO TRIANGULARES EXCEDENDO 3M ENTRE ELES (comprimento)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX). Efetuada a medição entre os dois refletores laterais consecutivos existentes no lado direito/esquerdo do semirreboque, os mesmos apresentam uma distância de XX metros, no entanto foi verificado que não existe incompatibilidade nas características do semirreboque para cumprirem a distância regulamentar referida (até 4 metros), não se encontrando em conformidade com o disposto na al. c) do parágrafo 15º, da Portaria 851/94, de 22 de setembro.*No SCOT meter a matrícula do tractor ou semi-reboque do que estiver em infracção, mencionando o outro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>REFLETORES LATERAIS NÃO TRIANGULARES EXCEDENDO 1M DA RETAGUARDA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX). Efetuada a medição entre o refletor lateral existente e a retaguarda no lado direito/esquerdo do semirreboque, o mesmo apresenta uma distância de XX metros, não se encontrando em conformidade com o disposto na al. c) do parágrafo 15º, da Portaria 851/94, de 22 de setembro</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Falta dos Triângulos</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX), não possuindo à retaguarda dois refletores triangulares, conforme o disposto na al. a) do parágrafo 17º da Portaria 851/94, de 22 de setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Placa Veículo Longo - &quot;falta bordo vermelho&quot;</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização a circulação de veículo de matrícula XX-XX-XX que fazia conjunto de veículos com o semirreboque supracitado. Designadamente, as placas \"Veículo Longo\", colocadas à retaguarda do semirreboque, ostentavam simplesmente a cor amarela, faltando-lhe o bordo vermelho fluorescente. Não estando conforme a alínea d) do parágrafo 20 da portaria 851/94, de 22 setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Placas de Veículo Longo - “Inelegíveis”</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização a circulação de veículo de matrícula XX-XX-XX que fazia conjunto de veículos com o semirreboque supracitado, estava sinalizado à retaguarda com duas placas de modelo n.º 5, previstas na c), 20.º da portaria 851/94, 22SET. No entanto as mesmas não obedeciam às características legalmente fixadas, encontravam-se danificadas, não sendo legível a inscrição «VEÍCULO LONGO».</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PAINEL P1</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um contentor (objeto indivisível) excedendo os contornos do veículo para as laterais em XXX metros, não estando sinalizado com o painel P1, conforme o disposto no anexo I e nº2 art.º 16 do R.A.E.T. aprovado pela Portaria 472/2007, de 22 de junho. A medição foi realizada na presença do condutor.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PAINEL P2</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um contentor (objeto indivisível) excedendo os contornos do veículo para a retaguarda em XXX cm, não estando sinalizado com o painel P2, conforme o disposto no Anexo I e nº 3, Art.º 16 do RAET, aprovado pela Portaria 472/2007, de 22 de junho. A medição foi realizada na presença do condutor.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PAINEL P2 (NÃO REGULAMENTAR/DESCOLORADO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, transportando um contentor (objeto indivisível) excedendo os contornos do veículo para a retaguarda em XXX cm, estando sinalizado com o painel P2 não regulamentar, por estar descolorado, não contendo as cores vermelho refletor combinado com branco, conforme o disposto no Anexo I e n.º 3, Art.º 16 do RAET, aprovado pela Portaria 472/2007, de 22 de junho.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Falta do Painel &quot;TRANSPORTE EXCEPCIONAL&quot;</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo efetuava um transporte excecional devendo usar um ou dois painéis com a inscrição “Transporte Excecional “colocados no tejadilho ou noutro local bem visível (em ambos os sentidos de transito), com dimensões mínimas de 1 m x 30 cm (deve ser refletor ou possuir sistema de iluminação a utilizar nos termos do Art.º 61º do CE).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Tractores Agricolas / Seus Reboques / Máquinas automatizadas ou rebocadas devem possuir Modelo anexo II</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo Tractor Agricola circulava na via pública sem estar equipada com o painel S2, cujo modelo e características constam no Anexo II, conjugado c/ n.º 8 Art.º 16º do RAET Aprovado pela Portaria 472/07.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FAIXAS REFLETORAS RETAGUARDA (10JUN11 ATÉ 31OUT14)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, com massa máxima superior a 7,5 toneladas e com largura superior a 2,10 metros, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX), não possuindo à retaguarda marcações de conspicuidade, com faixas retrorrefletoras vermelhas ou amarelas no seu contorno, o mais próximo possível do limite do veículo, com referência ao Ponto 6.21.1.2.1 do Regulamento n.º 48, por força dos Art.º 1º, 6º e 9º do DL 218/2008, 11NOV e Regulamento n.º 104 UNECE.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FAIXAS REFLETORAS LATERAIS (10JUN11 ATÉ 31OUT14)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, com massa máxima superior a 7,5 toneladas e com comprimento superior a 6,00 metros, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX), não possuindo lateralmente marcações de conspicuidade, com faixas retrorrefletoras amarelas ou brancas no seu contorno, cobrindo 80% do comprimento, com referência ao Ponto 6.21.1.2.2.1 do Regulamento n.º 48, por força dos Art.º 1º, 6º e 9º do DL 218/2008, 11NOV e Regulamento n.º 104 UNECE.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FAIXAS REFLETORAS RETAGUARDA (APÓS 01/11/2014)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, com massa máxima superior a 7,5 toneladas e com largura superior a 2,10 metros, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX), não possuindo à retaguarda marcações de conspicuidade, com faixas retrorrefletoras vermelhas ou amarelas no seu contorno, o mais próximo possível do limite do veículo, com referência ao Ponto 6.21.1.2.1 do Regulamento n.º 48, por força do n.º 2 do Art.º 4º, al. d) do n.º2 do Art.º 5º, n.º 1 do Art.º 19º e Anexo IV do Regulamento (CE) n.º 661/2009, 13JUL e Regulamento n.º 104 UNECE.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FAIXAS REFLETORAS LATERAIS (APÓS 01/11/2014)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, com massa máxima superior a 7,5 toneladas e com comprimento superior a 6,00 metros, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX), não possuindo lateralmente marcações de conspicuidade, com faixas retrorrefletoras amarelas ou brancas no seu contorno, cobrindo 80% do comprimento, conforme disposto no Regulamento (CE) n.º 661/2009, com referência ao Ponto 6.21.1.2.2.1 do Regulamento n.º 48, por força do n.º 2 do Art.º 4º, al. d) do n.º2 do Art.º 5º, n.º 1 do Art.º 19º e Anexo IV do Regulamento (CE) n.º 661/2009, 13JUL e Regulamento n.º 104 UNECE.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FAIXAS REFLETORAS LATERAIS E RETAGUARDA (APÓS 01/11/2014)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, com massa máxima superior a 7,5 toneladas e com largura superior a 2,10 metros e com comprimento superior a 6,00 metros, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX), não possuindo à retaguarda marcações de conspicuidade, com faixas retrorrefletoras vermelhas ou amarelas no seu contorno, o mais próximo possível do limite do veículo e não possuindo lateralmente marcações de conspicuidade, com faixas retrorrefletoras amarelas ou brancas no seu contorno, cobrindo 80% do comprimento com referência ao Ponto 6.21.1.2.2.1 e 6.21.1.2.1 do Regulamento n.º 48, por força do n.º 2 do Art.º 4º, al. d) do n.º2 do Art.º 5º, n.º 1 do Art.º 19º e Anexo IV do Regulamento (CE) n.º 661/2009, 13JUL e Regulamento n.º 104 UNECE.\nOBS: a) N2 com uma massa máxima superior a 7,5 toneladas e N3 (com exceção de quadros-cabinas, veículos incompletos e tratores para semirreboques);\nb) O3 e O4 (com exceção dos veículos incompletos).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX7\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>07</span><div><strong>RST — SINALIZAÇÃO</strong><small>Sinalização vertical, marcas e sinais de trânsito</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">13 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSPOR A LINHA CONTINUA SEPARADORA DE - VIAS DE TRÂNSITO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1890600102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1890600102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo durante a marcha, transpôs a linha longitudinal contínua (marca M1) separadora de vias de trânsito ao efetuar uma inversão de marcha. O condutor circulava no sentido AE 1/Vialonga e inverteu a marcha de novo para o sentido da AE 1. Linha de cor branca, bem visível no pavimento. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSPOR A LINHA CONTINUA SEPARADORA DE - SENTIDOS DE TRÂNSITO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3890600104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3890600104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120 € 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo durante a marcha, transpôs a linha longitudinal contínua (marca M1) separadora de sentidos de trânsito ao efetuar uma inversão de marcha. O condutor circulava no sentido AE 1/Vialonga e inverteu a marcha de novo para o sentido da AE 1. Linha de cor branca, bem visível no pavimento. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MARCA ORIENTADORA SENTIDO DE TRÂNSITO M15</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1890630101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1890630101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€\n150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor circulava na via pública não dando cumprimento da indicação dada pela (Marca M15 ou M15a, ou M15b ou M15c ou M15d ou M15e ou M15f) – obrigação de seguir no sentido (ou num dos sentidos) indicado por esta seta de seleção oposta em via de trânsito delimitada por linhas contínuas.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEMÁFORO VERMELHO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3890690101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3890690101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o referido veículo na via pública não tendo respeitado a obrigação de parar imposta pelo sinal vertical luminoso de cor vermelha (semáforo), de regulação do trânsito. O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SENTIDO PROIBIDO SINAL C1</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2890240101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2890240101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€\n300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o referido veículo na via pública não tendo respeitado o sinal vertical de proibição C1 (sentido proibido). O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PROIBIDO ULTRAPASSAR (LIGEIROS) C14a</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>Dentro AE 3890240145 Fora AE 2890240142</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;Dentro AE 3890240145 Fora AE 2890240142&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€\n300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o referido veículo na via pública não tendo respeitado o sinal vertical de proibição C14a (proibição de ultrapassar). O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PROIBIDO ULTRAPASSAR (PESADOS) C14b</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>Dentro AE 3890240146 Fora AE 2890240143</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;Dentro AE 3890240146 Fora AE 2890240143&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€\n300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o referido veículo na via pública não tendo respeitado o sinal vertical de proibição C14b (proibição de ultrapassar). O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRÂNSITO PROIBIDO A AUTOMÓVEIS PESADOS C3b</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1890240105</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1890240105&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€\n300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o referido veículo na via pública não tendo respeitado o sinal vertical de proibição C3b (Trânsito proibido a automóveis pesados). O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRÂNSITO PROIBIDO A AUTOMÓVEIS MERCADORIAS C3c</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1890240106</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1890240106&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€\n300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o referido veículo na via pública não tendo respeitado o sinal vertical de proibição C3c (Trânsito proibido a mercadorias). O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LINHA MISTA M3</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3890600110</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3890600110&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€\n600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do veículo, circulava na via pública, pisando e transpondo a linha longitudinal contínua mista (marca M3) separadora de sentidos de trânsito, estando mais próxima a linha contínua. O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>RAIAS OBLIQUAS DELIMITADAS POR LINHA CONTINUA M17</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1890640101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1890640101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€\n150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do veículo, circulava na via pública, pisando e transpondo a raia obliqua delimitada por linha continua (marca M17) separadora de sentidos de trânsito, estando mais próxima a linha contínua. De referir que a marca rodoviária M17 se encontrava bem visível e delimitada no pavimento. O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>STOP</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3890210104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3890210104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€\n600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o referido veículo na via pública não tendo respeitado a obrigação de parar imposta pelo sinal vertical de cedência de passagem B2 (paragem obrigatória na interseção). O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MÉDIOS DESLIGADOS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1890270127</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1890270127&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€\n300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o referido veículo na via pública não tendo respeitado a obrigação da indicação dada pelo sinal D10, obrigação de utilizar as luzes de cruzamento (médios) acesas. O condutor era único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX8\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>08</span><div><strong>OUTRAS INFRAÇÕES CE</strong><small>Infrações constantes do Código da Estrada não agrupadas acima</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">23 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Certificado - ATP</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860570102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860570102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo (fazia conjunto com o semirreboque com matricula XX-XX-XX) possuindo uma caixa (frigorifica ou térmica) afeta ao transporte de mercadorias a uma temperatura controlada (ou de produtos alimentares perecíveis), medindo em largura XXX metros, excedendo em largura 2,55m tendo averbado no livrete caixa fechada frigorifica (ou isotérmica ou calorifica), sem possuir certificado aprovação ATP (ou caducado). Não estando conforme Al. b) n.º 3 Art.º 3º do Anexo I do DL n.º 132/2017 de 11OUT c/ Ref. Despacho DGV n.º 20448/05, 12SET.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ALTURA SEMIRREBOQUE CONSTRUÇÃO EXCEDE 4 METROS DE ALTURA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860570102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860570102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veiculo fazia conjunto com o reboque / semirreboque de matricula X-XXXX, medindo X,XX m de altura, excedendo em XXX m/cm a altura máxima permitida de 4 metros, não possuindo qualquer autorização. O veiculo possuía os pneumáticos com as medidas constantes no documento de identificação. O veiculo não possuía qualquer avaria no momento, nomeadamente no sistema pneumático/hidráulico, infringindo o disposto na al. a) n.º 4 Art.º 3º do Reg. Anexo ao DL n.º 132/2017, de 11 de outubro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEMI-REBOQUE NÃO RESPEITANDO 12M ENTRE EIXO DA CAVILHA RETAGUARDA DO SEMIRREBOQUE</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860570102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860570102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque fazia conjunto com o trator de mercadorias (matricula XXXXX), não respeitando a distância máxima entre o eixo da cavilha de engate e a retaguarda do semirreboque (12,00 m), tendo um total de XX metros, excedendo o limite em XX cm, com ref.ª al. a), n.º 6 Artº 3º do Reg. Anexo ao DL n.º 132/2017, de 11 de outubro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Desobediência ao Agente de autoridade</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3860040301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3860040301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 500€ 2500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor e único ocupante do veículo, conduzia o referido veículo na via pública, não tendo obedecido ao sinal de paragem regulamentar do trânsito vindo de frente, conforme disposto na al. a) do Art.º 103º do RST, realizado com bastão luminoso por agente devidamente uniformizado e equipado com material retrorrefletor conforme disposto no Art.º 104º do D.R. nº 22-A/98, de 01 de outubro. O local era de excelente visibilidade.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>UTILIZAÇÃO DE SINAL SONORO SEM PERIGO EMINENTE</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860570102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860570102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, fazendo utilização de sinal sonoro, não se verificando situação de perigo iminente. O condutor utilizou o sinal sonoro como forma de protesto.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Excesso de Lotação</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860540301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860540301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, transportando pessoas em número que exceda a lotação do veículo. O veículo realizava o transporte de X pessoas (incluindo o condutor), sendo permitido somente o transporte de X pessoas (incluindo o condutor), conforme averbado no certificado de matricula com o nº X emitido em XX/XX/XXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Circulação de Maquina Industrial sem se encontrar matriculada</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861170101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861170101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que a Maquina Industrial de cor amarela, tipo RE “Retroescavadora”, com Peso Bruto Superior a 300Kg, constante do Anexo I do DL. 107/2006, com o número de quadro NH 85-4PT/E, com o Chassis n.º 031023607, do ano 1999, circulava na via pública, não se encontrando a mesma matriculada nos termos legais. Conforme o Art.º 36 do DL 107/2006. A Mesma deveria possuir chapa de matricula nos termos nº.11 Art.º5 do DL 54/2005. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PINTURA VERMELHA E BRANCA OU PLACA (RÉGUA NOS GARFOS) - MAQ. INDUSTRIAIS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1660140101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1660140101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, máquina industrial, circulava na via pública, possuindo para a retaguarda para além do corpo principal da máquina, retro excedendo esta em 2,10 metros para a retaguarda sem que a extremidade da mesma (ou seus elementos de suporte) estejam pintados num comprimento mínimo de 300 mm com marcação de cor contrastante, constituída por faixas de largura entre 50 e 100 mm, oblíquas a 45º, de cores branca e vermelha alternadas (ou assinalados à retaguarda c/ painel p/ assinalar a carga que excede os contornos envolventes do veículo).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>VELOCIDADE EXCESSIVA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2860240101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2860240101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do veículo circulava na via da esquerda com velocidade excessiva atendendo as características da via e às condições meteorológicas/ambientais/intensidade de trânsito, impossibilitando a realização de manobras com segurança, nomeadamente, imobilizar o veiculo no espaço livre e visível à sua frente.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>DISTÂNCIA DE SEGURANÇA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2860180101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2860180101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor circulava na via da esquerda desrespeitando da distancia de segurança em relação ao veiculo da frente, podendo este criar perigo de acidente, não tendo margem de travagem, caso o veículo que seguia à sua frente tivesse de efetuar uma travagem de emergência.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>GPL SEM DÍSTICO IDENTIFICADOR OU COLOCAÇÃO INCORRETA - (Viaturas Convertidas ou de fábrica antes de 13/07/2013)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1820050101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1820050101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo ligeiro de passageiros (categoria M1), circulava na via pública não ostentando um Dístico Identificador na metade direita do painel da retaguarda, a uma altura do solo não superior a 1200 mm, de forma inamovível (em papel autocolante), sendo possível por razões construtivas do veículo, de acordo com o modelo 3 definido no n.º 3 do anexo I da Portaria 196-B/2015, de 02JUL.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>GPL SEM VINHETA IDENTIFICADORA OU COLOCAÇÃO INCORRETA - (Viaturas Convertidas ou de fábrica antes de 13/07/2013)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1820050101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1820050101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo ligeiro de passageiros (categoria M1), circulava na via pública não ostentando no canto inferior direito do para-brisas uma Vinheta Identificadora de acordo com o modelo 1 definido no n.º 1 do anexo I da Portaria 196-B/2015, de 02JUL, conjugado com a al. a) nº1 do Art.º 3º da mesma portaria.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CORREDORES DE CIRCULAÇÃO (BUS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860770101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860770101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava indevidamente em via de trânsito reservada ao trânsito de certa espécie de veículos, pelo condutor de veículo de outra espécie.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PASSADEIRAS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2861030201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2861030201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor e único ocupante do veículo, circulava na via pública não tendo cedido a passagem a um peão que já tinha iniciado a travessia da faixa de rodagem, na passadeira.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ROTUNDA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2860310104</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2860310104&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor e único ocupante do veículo, circulava na via pública, não tendo cumprido o dever de ceder a passagem ao veículo matricula XX-XX-XX, que já circulava na rotunda.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ÓLEO NO CHÃO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860790101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860790101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, circulava na via pública, derramando óleo para a via pública, proveniente da zona do motor, colocando assim em causa a segurança rodoviária, nomeadamente a aderência dos pneumátios dos restantes utentes da via pública, podendo resultar um despiste por esse motivo, e cumulativamente um acidente de viação. (Apreensão DUA (Art.º 161 nº1 al. j) do CE) e guia por 15 dias úteis)</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>POLUIÇÃO – ATIRAR OBJETOS VIA PÚBLICA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860790201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860790201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor e único ocupante do veículo, circulava na via pública, atirou (um cigarro) para a via pública, provocando assim a poluição do solo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ARCO SANTO ANTÓNIO (TRATOR AGRÍCOLA) (APÓS 01JAN93)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900820601</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900820601&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo trator agrícola, circulava na via pública, sem utilização da estrutura de proteção em caso de capotagem, com referência à Portaria n.º 489/97, de 15 de julho. ____________________________________________________________________________________________\n1900820602 - Verifiquei que o veículo máquina agrícola, circulava na via pública, sem utilização da estrutura de proteção em caso de capotagem, com referência à Portaria n.º 489/97, de 15 de julho.\n1900820603 - Verifiquei que o veículo máquina florestal, circulava na via pública, sem utilização da estrutura de proteção em caso de capotagem, com referência à Portaria n.º 489/97, de 15 de julho.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>VELOCIDADE MÉDIA TACÓGRAFO DIGITAL – (1ª GERAÇÃO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860270323</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860270323&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Da leitura efetuada ao ficheiro de registo de velocidade ao segundo da \"Unidade-Veiculo\", marca Siemens VDO/Stoneridge, modelo XXX, número de série 1381.1232309007, instalado no veículo, o referido condutor em __/__/____, pelas __H__ conduziu o veiculo, dentro/fora de localidade pelo menos à velocidade média de 97 Km/h durante pelo menos 60 segundos, correspondente à velocidade média de 103 Km/h, deduzido o erro máximo tolerado de 6 Km/h, previsto em III, 2.2.2. do Anexo IB do Regulamento (CE), n.º 3821/85, sendo a velocidade máxima prevista para o veiculo, de 90 Km/h. Junta-se impressão dos dados extraídos da \"Unidade-Veiculo\" referentes ao registo da velocidade ao segundo, efetuados através do programa TachoPlus, comprovativos da infração ___________________________________________________________________________________________________ OBS: (Aconselhável) Retirar os dados da velocidade da VU no ficheiro do TachoPlus e se possível guardar. Imprimir os dados da velocidade do TachoPlus onde diz exatamente o tempo que excedeu (&gt; 60 seg.) a velocidade média e anexar ao auto de contraordenação. NOTA: Segundo Ficha Técnica 09/2026, e a Nota da ANSR 1394452/2026/UFTC_DFPC, fica sem efeito o levantamento dos autos de contraordenação por excesso de velocidade quando registados nos aparelhos de controlo (Tacógrafo).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>VELOCIDADE MÉDIA TACÓGRAFO DIGITAL – (2ª GERAÇÃO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860270323</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860270323&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Da leitura efetuada à impressão dos dados de excesso de velocidade da «Unidade-veículo», do tacógrafo marca Siemens VDO/Stoneridge modelo XXX, com o n.º de serie 1381.1232309007 instalado no veículo, o referido condutor em __/___/___, no período entre as ___h___ e as ___h___ conduziu o veiculo, durante 60 segundos à velocidade de 97 km/h correspondente à velocidade registada de 103 km/h, deduzido o valor do erro máximo tolerado de 6 km/h , previsto no requisito 32) e 33), 3.2.2, Anexo IC Regulamento de Execução( UE) 2016/799 da Comissão de 18 de março de 2016, sendo a velocidade máxima permitida para o veículo de 90 km/h . Junta-se impressão dos dados extraídos da «Unidade-veículo». NOTA: Segundo Ficha Técnica 09/2026, e a Nota da ANSR 1394452/2026/UFTC_DFPC, fica sem efeito o levantamento dos autos de contraordenação por excesso de velocidade quando registados nos aparelhos de controlo (Tacógrafo).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>VELOCIDADE MÉDIA TACÓGRAFO ANALÓGICO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860270323</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860270323&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Através da análise efetuada à folha de registo utilizada no tacógrafo instalado no veículo, marca XXX, modelo XXX, número de série XXX, verifiquei que o condutor em __/__/____, entre as __H__ e as __H__ circulou com o veículo, dentro/fora de localidade, pelo menos à velocidade de XX km/h correspondente à velocidade registada de XX km/h, deduzido o valor do erro máximo tolerado de 6 km/h previsto no III f) 3. b) do Anexo I do Regulamento (UE) n.º 165/2014, sendo a velocidade máxima permitida para o veículo de XX km/h. Junta-se folha de registo. NOTA: Segundo Ficha Técnica 09/2026, e a Nota da ANSR 1394452/2026/UFTC_DFPC, fica sem efeito o levantamento dos autos de contraordenação por excesso de velocidade quando registados nos aparelhos de controlo (Tacógrafo).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ATOS QUE PREJUDIQUEM A CONDUÇÃO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860110201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860110201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei a prática, pelo condutor e único ocupante do veículo, durante a condução, de atos que prejudiquem o exercício da condução com segurança.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>EMBARAÇAMENTO DE TRÂNSITO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860030201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860030201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">As pessoas devem abster-se de atos que impeçam ou embaracem o trânsito ou comprometam a segurança, a visibilidade ou a comodidade dos utilizadores das vias, tendo em especial atenção os utilizadores vulneráveis</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX9\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>09</span><div><strong>PESO / PESAGEM</strong><small>Pesos, eixos e verificações por pesagem</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">2 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PESO BRUTO POR EIXO, REBOCÁVEL E OUTROS VEÍCULOS COM PB &lt;2500 KG</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860570101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860570101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€\n3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública e efetuava um transporte de GRANEL, ao ser submetido à pesagem através das balanças Captels ORA 10, aprovadas pela ANSR através do Desp. N.º 13179/08, de 02MAI, e pelo NMI Certin B. V. (Holanda) através do Certificado de Aprov. CET6377, de 16DEC03, verificadas pelo ISQ em XX/XX/XXXX, acusou no Xº eixo um peso de XXX kg, constando no documento de identificação do veículo o peso máximo para o referido eixo de XXX kg, verificando-se um excesso de XXX kg, com referência ao Art.º 14º Reg. Anexo ao DL n.º 132/2017, de 11 de outubro. Junta-se talão com o número XX. Equipamento verificado em 19SET2017, cumprindo as instruções de utilização para este tipo de balanças, conforme Certificado de Verificação Periódica n.º 201.24/17.16727, de 19SET2017. A pesagem foi efetuada pelo Guarda-Principal XXXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PESO BRUTO EXCEDIDO (PRONTO-SOCORRO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860570101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860570101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€\n3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">O veículo pronto-socorro, efetuava um transporte de um veículo ligeiro de mercadorias de matrícula 46-50-VS conforme folha 002 do caderno de registo n.º 447/W. O veículo pronto-socorro com tara de 5135 KG, acrescido de 2600 KG de tara do veículo transportado sobre o estrado, sendo estas taras equivalentes ao peso em vazio dos veículos referidos, desta forma, este transporte perfazia um peso total de pelo menos 7735 KG, quando o peso bruto máximo admissível é de 7400 KG, conforme documento único automóvel n.º 15615161 6, emitido em 10-10-2018, verificando-se um excesso de pelo menos 335 KG. O pronto-socorro tinha a bordo dois ocupantes, sendo um deles o condutor.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX10\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>10</span><div><strong>TRIÂNGULO / COLETE</strong><small>Pré-sinalização de perigo e equipamento de segurança</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">3 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRIÂNGULO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860880101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860880101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, não se encontrando equipado com o sinal de pré-sinalização de perigo retrorrefletor e de modelo aprovado, sendo legalmente obrigatório.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>COLETE</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860880102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860880102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, não se encontrando equipado com um colete retrorrefletor e de modelo aprovado, sendo legalmente obrigatório.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>COLETE (SEM ETIQUETA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860880102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860880102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública, estando equipado com colete retrorrefletor de modelo não aprovado. Verificado o colete, o mesmo não ostenta a marca de conformidade, nomeadamente as normas harmonizadas NP EN 471 ou NP EN 1150 em referência ao paragrafo 3º da Portaria n.º 311-D/2005. O uso de coletes que não contenham a marca de conformidade prevista é equiparado à sua não utilização.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX11\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>11</span><div><strong>ILUMINAÇÃO / LUZES</strong><small>Iluminação, sinalização luminosa e refletores</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">26 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZ BRANCA PARA A RETAGUARDA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública emitindo uma luz branca dirigida para a retaguarda, não sendo luz de marcha-atrás ou de chapa de matrícula. A respetiva luz é acionada quando o condutor aciona o indicador de mudança de direção para o lado direito ou para o lado esquerdo em virtude de o farolim do lado esquerdo e direito se encontrarem partidos. As luzes referidas anteriormente devem obedecer à convenção de cores e possuir as correspondentes tonalidades bem definidas e uniformes conforme o estipulado na Portaria 851/94, de 22 de setembro no seu paragrafo 23º.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES DELIMITADORAS DA RETAGUARDA/FRONTAIS (REBOQUE/SEMIRREBOQUE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque, fazendo conjunto de veículos com o veículo trator (matrícula XX-XX-XX), com largura superior a 2,10 metros, circulava na via pública não possuindo duas luzes delimitadoras brancas à frente, junto da extremidade lateral do veículo e tão próxima quanto possível do topo do veículo como referido no Regulamento UNECE n.º 48, publicado em 2.7.23, 6.13.1 e 6.13.4.2 no Jornal Oficial da UE, em 16 de janeiro de 2019.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES DELIMITADORAS DA RETAGUARDA/FRONTAIS (TRATOR/PESADO MERCADORIAS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, com largura superior a 2,10 metros, circulava na via pública não possuindo duas luzes delimitadoras brancas à frente, junto da extremidade lateral do veículo e tão próxima quanto possível do topo do veículo como referido no Regulamento UNECE n.º 48, publicado em 2.7.23, 6.13.1 e 6.13.4.2 no Jornal Oficial da UE, em 16 de janeiro de 2019.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES DELIMITADORAS LATERAIS NÃO TRIANGULARES EXCEDENDO 3M ENTRE ELES</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX). Efetuada a medição entre as luzes delimitadoras laterais existentes no lado direito/esquerdo, os mesmos apresentam uma distância de XXX metros, no entanto foi verificado que não existe incompatibilidade nas características do semirreboque para cumprirem a distância regulamentar referida (até 4 metros), não se encontrando em conformidade com o disposto na al. c) do parágrafo 14º, da Portaria 851/94, de 22 de setembro</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES DELIMITADORAS LATERAIS NÃO TRIANGULARES EXCEDENDO 1M DA RETAGUARDA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque, circulava na via pública fazendo conjunto de veículos com trator de mercadorias (matrícula XX-XX-XX). Efetuada a medição entre as luzes delimitadoras laterais existentes e a retaguarda no lado direito/esquerdo do semirreboque, o mesmo apresenta uma distância</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES AZUIS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, utilizando dispositivo de iluminação de cor AZUL dirigidas para a frente, instaladas no para-choques do veículo, encontrando-se os dispositivos de iluminação e sinalização em perfeitas condições de funcionamento e sem qualquer avaria. Estas luzes azuis não se encontram legalmente previstas, conforme disposto na Portaria nº 851/94, de 22 de setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FARÓIS SUJOS - (luz superior dos tratores agrícolas a máquinas automotrizes)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública sendo que os seus farolins se encontravam com bastante sujidade o que originava uma má perceção das luzes de travagem/presença/mudança de direção. As luzes devem ser emitidas por dispositivos bem regulados e limpos, não podendo ser objeto de quaisquer interferências que reduzam a sua intensidade luminosa, conforme o estipulado na Portaria 851/94, de 22 de setembro no seu paragrafo 24º.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FARÓIS PINTADOS - (luz superior dos tratores agrícolas a máquinas automotrizes)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública sendo que os seus farolins se encontravam pintados/com peliculas coloridas o que originava uma má perceção das luzes de travagem/presença/mudança de direção. A coloração, quando exigida, não deverá resultar de pintura ou aplicações superficiais nos dispositivos luminosos, mas ser propriedade dos elementos transparentes ou translúcidos utilizados, conforme o estipulado na Portaria 851/94, de 22 de setembro no seu paragrafo 26º.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES NÃO HOMOLOGADAS (LEDS TUNNINGS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, utilizando dispositivo de iluminação de cor branca dirigidas para a frente, instaladas no para-choques do veículo, encontrando-se os dispositivos de iluminação e sinalização em perfeitas condições de funcionamento e sem qualquer avaria. Estas luzes não se encontram legalmente previstas, conforme disposto na Portaria nº 851/94, de 22 de setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES NÃO HOMOLOGADAS/N.º MÁXIMO DE LUZES (BARRA DE LED)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública, utilizando dispositivo de iluminação de cor branca (barra LED com 6 luzes adicionais) dirigidas para a frente, instaladas sobre a cabine do veículo, encontrando-se os dispositivos de iluminação sem qualquer avaria. O conjunto de luzes atrás referido e instalado no veículo, não se encontram legalmente previstos, vindo a alterar o número máximo de luzes permitida pela Portaria nº 851/94, de 22 de setembro e Regulamento UNECE n.º 48, publicado em 6.1.2 no Jornal Oficial da UE em 16 de janeiro de 2019.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES NÃO HOMOLOGADAS (ARVORE NATAL/NOME)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública utilizando luzes dirigidas para a frente não previstas legalmente em regulamento. Nomeadamente tinha dirigiras para a frente cerca de XXXXX localizadas XXXX não estando estas conforme o estipulado nos parágrafos nº2; nº4; nº5; nº7; nº9 e nº10 da portaria 851/94, de 22 de setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES AVARIADAS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590401 Não Repara 1860590402 Repara</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590401 Não Repara 1860590402 Repara&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, utilizando dispositivo de iluminação de cor branca dirigidas para a frente, sendo que o a luz de cruzamento se encontrava fundida do lado esquerdo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES DE ESTRADA (MÁXIMOS) SEM ENCADEAMENTO (RADAR)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860610605</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860610605&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, fazendo utilização de máximos (luzes de estrada) no cruzamento com outro veiculo não provocando encandeamento, com o intuito de informar os outros condutores da presença de radar que se encontrava instalado em XXXXXXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES NEVOEIRO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860610201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860610201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do veículo circulava na via pública, utilizando as luzes de nevoeiro à frente, não o justificando, perante as condições meteorológicas atuais.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LUZES DE MUDANÇA DE DIREÇÃO (PISCAS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860610201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860610201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor circulava na via pública, não sinalizando a manobra de mudança de direção (ou de via de transito, ou de início de ultrapassagem ou de inversão do sentido de marcha) durante a sua realização.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PRONTO-SOCORRO NÃO USA AVISADOR</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860230401</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860230401&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que a referida viatura, especial pronto-socorro, circulava na via pública, efetuando o transporte de viatura acidentada/avariada de matrícula XX-XX-XX, conforme o caderno de registos nº XXX/Guia de transporte nº XXX, sem fazer utilização dos avisadores especiais de cor amarela. De referir que, os avisadores especiais de cor amarela se encontravam em perfeitas condições de utilização no momento da fiscalização.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>INSTALAÇÃO DE AVISADOR LUMINOSO ESPECIAL AMARELO(Se não retirar, apr. DUA - nº7 Art.º23 CE, guia 15 dias úteis - nº5 Artº161 CE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900230502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900230502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 500€ 2500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública, possuindo avisadores luminosos especiais de cor amarelo, afeto a veículo ligeiro de mercadorias, sem que o condutor possuísse autorização do IMT a autorizar a sua instalação, conforme o disposto no Art.º 5º da Portaria 311-C/2005, de 24 de março. Os referidos avisadores luminosos possuem inscritos o seguinte: “XXX”. Não foi possível retirar os referidos avisadores luminosos, pelo que irá ser apreendido o documento único automóvel com o nº XXX, sendo que foi nomeado fiel depositário o condutor do veículo até ser possível remover e apreender os avisadores luminosos. ___________________________________________________________________________________________ \nOBS: Não está sujeita a autorização do IMT, nem averbamento no certificado de matrícula, sendo a instalação obrigatória quando seja excedido o comprimento de 20 metros ou largura superior a 3,50 metros, nos termos do n.º2 Art. 5º RAE, aprovado pela Portaria 311-C/2005, de 24 Março. Fora a atividade de transporte especial estes veículos podem circular com os avisadores instalados, não sendo permitida a sua UTILIZAÇÃO, conformo disposto no n.º 4, Art. 5º do mesmo diploma. Esclarecimento IMTT 010884 de 27-03-2013.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>UTILIZAÇÃO DE AVISADOR LUMINOSO ESPECIAL AMARELO (Se não retirar, apr. DUA - nº7 Art.º23 CE, guia 15 dias úteis - nº5 Artº161 CE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900230504</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900230504&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 500€ 2500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública, possuindo avisadores luminosos especiais de cor amarelo, afeto a veículo ligeiro de mercadorias, sem que o condutor possuísse autorização do IMT a autorizar a sua instalação, conforme o disposto no Art.º 5º da Portaria 311-C/2005, de 24 de março. Os referidos avisadores luminosos possuem inscritos o seguinte: “XXX”. Não foi possível retirar os referidos avisadores luminosos, pelo que irá ser apreendido o documento único automóvel com o nº XXX, sendo que foi nomeado fiel depositário o condutor do veículo até ser possível remover e apreender os avisadores luminosos.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>UTILIZAÇÃO DE AVISADOR LUMINOSO SEM NECESSITAR</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900230505</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900230505&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública, utilizando de avisador luminoso especial (azul/amarelo) não sendo o necessário o seu uso.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>UTILIZAÇÃO DE AVISADOR LUMINOSO AVARIADO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900230801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900230801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, que, em razão do serviço a que se destina, deva parar ou circular em marcha lenta na via pública, cujo avisador luminoso especial não se encontra em funcionamento.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>UTILIZAÇÃO DE AVISADOR LUMINOSO EM MAU FUNCIONAMENTO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900230802</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900230802&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, que, em razão do serviço a que se destina, deva parar ou circular em marcha lenta na via pública, cujo avisador luminoso especial não se encontra em funcionamento.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CIRCULAÇÃO DE VEÍCULO DE MARCHA LENTA SEM ESTAR EQUIPADO C/ AVISADOR LUMINOSO ESPECIAL</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900230401</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900230401&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo a motor, circulava na via pública, que em razão do serviço a que se destina, deva parar ou deslocar-se em marcha lenta na via pública, encontrando-se o avisador luminoso especial a funcionar defeituosamente.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>NÃO ASSINALAR MARCHA LENTA ESTANDO EQUIPADO COM AVISADOR LUMINOSO ESPECIAL (PARADO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900230402</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900230402&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor circulava na via pública, não utilizando de avisador luminoso especial amarelo por veículo a motor que deva parar na via pública em razão do serviço a que se destina, conforme disposto no n.º 4 do artigo 23º do CE e ao n.º 1 do art.º 5 da Portaria 311-C/2005, de 24 março.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>NÃO ASSINALAR MARCHA LENTA ESTANDO EQUIPADO COM AVISADOR LUMINOSO ESPECIAL (MOVIMENTO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900230403</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900230403&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor circulava na via pública, não utilizando de avisador luminoso especial amarelo por veículo que em razão do serviço a que se destina, desloca-se em marcha lenta, conforme disposto no n.º 4 do artigo 23º do CE e ao n.º 1 do art.º 5 da Portaria 311-C/2005, de 24 março.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>XÉNON - (Apreensão Veículo/guia até destino, se não remover no local)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública utilizando kit de luzes xénon/luzes de xénon sem sistema de regulação da inclinação vertical de faróis automática/sem dispositivos de limpeza de faróis, não homologado e aprovado pelo IMT.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>Sem luz de chapa de matrícula</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860590401 Não Repara 1860590402 Repara</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860590401 Não Repara 1860590402 Repara&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei a condução de veículo que não disponha de sinalização luminosa legalmente fixada, nomeadamente sem luz de chapa de matrícula. Não estando conforme o Paragrafo 13º da Portaria n.º 851/94, de 22 Set. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX12\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>12</span><div><strong>TRANSFORMAÇÕES / CARACTERÍSTICAS</strong><small>Transformações e alterações às características do veículo</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">15 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSFORMAÇÃO VEÍCULOS (PARA-CHOQUES) - (Apreensão Veículo e Guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861150201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861150201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública fazendo conjunto de veículos com trator de mercadorias (XX-XX-XX), com transformação de semirreboque/caixa de carga sem estar legalmente autorizada, uma vez que o mesmo não dispunha de para-choques à retaguarda. De referir que tal dispositivo, reveste a natureza de segurança passiva, sendo importante para a absorção de colisões e/ou choques, limitando os danos que daí advenham. O referido veículo apresentava os dispositivos de iluminação/sinalização luminosa (farolins) numa posição não fixa (nas palas anti projeção) e as placas modelo 4, no próprio quadro do veículo. A destacar ainda a presença de saliências agressivas e de vestígios de soldas naquilo que já foi em tempos um dispositivo para-choques. Tal alteração por norma, é efetuada em vista a facilitar a descarga de resíduos líquidos ou de alcatrão.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SISTEMA AdBLUE ANULADO - (Apreensão Veiculo e Guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública utilizando um dispositivo eletrónico com o qual não foi aprovado. O mesmo está equipado com sistema AdBlue, que tem que ser abastecido regularmente e tem como objetivo reduzir significativamente as emissões de óxido de azoto prejudiciais ao ambiente e dessa forma cumprir com os rigorosos limites de emissões de gases estabelecidos pelas normas europeias. Para que não seja necessário o seu reabastecimento, o veículo estava equipado com um dispositivo \"Emulador\", que faz com que a informação de necessidade de reabastecimento não chegue à centralina do veículo, e o mesmo possaa circular sem possuir este fluído. De salientar que o condutor desconhecia que o veículo possuí este dispositivo, apenas tinha conhecimento que o mesmo não era abastecido com Adblue.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ALARGADORES - (Apreensão Veiculo e Guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública utilizando alargadores de rodas, colocados nos eixos dianteiros ou traseiros sem estar homologado e aprovado pelo IMT, excedendo os contornos envolventes do veiculo e / ou aumentando assim a largura entre eixos do veiculo, com ref.ª ao Despacho DGV n.º 33/96, de 19 de setembro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARATERÍSTICAS LIVRETE - BOLA DE REBOQUE - (Apreensão Veiculo e Guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, cujas características não confiram com as mencionadas no documento de que o identifica. O referido veículo possuía instalado à retaguarda uma bola de reboque, sendo que no certificado de matrícula do mesmo no campo (O.1) peso bruto rebocável com travão e (O.2) peso bruto rebocável sem travão, assim como no campo (Z.3) anotações especiais não constava qualquer menção, com referência ao Fax DGV n.º 455/2006, de 25 de maio.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PELÍCULAS SOBREPOSIÇÃO - (Apreensão Veiculo e Guia até ao destino, se não remover no local)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública com películas coloridas afixadas no para-brisas/nos vidros laterais frente/traseiros, PBRI/FPB (frente pilar B) / TPB (trás pilar B), sendo consideradas acessórios. Nas películas instaladas podia ver-se a marcação SunTek 2M ~ D5497, pertencente à pelicula da marca SunTek 2M D5497, em que uma das caraterísticas é ser incolor. Através da sobreposição, para além das peliculas constantes no certificado de matricula do veículo sem coloração, foram instaladas películas de cor escura, o que se verificou após serem removidas, na presença do agente autuante e após o proprietário ter aceito remove-las no ato da fiscalização, com ref.ª n.º 1 do Art.º 25º do Regulamento aprovado pelo DL 40/2003, de 11 de março.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PELÍCULAS NÃO HOMOLOGADAS - (Apreensão Veiculo e Guia até ao destino, se não remover no local)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública utilizando componentes que não tenham sido legalmente aprovados. O veículo possuía instalado nos vidros laterais da frente pilar B (FPB)/ trás pilar B (TPB) e no para-brisas (PBRI) películas coloridas não homologadas, com ref. ª n.º 1 do Art.º 25º do Regulamento aprovado pelo DL 40/2003, de 11 de março. O condutor retirou as películas no ato da fiscalização, na presença do agente autuante e após o proprietário ter aceito remove-las no ato da fiscalização.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>GUINCHO – ROLL BAR – SNORKEL – BACKETS (Apreensão Veiculo e Guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública utilizando bancos (backets) (ou volante desportivo que não seja de origem ou pedais sem proteção antiderrapante ou escape de rendimento (ou linha de escape direta ou sem panela / linha de escape ou panela de escape sem homologação) ou amortecedores / molas de rebaixamento ou roll bar ou snorkel ou guincho ou admissão de ar / filtro de ar cónico (não de origem), sem estar homologado e aprovado pelo IMT, alterando assim as características de homologação e construtivas com que o veiculo foi aprovado.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSFORMAÇÃO DE VEÍCULO (INDIE CAMPERS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861150201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861150201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, como sendo um ligeiro de mercadorias, no entanto trata-se de uma viatura ligeira equipada com duas camas, armários, utensílios de cozinha, não estando separada fisicamente com um separador entre a cabine e a caixa de carga.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSFORMAÇÃO DE VEÍCULO (VELOCÍPEDE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861150201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861150201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, como sendo velocípede de passageiros, no entanto trata-se de um ciclomotor, uma vez que foi alvo de transformação, tendo sido instalado um motor de combustão interna, que permitia o movimento do mesmo, sem que o condutor utilizasse os pedais, sem que tivesse sido legalmente autorizado pelo IMT.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PELÍCULAS HOMOLOGADAS NÃO AVERBADAS - (Apreensão DUA e passar guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861181001</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861181001&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública com películas coloridas afixadas nos vidros da frente/traseiros, FPB (frente pilar B)/ TPB (trás pilar B), marca XXXX, n.º de aprovação XXXX, sendo consideradas acessórios. As peliculas encontravam-se homologadas, conforme Inspeção Extraordinária n.º XXXX, sendo que, não estão averbadas no certificado matricula do veículo, com ref.ª n.º 3 do Art.º 25º do Regulamento aprovado pelo DL 40/2003, de 11 de março.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARACTERÍSTICAS NÃO MENCIONADAS NO LIVRETE (PLATAFORMA ELEVATÓRIA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861181001</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861181001&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, cujas características não confiram com as mencionadas no documento de que o identifica, uma vez que o mesmo tem uma plataforma elevatória montada à retaguarda, no entanto não consta qualquer anotação especial no certificado de matricula, conforme o disposto do Oficio IMT nº 4596/2008, de 30 de outubro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>COBERTURA SISTEMA DE ROLDANAS NA CAIXA SEMI-REBOQUE (Apreensão DUA e passar guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861181001</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861181001&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido semirreboque circulava na via pública, fazendo conjunto com o trator de matrícula XX-XX-XX, possuindo de forma permanente uma cobertura fixa à caixa (extensível em toda a caixa com um sistema de roldanas que se move), não estando a mesma averbada no documento único automóvel do semirreboque com o nº XXX emitido em XX/XX/XXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>COR DIFERENTE DUA (Apreensão DUA e passar guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861181001</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861181001&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, cujas características não conferem com as mencionadas no certificado de matricula do veículo com o nº XXX. O referido veículo estava identificado com a cor branca, sendo a mesma predominante, juntamente com outras cores.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARACTERÍSTICAS NÃO MENCIONADAS NO LIVRETE (PNEUMÁTICOS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861181001</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861181001&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, possuindo pneumáticos com as medidas XXX/XXX não constantes no documento único automóvel do veículo com o nº XXX emitido em XX/XX/XXXX. No documento único automóvel constam as medidas dos pneumáticos permitidas são: XXX/XXX e XXX/XXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>BYPASS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861140502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861140502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública, fazendo conjunto de veículos com o semirreboque de matrícula XXXX, possuíndo instalada uma válvula de escape (Bypass), não regulamentar sem estar homologada e aprovada pelo IMT, IP, alterando assim as suas características construtivas com que foi aprovado. A válvula é ativada através de um comando instalado no interior da cabine, que quando acionada altera o normal rumo dos gases de escape, fazendo com estes circulem por um outro circuito que não o original e sem passarem pela panela de escape. Aliada a esta alteração está também a alteração do nível de ruido provocado pela saída dos gases de escape. No documento do veículo não consta qualquer anotação às alterações mencionadas. O referido condutor removeu a válvula de escape (Bypass) no local de fiscalização, regularizando a situação.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX13\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>13</span><div><strong>IPO / SEGURO</strong><small>Inspeção periódica e seguro automóvel</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">9 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>IPO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1780070101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1780070101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, circulava na via pública sem que tivesse sido sujeito a inspeção periódica obrigatória dentro do prazo legal, deveria ter ido a nova IPO até dia XX-XX-XXXX conforme ficha de IPO nº XXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>IPO DEFICIÊNCIAS TIPO 2</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1780130201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1780130201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, circulava na via pública efetuando transporte de (XX passageiros/carga – especificar a carga), tendo reprovado em inspeção por apresentar deficiências do tipo 2. O veículo circulava com ficha de inspeção n.º XXXX com validade até XX/XX/XXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>IPO DEFICIÊNCIAS TIPO 2 – FICHA CADUCADA (Apreensão Veiculo e Guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1780070101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1780070101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, circulava na via pública tendo reprovado em inspeção, por apresentar deficiências do tipo 2. O veículo circulava com ficha de inspeção n.º XXXX caducada desde XX/XX/XXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>IPO DEFICIÊNCIAS TIPO 3</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1780130301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1780130301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo, circulava na via pública, tendo reprovado em inspeção, por apresentar deficiências do tipo 3, para além da deslocação ao local de reparação e posterior regresso ao centro de inspeção. O veículo foi sujeito a inspeção em XX/XX/XXXX no centro de inspeções XXXXXX conforme ficha de inspeção n.º XXXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CIRCULAÇÃO COM DUA APREENDIDO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861610801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861610801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor circulava na via pública, cujo documento de identificação tenha sido apreendido, à data de XX/XX/XXXX, por XXXX. (VER QUADRO).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEGURO MOTOCICLO/AUTOMÓVEL</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2861500102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2861500102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 500€ 2500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública sem que tivesse sido efetuado seguro de responsabilidade civil obrigatório. No ato da fiscalização foi consultado o site \"Segurnet\" e ASF, onde consta que o seguro se encontra anulado desde XX-XX-XXXX a pedido do Segurado. O último pagamento efetuado do seguro para o veículo supracitado foi em XX-XX-XXXX, pelas XXHXX, conforme documento que segue em anexo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEGURO CICLOMOTOR/REBOQUES/TRATOR AGRÍCOLA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2861500101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2861500101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública sem que tivesse sido efetuado seguro de responsabilidade civil obrigatório. No ato da fiscalização foi consultado o site \"Segurnet\" e ASF, onde consta que o seguro se encontra anulado desde XX-XX-XXXX a pedido do Segurado. O último pagamento efetuado do seguro para o veículo supracitado foi em XX-XX-XXXX, pelas XXHXX, conforme documento em anexo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEGURO GARAGISTA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2861500102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2861500102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 500€ 2500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública sem que o condutor, durante o exercício da atividade de compra e ou venda de veículos, tivesse efetuado seguro de garagista. No ato da fiscalização foi consultado o site \"Segurnet\" e ASF, onde não consta qualquer informação. Estão obrigados os garagistas, bem como quaisquer pessoas ou entidades que habitualmente exercem a atividade de fabrico, montagem ou transformação, de compra e ou venda, de reparação, de desempanagem ou de controlo do bom funcionamento de veículos, a segurar a responsabilidade civil em que incorrem quando utilizem, por virtude das suas funções, os referidos veículos no âmbito da sua atividade profissional, com refª ao disposto no nº3 do artº6 e n.º1, do artº7 do DL nº 291/2007, de 21AGO, alterado pelo DL nº 153/2008.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEGURO ALIENAÇÃO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2861500102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2861500102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 500€ 2500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública sem que tivesse sido efetuado seguro de responsabilidade civil obrigatório, uma vez que o contrato de seguro não se transmite em caso de alienação do veículo, cessando os seus efeitos às 24 horas do próprio dia da alienação, salvo se for utilizado pelo tomador do seguro inicial para segurar novo veículo. No ato da fiscalização foi consultado o site \"Segurnet\" e ASF, onde consta que o seguro se encontra em vigor até XX-XX-XXXX em nome do antigo proprietário, no entanto o mesmo já não se encontra válido em virtude de o veículo ter sido adquirido desde XX-XX-XXXX, pelo proprietário supramencionado, conforme documento que segue em anexo, com refª ao disposto no n.º1, do artº21 do DL nº 291/2007, de 21AGO, alterado pelo DL nº 153/2008.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX14\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>14</span><div><strong>MATRÍCULAS</strong><small>Chapas de matrícula, fixação e requisitos regulamentares</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">13 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRICULA DESCOLORADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, possuía chapa de matrícula da retaguarda não obedecendo aos termos fixados em regulamento. A referida chapa de matrícula encontra-se descolorada impossibilitando a sua correta leitura, conforme disposto no Art.º 5º RNCMA, aprovado pelo DL 54/05, de 03 de março.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRICULA NÃO REGULAMENTAR MODELO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública possuindo chapa de matrícula à frente e da retaguarda de modelo I e III respetivamente, ambos do anexo II do RNCMA aprov. p/ DL 54/05, 03MAR, não obedecendo aos termos fixados em regulamento, devendo ostentar o Modelo I do anexo III do RNCMA aprov. p/ DL 54/05, 03MAR para a frente e para a retaguarda, pois o veículo foi matriculado a XX-XX-XXX (Entre 1 de janeiro de 1992 e 31 de dezembro de 1997), com referência à al. b) nº 1 Art.º 5 do RNCMA aprov. p/ DL 54/05, 03MAR.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRICULA NÃO REGULAMENTAR SEM ANO/MÊS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública possuía chapa de matrícula da retaguarda não obedecendo aos termos fixados em regulamento, a referida chapa de matrícula não possuía no lado direito a indicação de ano/mês de fabrico, legalmente obrigatório, pois foi o veículo foi matriculado após 01 de janeiro de 1998, com referência ao nº 4, Art.º 5 do RNCMA aprovado pelo DL 54/05, de 03 de março.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRICULA ALTURA NÃO REGULAMENTAR - (altura + de 1200mm ou - 200 mm bordo inferior)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, possuía chapa de matrícula da retaguarda não obedecendo aos termos fixados em regulamento, com referência ao nº 3 do Art.º 7º do RNCMA aprovado pelo DL 54/05, de 03 de março. A referida matrícula distava do solo uma distância de XXX centímetros.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRICULA TAPADA/PARTIDA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>Avaria reparada 1861180802Não repara 1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;Avaria reparada 1861180802Não repara 1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€ 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, tendo a chapa de matricula da retaguarda encoberta com lama tapando as letras e números, impedindo a sua correta leitura, diretamente ou através de aparelhos de controlo rodoviário, com referência ao nº 4 do Art.º 9º do RNCMA aprovado pelo DL 54/05, de 03 de março. A respetiva avaria não/foi reparada no local.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRICULA MEDIDA NÃO REGULAMENTAR - (altura +/- de 11 cm/comprimento +/- de 52cm)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, possuía chapa de matrícula da retaguarda não obedecendo aos termos fixados em regulamento, conforme disposto no nº 1 do Art.º 5º do DL 106/2006 de 08 de junho, com referência ao nº 1 do Art.º 5 do RNCMA aprovado pelo DL 54/05, de 03 de março. A referida matrícula (modelo I do Anexo IV) tem 12 cm de altura e 50 cm de comprimento.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRICULA AMOVÍVEL</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>Avaria reparada 1861180802Não repara 1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;Avaria reparada 1861180802Não repara 1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€ 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, tendo a chapa de matricula da retaguarda, fixada de forma inamovível, (fixada com braçadeira plástica) não obedecendo aos termos fixados em regulamento, conforme nº 5 e 6 do Art.º 7 do RNCMA aprovado pelo DL 54/05, de 03 de março.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MATRICULA ENCOBERTA VEÍCULO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>Avaria reparada 1861180802Não repara 1861180801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;Avaria reparada 1861180802Não repara 1861180801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€ 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo, circulava na via pública, tendo a chapa de matricula da retaguarda, total ou parcialmente encoberta por elemento do veículo ou por qualquer carga transportada, não obedecendo aos termos fixados em regulamento, conforme nº 5 do Art.º 7 do RNCMA aprovado pelo DL 54/05, de 03 de março.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM CHAPA DE MATRICULA - (Apreensão Veiculo e Guia até ao destino)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180803</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180803&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, sem chapa de matricula à retaguarda.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>VEÍCULO NÃO MATRICULADO - (Apreensão Veículo)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861170101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861170101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo a motor (ou reboque) circulava na via pública não se encontrando matriculado nos termos legais. O veículo é da marca XXX, do modelo XXX e tem como número de quadro XXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CICLOMOTOR/AGRÍCOLA NÃO MATRICULADO - (Apreensão Veículo)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861170102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861170102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o ciclomotor (ou veículo agrícola) circulava na via pública não se encontrando matriculado nos termos legais. O veículo é da marca XXX, do modelo XXX e tem como número de quadro XXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MÁQUINA INDUSTRIAL NÃO MATRICULADA - (Apreensão Veículo)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861170101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861170101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que a máquina industrial de cor amarela, tipo RE “Retroescavadora”, com peso bruto superior a 300Kg, constante do Anexo I do DL. 107/2006, com o número de quadro NH 85-4PT/E, com o chassi n.º 031023607, do ano 1999, circulava na via pública, não se encontrando a mesma matriculada nos termos legais. Conforme o Art.º 36 do DL 107/2006. A mesma deveria possuir chapa de matrícula nos termos nº.11 Art.º5 do DL 54/2005. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>REBOQUE NÃO MATRICULADO - (Apreensão Veículo)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861170101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861170101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o reboque com Nº Quadro: WHD122314T0086719, circulava na via pública, fazendo conjunto de veículo, com veículo ligeiro de matrícula XX-XX-XX, apresentava chapa de instalação com um peso bruto de 1200 Kg, não estando o mesmo matrículado. O referido reboque possuía um chapa de matrícula artesanal com o número de matrícula do veículo ligeiro. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX15\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>15</span><div><strong>DOCUMENTOS</strong><small>Documentos do veículo e do condutor</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">2 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>DOCUMENTOS DO VEÍCULO - NÃO APRESENTA NA HORA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900850201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900850201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei no ato fiscalização que o condutor não se fazia acompanhar de Certificado de Matrícula, Documento Inspeção Veículo bem como Certificado de Seguro válido. Encetadas diligências apurou-se que o veículo se encontrava com seguro válido/não se encontrava apreendido à data fiscalização.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>DOCUMENTOS DO CONDUTOR - NÃO APRESENTA NA HORA NEM MOSTRA NA APLICAÇÃO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1900850201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1900850201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei no ato fiscalização que o condutor não se fazia acompanhar de Carta de Condução bem como Cartão de Cidadão, nem foi substituída por carta de condução digital, nos termos a definir por portaria dos membros do Governo responsáveis pelas áreas da administração interna, da modernização administrativa e dos transportes.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX16\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>16</span><div><strong>ADR — MERCADORIAS PERIGOSAS</strong><small>Transporte rodoviário de mercadorias perigosas</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">3 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CIRCULAÇÃO CONDICIONADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860100201</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860100201&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 150€\n750€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo de mercadorias, afeto ao transporte de mercadorias perigosas sinalizadas com painel laranja, circulava na via pública em infração a regulamento que condiciona permanentemente a sua circulação. O veículo realizava o transporte de mercadorias perigosas, da classe ____, número de perigo ____ e de ONU _____, e circulava em XXXX, peças XX:XX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CIRCULAÇÃO COM LUZES CRUZAMENTO DESLIGADAS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860610301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860610301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€\n150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei veículo de mercadorias, afeto ao transporte de mercadorias perigosas sinalizadas com painel laranja, circulava na via pública, durante o dia, sem as luzes de cruzamento acesas e não sendo imposta a utilização de outras luzes.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CIRCULAÇÃO CONDICIONADA PONTE 25 DE ABRIL/VIADUTO NORTE</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1560030101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1560030101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 498,80€\n2493,99€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo de mercadorias afeto ao transporte de mercadorias perigosas sinalizadas com painel laranja, circulava na via pública em infração a regulamento que condiciona a sua circulação, desobedecendo ao condicionamento imposto por legislação especial. O veículo realizava o transporte de mercadorias perigosas, da classe ____, número de perigo ____ e de ONU _____, e circulava em XXXX, pelas XX:XX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX17\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>17</span><div><strong>AUTOESTRADAS</strong><small>Circulação, paragem e regras específicas em autoestrada</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">11 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CIRCULAR NA FAIXA NÃO SENDO O MAIS A DIREITA AUTO-ESTRADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3860130303</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3860130303&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo transitava, em autoestrada, não circulando na via mais à direita, encontrando-se a mesma totalmente livre a sua circulação. O veículo circulou numa extensão de “cerca de 3 quilómetros”, existindo três vias de trânsito naquela faixa de rodagem. Não se encontrando a efetuar qualquer manobra de ultrapassagem ou mudança de direção, uma vez que era o único veículo que circulava naquele local aquela data e hora, para além da viatura da patrulha que circulava na sua retaguarda na via mais a direita. O condutor era o único ocupante da viatura.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CIRCULAR NA BERMA DA AUTOESTRADA (VIA EQUIPARADA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3860170103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3860170103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do referido veículo circulava na via pública, utilizando a berma de modo a evitar o elevado fluxo de trânsito.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PARAGEM EM BERMA AUTOESTRADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2860720208</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2860720208&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo se encontrava imobilizado em berma de autoestrada, não se verificando emergência ou de avaria mecânica.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CIRCULAR VIA ESQUERDA EM AUTOESTRADA (3 OU + VIAS) PESADO MERCADORIAS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2860740101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2860740101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do referido veículo pesado de mercadorias, circulava em autoestrada, não utilizando, uma das duas vias de trânsito à sua direita, utilizando para o efeito a via mais à esquerda. (ou conjunto de veículos de comprimento superior a 7 m).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ULTRAPASSAR PELA DIREITA EM AUTOESTRADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3860360103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3860360103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do referido veículo circulava na via da esquerda da autoestrada, local onde existem três vias de trânsito no mesmo sentido, sendo que a dado momento iniciou uma manobra de ultrapassagem pela direita a dois veículos que o precediam (um na via da esquerda e outro na via central). O condutor utilizou a via mais à direita para realizar a manobra sendo que após a sua conclusão retomou a via do meio a fim de ultrapassar veículos.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CEDÊNCIA DE PASSAGEM EM RAMAL DE ACESSO AUTOESTRADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3860170103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3860170103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do referido veículo circulava na via pública, não cumprindo o dever de ceder passagem ao entrar, por ramal de acesso, em autoestrada (ou em via reservada a automóveis e motociclos).</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>PARAGEM EM FAIXA DE RODAGEM AUTOESTRADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3860720209</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3860720209&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo se encontrava imobilizado em plena faixa de rodagem da autoestrada, junto aos pórticos de portagem, devido a ter dúvidas qual a portagem escolher, não se verificando emergência ou avaria mecânica, colocando em perigo os demais utentes da via.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>MARCHA-ATRÁS AUTOESTRADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3860720211</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3860720211&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 500€ 2500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo se encontrava a efetuar a manobra de marcha-atrás em plena faixa de rodagem da autoestrada, junto aos pórticos de portagem, devido a ter dúvidas qual a portagem escolher, colocando em perigo os demais utentes da via.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SAÍDA AUTOESTRADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860730301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860730301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 250€ 1250€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na autoestrada na via de trânsito mais à esquerda, e no nó de XXX mudou repentinamente da via transito mais à esquerda para a saída da autoestrada, não tendo ocupado com a necessária antecedência, a via de trânsito mais à direita e não entrando na via de abrandamento logo que possível.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ULTRAPASSAR RETOMANDO DIREITA COM PERIGO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>2860380204</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;2860380204&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do referido veículo iniciou realização de manobra de ultrapassagem sem o condutor se ter certificado que podia retomar a direita sem perigo para aqueles que aí transitam, estando na iminência de causar um acidente não fosse o condutor do veículo XX-XX-XX, estar com atenção ao meio envolvente.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRÂNSITO DE PEÃO EM AUTOESTRADA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860720101</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860720101&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei o trânsito de peão (Arguido) em autoestrada, pela berma, sem colete retrorrefletor, no local supracitado. O referido peão referiu que circulava na referida via porque …</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX18\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>18</span><div><strong>RHLC — HABILITAÇÃO / CONDUTORES</strong><small>Habilitação, títulos, categorias e restrições à condução</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">34 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>NÃO COMUNICAÇÃO DA ALTERAÇÃO DE RESIDÊNCIA PELO PROPRIETÁRIO DO VEÍCULO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180501</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180501&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 30€ 150€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, sem que o seu proprietário tivesse comunicado à autoridade competente, no prazo de 60 dias, a mudança de residência e requerido o respetivo averbamento.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>NÃO COMUNICAÇÃO DA ALTERAÇÃO PROPRIEDADE DO VEÍCULO PELO ADQUIRENTE</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, sem que o pelo adquirente comunicasse à autoridade competente para a matrícula (IMT), no prazo de 60 dias, a aquisição do referido direito. Segundo declarações do arguido e conforme documento de requerimento de registo automóvel, que se anexa, a respetiva alteração de propriedade do veículo supracitado, está datada de XX-XX-XXXX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>DUA EXTRAVIADO/MAU ESTADO DE CONSERVAÇÃO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861180601</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861180601&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, sem que o seu proprietário tivesse solicitado a substituição do documento de identificação do veículo por o mesmo se ter extraviado/se encontrar em mau estado de conservação.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CIRCULAÇÃO COM DUA APREENDIDO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861610801</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861610801&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor circulava na via pública, cujo documento de identificação tenha sido apreendido, à data de XX/XX/XXXX, por XXXX, conforme disposto na al. _) no nº1 do art.º 161 do CE.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CATEGORIA CADUCADA - (Se for titulo estrangeiro caducado é CRIME, nos termos do RHLC)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901300701</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901300701&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor, conduzia na via pública o veículo supracitado, tendo a sua carta de condução com o nº P-XXXXXXX emitida em XX-XX-XXXX com a respetiva categoria \"C e C1\" caducada desde XX-XX-XXXX mantendo-se validada a categoria \"A1, A, B, B1\" até XX-XX-XXXX não tendo a mesma ultrapassado o prazo de dez anos.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>NÃO COMUNICAÇÃO DE RESIDÊNCIA EM PORTUGAL (Países Membros da EU “28”)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901211405</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901211405&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor do veículo circulava na via pública com título de condução válido, emitido por Estado-Membro da União Europeia, não tendo efetuado comunicação da alteração, no prazo de 60 dias, da residência em território português, por titular de título de condução emitido por outro Estado-Membro do Espaço Económico Europeu que tenha fixado residência em Portugal, à entidade competente para a emissão das cartas de condução, conforme n.º 3 art.º 15.º do Anexo ao DL n.º 138/2012 (RHLC), conjugado com n.º 14 do art.º 121.º do CE.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>NÃO COMUNICAÇÃO DE RESIDÊNCIA EM PORTUGAL 2 ANOS (Validade Administrativa “Vitalícia”)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901300701</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901300701&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor, conduzia na via pública o veículo supracitado, com título de condução que não menciona termo de validade, emitido por Estado-Membro da União Europeia ou Espaço Económico Europeu, não tendo revalidado o título de condução e tenha fixado residência em Portugal há mais de 2 anos, conforme n.º 4 e 5 do art.º 13.º do RHLC.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO A2 SEM AVERBAMENTO PARA CAT A + 2 ANOS</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901211402</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901211402&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor, conduzia na via pública o veículo supracitado, não cumprindo as adaptações impostas relativas ao veículo, registadas no título de condução. O condutor possui habilitação no título de condução de categoria A2 desde XX-XX-XXXX e circulava conduzindo um veículo para o qual deveria ter averbado no título de condução categoria A, uma vez que o mesmo já tem mais de 2 anos de habilitação de categoria A2 e mais de 24 anos de idade. Pode conduzir veículos de categoria A, desde que tenha averbado no título de condução a respetiva categoria.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CATEGORIA CADUCADA IDADES</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901300701</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901300701&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido condutor, conduzia na via pública o veículo supracitado, para a qual o título de condução se encontra caducado. O referido condutor deveria ter revalidado a categoria B e B1 até ao dia 21-07-2015 (data em que perfez 50 anos), como faz referência al. a) nº2 art.º 9 DL 138/2012, alterado pelo DL 37/2014.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO RESTRIÇÃO 999 (CE + DE 67 ANOS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901300701</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901300701&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido condutor, conduzia na via pública o veículo supracitado, da categoria CE cujo peso bruto excedia 20.000 Kg sendo o peso do trator (Peso Bruto 40000Kg) que faz este conjunto com o semirreboque de matrícula (L-XXXXX) (Peso Bruto 33500Kg) estando assim a infringir nº5 Artº20 do RHLC conjugado com o nº1 Art.º 127 do CE. O condutor tem 68 anos de idade.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO RESTRIÇÃO 01.01 (ÓCULOS)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1861270102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1861270102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido condutor conduzia o veículo supracitado, não cumprindo as adaptações especificas impostas em avaliação médica mencionadas no seu título de condução, nomeadamente o mesmo tem averbado no seu titulo a restrição 01.01(óculos), sendo que o condutor durante o exercício da condução não fazia uso dos mesmos.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO (CAT T e CONDUZIR OUTRA TIPO CAT T)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901230302</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901230302&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor, titular de carta de condução de categoria T, circulava na via pública a conduzir veículo de tipo (T tipo I, T tipo II, T tipo III), para o qual a respetiva carta de condução não confere habilitação.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO (CAT T e CONDUZIR OUTRA VEICULO OUTRA CAT)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3901230301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3901230301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o arguido conduzia o referido veículo na via pública de categoria para a qual a respetiva carta de condução não confere habilitação. Possui a categoria \"T\" conduzindo o veículo ligeiro de mercadorias matrícula XX-XX-XX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO (CAT AM e CONDUZIR A/B/C/D)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3901230303</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3901230303&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 700€ 3500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o arguido conduzia o referido veículo na via pública de categoria para a qual a respetiva carta de condução não confere habilitação. Possui a categoria \"AM\" conduzindo o veículo ligeiro de mercadorias matrícula XX-XX-XX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO (CAT A1 e CONDUZIR A/B/C/D)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3901230304</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3901230304&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 700€ 3500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o arguido conduzia o referido veículo na via pública de categoria para a qual a respetiva carta de condução não confere habilitação. Possui a categoria \"A1\" conduzindo o veículo ligeiro de mercadorias matrícula XX-XX-XX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO (CONDUZIR OUTRA CAT PARA QUAL NÃO CONFERE HABILITAÇÃO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>3901230305</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;3901230305&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 500€ 2500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei em ato de fiscalização que o arguido conduzia o referido veículo na via pública de categoria para a qual a respetiva carta de condução não confere habilitação. Possui a categoria \"A\" conduzindo o veículo ligeiro de mercadorias matrícula XX-XX-XX.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO 185 DIAS NÃO RESIDENTE – (CONVECÇÃO INTERNACIONAL DE GENEBRA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo portador de título de condução válido, emitido por Estado Estrangeiro em conformidade com o anexo n.º 9 da Convenção Internacional de Genebra, de 19 de setembro de 1949, sobre circulação rodoviária após 185 dias subsequentes à sua entrada no país não sendo residente em Portugal.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO 185 DIAS NÃO RESIDENTE – (CONVECÇÃO INTERNACIONAL DE VIENA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250302</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250302&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo portador de título de condução válido, emitido por Estado Estrangeiro em conformidade com o anexo n.º 6 da Convenção Internacional de Viena, de 8 de novembro 1949, sobre circulação rodoviária após 185 dias subsequentes à sua entrada no país não sendo residente em Portugal.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO 185 DIAS NÃO RESIDENTE – (REGIME DE RECIPROCIDADE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250303</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250303&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo portador de título de condução válido, emitido por Estado Estrangeiro, em condições de Reciprocidade, após 185 dias subsequentes à sua entrada no após não sendo residente em Portugal.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO 185 DIAS NÃO RESIDENTE – (LICENÇA INTERNACIONAL DE CONDUÇÃO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250304</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250304&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo portador de licença internacional de condução, apresentada com o título nacional que lhe deu origem, após 185 dias subsequentes à sua entrada no país, não sendo residente em Portugal.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO 90 DIAS APÓS FIXAR RESIDÊNCIA – (CONVECÇÃO INTERNACIONAL DE GENEBRA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250401</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250401&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução válido, emitido por Estado estrangeiro em conformidade com o anexo n.º 9 da Convenção Internacional de Genebra, de 19 de setembro 1949, sobre circulação rodoviária, não tendo procedido à troca do título de condução no prazo de 90 dias após a fixação de residência em Portugal.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO 90 DIAS APÓS FIXAR RESIDÊNCIA – (CONVECÇÃO INTERNACIONAL DE VIENA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250402</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250402&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução válido, emitido por Estado estrangeiro em conformidade com o anexo n.º 6 da Convenção Internacional de Viena, de 8 de novembro de 1949, sobre circulação rodoviária, não tendo procedido à troca do título de condução no prazo de 90 dias após a fixação de residência em Portugal.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO 90 DIAS APÓS FIXAR RESIDÊNCIA – REGIME DE RECIPROCIDADE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250403</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250403&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução válido, emitido por Estado estrangeiro, em condições de reciprocidade, não tendo procedido à troca do título de condução no prazo de 90 dias após a fixação de residência em Portugal.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO 90 DIAS APÓS FIXAR RESIDÊNCIA – (LICENÇA INTERNACIONAL DE CONDUÇÃO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250404</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250404&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução válido, emitido por Estado estrangeiro, em condições de reciprocidade, não tendo procedido à troca do título de condução no prazo de 90 dias após a fixação</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO IDADE INFERIOR EXIGIDA EM PORTUGAL (MACAU)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250501</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250501&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução emitido pelos serviços competentes da Administração Portuguesa do Território de Macau, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO IDADE INFERIOR EXIGIDA EM PORTUGAL (UE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250502</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250502&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução emitido por Estado membro da União Europeia, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO IDADE INFERIOR EXIGIDA EM PORTUGAL (EEE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250503</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250503&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução emitido por Estado membro do espaço económico europeu, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO IDADE INFERIOR EXIGIDA EM PORTUGAL - (CONVECÇÃO INTERNACIONAL DE GENEBRA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250504</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250504&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução emitido por Estado estrangeiro em conformidade com o anexo n.º 9 da Convenção Internacional de Genebra, de 19 de setembro de 1949, sobre circulação rodoviária, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO IDADE INFERIOR EXIGIDA EM PORTUGAL - (CONVECÇÃO INTERNACIONAL DE VIENA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250505</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250505&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução emitido por Estado estrangeiro em conformidade com o anexo n.º 6 da Convenção Internacional de Viena, de 8 de novembro de 1968, sobre circulação rodoviária, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO IDADE INFERIOR EXIGIDA EM PORTUGAL – (REGIME RECIPROCIDADE)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250506</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250506&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de título de condução emitido por Estado estrangeiro, em condições de reciprocidade, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARTA DE CONDUÇÃO IDADE INFERIOR EXIGIDA EM PORTUGAL – (LICENÇA INTERNACIONAL DE CONDUÇÃO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250507</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250507&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de licença internacional de condução apresentada com o título nacional que lhe deu origem, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LICENÇA ESPECIAL DE CONDUÇÃO IDADE INFERIOR EXIGIDA EM PORTUGAL</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250508</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250508&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de licença especial de condução, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>AUTORIZAÇÃO ESPECIAL DE CONDUÇÃO IDADE INFERIOR EXIGIDA EM PORTUGAL</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250509</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250509&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de autorização especial de condução, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>LICENÇA DE APRENDIZAGEM IDADE INFERIOR EXIGIDA EM PORTUGAL</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1901250510</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1901250510&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 300€ 1500€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o condutor conduzia o veículo na via pública, sendo titular de licença de aprendizagem, com idade inferior à idade mínima exigida pela legislação portuguesa.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>\n<section id=\"legAutoX19\" class=\"leg-category-panel\"><div class=\"leg-category-title\"><span>19</span><div><strong>CARGA / TRANSPORTE</strong><small>Acondicionamento, transporte e disposição da carga</small></div><button onclick=\"this.closest('.leg-category-panel').classList.remove('open')\" type=\"button\">FECHAR ×</button></div><div class=\"leg-panel-count\">16 REGISTOS</div><div class=\"leg-list-new\"><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>OBJETO INDIVISÍVEL (PALHA/CORTIÇA) EXCEDE 4 METROS DE ALTURA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860560306</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860560306&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo de estrado/caixa aberta, circulava na via pública realizando o transporte de palha/cortiça (objeto indivisível) conforme guia transporte nº XXXXX, excedendo a altura definida de 4 metros a contar do solo. Efetuada a medição do pavimento ao limite superior da mercadoria, apresentando a mesma, uma altura de XXX metros, não possuindo qualquer autorização especial emitida pelo IMT, infringindo o disposto na al. b), nº 1, Art.º 13º do RAET aprovado pela Portaria 472/2007, de 22 de junho.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>BORDO SUPERIOR TAIPAIS - MALADÃO CARGA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860560309</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860560309&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo pesado de mercadorias circulava na via pública, realizando um transporte de mercadorias a granel (areia / plásticos), conforme a guia de transporte nº XXX, excedendo a altura definida pelo bordo superior dos taipais em XXX cm. O condutor era o único ocupante do veículo.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ALTURA DA MERCADORIA EXCEDE 4 METROS DE ALTURA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860560306</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860560306&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, realizando um transporte de mercadorias a granel (madeira), conforme guia de transporte nº XXX, excedendo a altura definida de 4 metros a contar do solo. Efetuada medição do pavimento ao limite superior da mercadoria a mesma apresenta uma altura de XXX metros.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARGA PARA A VIA PUBLICA (TOMATE/AREIA)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860560302</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860560302&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, derramando sumo e goma de tomate para a via pública, proveniente do transporte de tomates/areia.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARGA - VISIBILIDADE DO CONDUTOR</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860560303</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860560303&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública com carga no banco do passageiro da frente, prejudicando a visibilidade do condutor, nomeadamente toda a via e meio envolvente do seu lado direito.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>SEM CINTAS DE RETENÇÃO – PLATAFORMA ABERTA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860560310</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860560310&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 60€ 300€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública, realizando um transporte de carga indivisível (XXX), conforme a guia de transporte nº XXX, não dispondo de cintas de retenção ou dispositivo análogo em plataforma aberta.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>CARGA EXCESSIVA (VEÍCULO REBAIXADO)</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860560301</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860560301&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo circulava na via pública com a disposição da carga de tal forma a colocar em causa o equilíbrio, quando em marcha ou parada. A suspensão traseira, encontrava-se com as molas no seu recuo máximo, não sendo possível a sua variação devido ao peso transportado, colocando em causa o correto funcionamento do veículo e sistemas de segurança. A viatura transportava XXX, conforme guia de transporte n.º XXX. Foi efetuado o transbordo da mercadoria para outro veículo no local da fiscalização.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FALTA DE AUTORIZAÇÃO – EXCEDE 100CM PARA FRENTE/RETAGUARDA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo de estrado/caixa aberta, circulava na via pública realizando o transporte de XXX (objeto indivisível) conforme guia transporte nº XXX, excedendo o comprimento definido de 100cm para a frente/retaguarda os pontos extremos do veículo. Efetuada a medição a mesma apresenta, XXX cm, não possuindo qualquer autorização especial emitida pelo IMT, infringindo o disposto na al. a), nº 1, Art.º 13º do RAET aprovado pela Portaria 472/2007, de 22 de junho.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>FALTA DE AUTORIZAÇÃO – EXCEDE 30CM LATERALMENTE</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580103</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580103&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo de estrado/caixa aberta, circulava na via pública realizando o transporte de XXX (objeto indivisível) conforme guia transporte nº XXX, excedendo a largura do veículo, definida pelo respetivo contorno envolvente, em 30 cm para cada lado. Efetuada a medição a mesma apresenta, XXX cm, não possuindo qualquer autorização especial emitida pelo IMT, infringindo o disposto na al. a), nº 1, Art.º 13º do RAET aprovado pela Portaria 472/2007, de 22 de junho.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>ALTURA SEMIRREBOQUE CONSTRUÇÃO EXCEDE 4 METROS DE ALTURA</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860570102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860570102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o referido veículo fazia conjunto com o reboque / semirreboque de matricula XXX, medindo XXX m de altura, excedendo em XXX m/cm a altura máxima permitida de 4 metros, não possuindo qualquer autorização. O veículo possuía os pneumáticos com as medidas constantes no documento de identificação. O veículo não possuía qualquer avaria no momento, nomeadamente no sistema pneumático/hidráulico, infringindo o disposto na al. a) n.º 4 Art.º 3º do Reg. Anexo ao DL n.º 132/2017, de 11 de outubro.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSPORTE DE CARGA EM MÁQUINAS INDUSTRIAIS &quot;RETROESCAVADORA&quot; OU TRATORES &quot;AGRÍCOLAS&quot;</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que a máquina industrial de cor amarela, tipo RE “Retroescavadora” circulava na via pública transportando carga no balde frontal, concretamente carga a granel (areia). A circulação do veículo nestas circunstâncias infringe o n.º 2 e 7 Art.º 58º CE conjugado com o Art.º 15º do RAET Aprovado pela Portaria 472/07.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSPORTE EURO-MODELAR SEM AUTORIZAÇÃO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Circulava, efectuando o transporte de peças em betão (manilhas e acessórios), conforme Guia de Transporte n.º XXXXX. O veículo fazia conjunto com os semi-reboques de carga XXXXX e XXXXX, em configuração Euro-Modular, tendo o conjunto sido medido no seu comprimento em patamar e local plano, medindo 26m e 10cm, não possuindo o transporte autorização especial de circulação concedida para trânsito de veículos de dimensão superior ao regulamentado, nem autorização para configurações Euro-Modular. Não possuía a descriminação do percurso, nem parecer do IMT para circular em configuração Euro-Modular.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSPORTE EURO-MODELAR EXCENDO 25,25 m</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580102</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580102&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 600€ 3000€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">O veículo encontrava-se a circular, devidamente autorizado para configuração Euro-Modelar, com o semi-reboque XXXXX na 1ª posição e o semi-reboque XXXXX na 2ªa poição, medido o comprimento do conjunto em patamar e local plano, e na presença do condutor, o mesmo apresentou um comprimento de 26m, excedendo assim em (0,75m) as dimensões legalmente fixadas que são de 25,25m.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSPORTE GRANDES DIMENSÕES SEM ESCOLTA POLICIAL</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública, de XXX para XXX, fazendo conjunto de veículos com o semirreboque de matrícula L-XXX, com guia de transporte n.º XXX, fazendo-se acompanhar de Autorização Especial de Trânsito CD29/2021/DRMTLVT, Proc.: 2020112301603000034 das Infraestruturas de Portugal com condicionalismo obrigatório para circulação, da presença de batedores. O transporte tem a largura/comprimento/altura de XXX metros e não se fazia acompanhar pelos batedores, conforme disposto na al. __) do n.º 1 do Art.º 19º do RAET. A viatura ficou imobilizada no local, até ser requisitado pela empresa arguida batedores para o acompanhamento do transporte. OBS: N.º 1 ART.º 19.º RAET\na) Em comprimento: 32,50 m ou, quando o transporte excecional circule em autoestradas ou vias reservadas a automóveis e motociclos, 50 m;\nb) Em largura: 4,50 m;\nc) Em altura: 5 m.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSPORTE GRANDES DIMENSÕES SEM UM CARRO PILOTO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública, de XXX para XXX, fazendo conjunto de veículos com o semirreboque de matrícula L-XXX, com guia de transporte n.º XXX, fazendo-se acompanhar de Autorização Especial de Trânsito CD29/2021/DRMTLVT, Proc.: 2020112301603000034 das Infraestruturas de Portugal com condicionalismo obrigatório para circulação, da presença de um carro-piloto. O transporte tem a largura/comprimento de XXX metros e não se fazia acompanhar por um carro-piloto, conforme disposto na al. __) do n.º 1 do Art.º 17º do RAET. A viatura ficou imobilizada no local, até ser requisitado pela empresa arguida um carro piloto para o acompanhamento do transporte. OBS: ART.º 17.º RAET 1 - Sem prejuízo do disposto no número seguinte, o trânsito de veículos ao abrigo do presente Regulamento deve ser acompanhado por um carro-piloto, sempre que as dimensões ou dimensões totais excedam qualquer dos seguintes limites:\na) Em comprimento: 25,25 m;\nb) Em largura: 3 m.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article><article class=\"leg-card-new\">\n<div class=\"leg-card-header-new\"><div><h3>TRANSPORTE GRANDES DIMENSÕES SEM DOIS CARROS PILOTO</h3></div>\n<div class=\"leg-code-box\"><span>CÓDIGO</span><strong>1860580202</strong><button class=\"copy-btn-new\" type=\"button\" onclick=\"copiarLegislacao(&quot;1860580202&quot;,this)\">COPIAR</button></div>\n</div>\n<div class=\"leg-meta\"><strong>COIMA / LIMITE:</strong> 120€ 600€</div>\n<div class=\"leg-desc-label\">DESCRIÇÃO DO AUTO</div>\n<div class=\"leg-description-new\">Verifiquei que o veículo circulava na via pública, de XXX para XXX, fazendo conjunto de veículos com o semirreboque de matrícula L-XXX, com guia de transporte n.º XXX, fazendo-se acompanhar de Autorização Especial de Trânsito CD29/2021/DRMTLVT, Proc.: 2020112301603000034 das Infraestruturas de Portugal com condicionalismo obrigatório para circulação, da presença de dois carros-piloto. O transporte tem a largura/comprimento de XXX metros e não se fazia acompanhar por dois carros-piloto, conforme disposto na al. __) do n.º__ do Art.º 17º do RAET. A viatura ficou imobilizada no local, até ser requisitado pela empresa arguida um carro piloto para o acompanhamento do transporte.\nOBS: ART.º 17.º RAET 2 - Salvo em autoestradas e vias reservadas a automóveis e motociclos, o trânsito de veículos ao abrigo do presente Regulamento deve ser acompanhado por dois carros-piloto sempre que as dimensões ou dimensões totais excedam qualquer dos seguintes limites:\na) Em comprimento: 30 m;\nb) Em largura: 4 m.\n3 - Quando é exigido apenas um carro-piloto, este:\na) Só pode fazer o acompanhamento de um único veículo ou conjunto, salvo em autoestradas ou vias reservadas a automóveis e motociclos, caso em que o mesmo carro-piloto pode fazer o acompanhamento de dois veículos;\nb) Deve circular à frente do veículo acompanhado, salvo em autoestradas ou vias reservadas a automóveis e motociclos, caso em que deve circular atrás.</div>\n<button class=\"copy-desc-new\" type=\"button\" onclick=\"copiarLegislacaoDescricao(this.previousElementSibling.textContent,this)\">COPIAR DESCRIÇÃO</button>\n</article></div></section>",
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

// ========================= HISTÓRICO =========================
const HISTÓRICO_KEY = 'VÉRIX_CONSULTAS_HISTORICO_V1';
const HISTÓRICO_LIMIT = 100;

function obterHistorico() {
 try {
 const dados = JSON.parse(localStorage.getItem(HISTÓRICO_KEY) || '[]');
 return Array.isArray(dados) ? dados.slice(0, HISTÓRICO_LIMIT) : [];
 } catch (e) {
 return [];
 }
}

function guardarHistorico(veiculo, reboque, queryId) {
 try {
  const prefs = JSON.parse(localStorage.getItem('VÉRIX_PREFS_V1') || '{}');
  if (prefs.history === false) return;
 } catch (_) {}
 const v = (veiculo || '').trim().toUpperCase();
 const r = (reboque || '').trim().toUpperCase();
 if (!v && !r) return;
 let historico = obterHistorico();
 const agora = new Date().toISOString();
 const id = String(queryId || ('hist_' + Date.now() + '_' + Math.random().toString(36).slice(2,8)));
 // Cada submissão é uma consulta independente. O queryId permite
 // associar a resposta ASF exatamente à pesquisa que a originou.
 historico.unshift({ id, veiculo: v, reboque: r, data: agora, seguro: 'pendente' });
 try { localStorage.setItem(HISTÓRICO_KEY, JSON.stringify(historico.slice(0, HISTÓRICO_LIMIT))); } catch (e) {}
}

function atualizarSeguroNoHistorico(queryId, matriculaFallback, estado) {
 const qid = String(queryId || '');
 const mat = String(matriculaFallback || '').trim().toUpperCase();
 if (!qid && !mat) return;
 try {
  const prefs = JSON.parse(localStorage.getItem('VÉRIX_PREFS_V1') || '{}');
  if (prefs.history === false) return;
 } catch (_) {}
 try {
 const historico = obterHistorico();
 let idx = qid ? historico.findIndex(item => item && String(item.id || '') === qid) : -1;
 // Só fazemos fallback por matrícula em registos antigos que não tenham queryId.
 // Isto evita que uma resposta atrasada de uma pesquisa antiga atualize uma nova pesquisa da mesma matrícula.
 if (!qid && idx < 0 && mat) idx = historico.findIndex(item => item.veiculo === mat || item.reboque === mat);
 if (idx >= 0) {
 historico[idx].seguro = estado;
 historico[idx].seguroAtualizado = new Date().toISOString();
 localStorage.setItem(HISTÓRICO_KEY, JSON.stringify(historico.slice(0, HISTÓRICO_LIMIT)));
 }
 } catch (e) {}
}

function estadoSeguroHistoricoHtml(estado) {
 const e = String(estado || 'desconhecido');
 if (e === 'sim') return '<span class="history-insurance yes"><i class="dot"></i>SEGURO</span>';
 if (e === 'nao') return '<span class="history-insurance no"><i class="dot"></i>SEM SEGURO</span>';
 if (e === 'pendente') return '<span class="history-insurance pending"><i class="dot"></i>SEGURO</span>';
 return '<span class="history-insurance unknown"><i class="dot"></i>SEGURO</span>';
}

function formatarDataHistorico(iso) {
 try {
 const d = new Date(iso);
 const dd = String(d.getDate()).padStart(2,'0');
 const mm = String(d.getMonth()+1).padStart(2,'0');
 const yyyy = d.getFullYear();
 const hh = String(d.getHours()).padStart(2,'0');
 const mi = String(d.getMinutes()).padStart(2,'0');
 const ss = String(d.getSeconds()).padStart(2,'0');
 return `${dd}/${mm}/${yyyy} • ${hh}:${mi}:${ss}`;
 } catch (e) {
 return String(iso || '');
 }
}

function renderizarHistorico() {
 const list = document.getElementById('historyList');
 const count = document.getElementById('historyCount');
 if (!list) return;
 const historico = obterHistorico();
 count.textContent = `${historico.length} / ${HISTÓRICO_LIMIT} REGISTOS`;
 if (!historico.length) {
 list.innerHTML = '<div class="history-empty"><div style="font-size:28px;margin-bottom:12px;opacity:.35">☰</div>Ainda não existem pesquisas registadas.<br><span style="display:block;margin-top:10px;font-size:11px;color:#6a8088">As consultas de inspeção/seguro aparecem aqui automaticamente.</span></div>';
 return;
 }
 list.innerHTML = historico.map((item, index) => {
 const v = item.veiculo ? `<span class="plate-mini">${escapeHtml(item.veiculo)}</span>` : '';
 const r = item.reboque ? `<span class="plate-mini trailer">${escapeHtml(item.reboque)}</span>` : '';
 return `<div class="history-row" onclick="repetirPesquisaHistorico(${index})"> <div class="history-index">#${String(index + 1).padStart(2,'0')}</div> <div class="history-plates">${v}${r}</div>
 ${estadoSeguroHistoricoHtml(item.seguro)}
 <div class="history-date">${escapeHtml(formatarDataHistorico(item.data))}</div> <div class="history-action">REABRIR →</div> </div>`;
 }).join('');
}

function abrirHistorico() {
 const main=document.querySelector('.main');
 if(!document.body.classList.contains('fixed-workspace-active') || !main || !main.classList.contains('consultation-fixed-active')) return;
 renderizarHistorico();
 document.getElementById('mainMenuScreen')?.classList.remove('show');
 document.getElementById('moduleOverlay')?.classList.remove('show','cinemometro-fullpage');
 document.body.classList.remove('main-menu-active','cinemometro-page-active','consultation-screen-active');
 document.body.classList.add('fixed-workspace-active','history-page-active');
 const hist=document.getElementById('historyOverlay');
 if(hist) hist.classList.add('show');
 document.getElementById('consultaHistoryTool')?.classList.add('history-active');
}

function fecharHistorico() {
 document.getElementById('historyOverlay')?.classList.remove('show');
 document.getElementById('historyRail')?.classList.remove('active','selected');
 document.getElementById('consultaHistoryTool')?.classList.remove('history-active');
 document.body.classList.remove('history-page-active');
 abrirConsultaPrincipal();
}

function fecharHistoricoFora(event) { /* histórico é uma página fixa */ }

function repetirPesquisaHistorico(index) {
 const item = obterHistorico()[index];
 if (!item) return;

 const veiculo = item.veiculo || '';
 const reboque = item.reboque || '';

 // Reabrir uma pesquisa não fica apenas pelos campos preenchidos:
 // executa novamente todas as consultas e apresenta os resultados atuais.
 document.getElementById('MatriculaVeiculo').value = veiculo;
 document.getElementById('MatriculaReboque').value = reboque;

 // Reabrir diretamente o painel de Inspeções/Seguro e executar novamente a consulta.
 // Não usar fecharHistorico(), porque essa função também regressa ao Menu Principal.
 abrirConsultaPrincipal();

 submitConjunto({ preventDefault: function() {} });
}

function abrirConfirmacaoLimparHistorico() {
 const modal = document.getElementById('clearHistoryModal');
 if (modal) modal.classList.add('active');
}

function fecharConfirmacaoLimparHistorico() {
 const modal = document.getElementById('clearHistoryModal');
 if (modal) modal.classList.remove('active');
}

function confirmarLimpezaHistorico() {
 fecharConfirmacaoLimparHistorico();
 try { localStorage.removeItem(HISTÓRICO_KEY); } catch (e) {}
 renderizarHistorico();
} 

function limparHistorico() {
 abrirConfirmacaoLimparHistorico();
}

function submitConjunto(event) {
 event.preventDefault();
 const inputVeiculo = document.getElementById('MatriculaVeiculo');
 const inputReboque = document.getElementById('MatriculaReboque');

 const valVeiculo = inputVeiculo.value.trim();
 const valReboque = inputReboque.value.trim();

 if (!valVeiculo && !valReboque) {
   mostrarToast("Introduza pelo menos uma matrícula.");
   return;
 }

 // Uma pesquisa operacional = um query_id. Não são enviados matrícula nem resultados.
 try {
   window.__VERIX_CURRENT_QUERY_ID = (window.VERIX_TELEMETRY && typeof window.VERIX_TELEMETRY.newQueryId === 'function')
     ? window.VERIX_TELEMETRY.newQueryId() : null;
   if (!window.__VERIX_CURRENT_QUERY_ID) {
     window.__VERIX_CURRENT_QUERY_ID = 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
   }
   if (window.VERIX_TELEMETRY && typeof window.VERIX_TELEMETRY.track === 'function') {
     window.VERIX_TELEMETRY.track('vehicle_lookup','consulta',{queryId:window.__VERIX_CURRENT_QUERY_ID});
   }
 } catch (_) {}

 guardarHistorico(valVeiculo, valReboque, window.__VERIX_CURRENT_QUERY_ID);

 const placaInspecao = valVeiculo || valReboque;
 const placaLivrete = valReboque || valVeiculo;
 const baseIMT = 'http://consultapsp.imtt.external.rnsi.local/veiculos/';
 const imtSequence = ++imtQuerySequence;
 window.__VERIX_CURRENT_IMT_QUERY_SEQUENCE = imtSequence;

 /*
  * ARRANQUE PARALELO DA CONSULTA
  * ------------------------------
  * As três pesquisas são disparadas neste mesmo ciclo do submit:
  *   1) IMT / Inspeção
  *   2) IMT / Livrete
  *   3) ASF / Seguro
  *
  * Não existe await, callback ou resultado de uma consulta que bloqueie
  * qualquer das outras. Um erro num canal é independente dos restantes.
  */

 // 1 — IMT / INSPEÇÃO
 try {
   carregarConsultaIMT(
     'veiculoFrame',
     'veiculoLoading',
     baseIMT + 'consulta_inspecao.php?Matricula=' + placaInspecao,
     'inspecao',
     imtSequence
   );
 } catch (e) {
   console.error('[IMT] Falha ao iniciar inspeção:', e);
 }

 // 2 — IMT / LIVRETE
 try {
   carregarConsultaIMT(
     'reboqueFrame',
     'reboqueLoading',
     baseIMT + 'consulta_livrete.php?Matricula=' + placaLivrete,
     'livrete',
     imtSequence
   );
 } catch (e) {
   console.error('[IMT] Falha ao iniciar livrete:', e);
 }

 // 3 — ASF / SEGURO
 // Disparado imediatamente, sem esperar pelos dois iframes.
 try {
   consultarSeguroASF(placaInspecao);
 } catch (e) {
   console.error('[ASF] Falha ao iniciar consulta:', e);
 }

 // Uma matrícula pesquisada = 1 resultado IMT no Admin,
 // independentemente de serem carregados os dois endpoints (inspeção + livrete).
 try {
   if (window.VERIX_TELEMETRY && typeof window.VERIX_TELEMETRY.track === 'function') {
     window.VERIX_TELEMETRY.track('imt_loaded', 'consulta', { queryId: window.__VERIX_CURRENT_QUERY_ID });
   }
 } catch (_) {}

 ultimaMatriculaPesquisada = placaInspecao;
 ultimaMatriculaInspecao = placaInspecao;
 ultimaMatriculaLivrete = placaLivrete;

 inputVeiculo.value = '';
 inputReboque.value = '';
 try { inputVeiculo.focus(); } catch (_) {}
}
 function obterMatriculaOuVazia() {
 return ultimaMatriculaPesquisada || "";
 }

 function copiarEVisualizar(texto) {
 const valor = String(texto || '').trim();
 if (!valor) return;

 const sucesso = () => {
   const toast = document.getElementById('toastNotification');
   if (toast) {
     toast.textContent = 'Matrícula copiada!';
     toast.classList.add('show');
     clearTimeout(window._verixCopyToastTimer);
     window._verixCopyToastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
   }
 };

 const falha = () => {
   const toast = document.getElementById('toastNotification');
   if (toast) {
     toast.textContent = 'Não foi possível copiar automaticamente.';
     toast.classList.add('show');
     clearTimeout(window._verixCopyToastTimer);
     window._verixCopyToastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
   }
 };

 try {
   if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
     navigator.clipboard.writeText(valor).then(sucesso).catch(() => {
       copiarTextoFallbackVERIX(valor, sucesso, falha);
     });
     return;
   }
 } catch (_) {}

 copiarTextoFallbackVERIX(valor, sucesso, falha);
 }

 function copiarTextoFallbackVERIX(valor, sucesso, falha) {
 const area = document.createElement('textarea');
 area.value = valor;
 area.setAttribute('readonly', '');
 area.style.position = 'fixed';
 area.style.left = '-10000px';
 area.style.top = '0';
 area.style.width = '1px';
 area.style.height = '1px';
 area.style.opacity = '0';
 document.body.appendChild(area);

 let ok = false;
 try {
   area.focus();
   area.select();
   area.setSelectionRange(0, valor.length);
   ok = document.execCommand('copy') === true;
 } catch (_) {
   ok = false;
 }

 try { document.body.removeChild(area); } catch (_) {}
 if (ok) sucesso();
 else falha();
 }

 // ========================= COPIAR LEGISLAÇÃO =========================
 function legMostrarCopia(botao, mensagem) {
 if (botao) {
 const original = botao.dataset.originalText || botao.textContent.trim();
 botao.dataset.originalText = original;
 botao.textContent = 'COPIADO ✓';
 botao.classList.add('copied');
 clearTimeout(botao._copyTimer);
 botao._copyTimer = setTimeout(() => {
 botao.textContent = original;
 botao.classList.remove('copied');
 }, 1600);
 }
 const toast = document.getElementById('toastNotification');
 if (toast) {
 toast.textContent = mensagem || 'Copiado para a área de transferência';
 toast.classList.add('show');
 clearTimeout(window._legCopyToastTimer);
 window._legCopyToastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
 }
 }

 function copiarLegislacao(texto, botao) {
 const valor = String(texto || '').trim();
 if (!valor) return;
 const sucesso = () => legMostrarCopia(botao, 'Código copiado para a área de transferência');
 if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
 navigator.clipboard.writeText(valor).then(sucesso).catch(() => copiarLegislacaoFallback(valor, sucesso));
 } else {
 copiarLegislacaoFallback(valor, sucesso);
 }
 }

 function copiarLegislacaoFallback(valor, sucesso) {
 const area = document.createElement('textarea');
 area.value = valor;
 area.setAttribute('readonly', '');
 area.style.position = 'fixed';
 area.style.left = '-10000px';
 area.style.top = '0';
 area.style.width = '1px';
 area.style.height = '1px';
 area.style.opacity = '0';
 document.body.appendChild(area);
 area.focus();
 area.select();
 area.setSelectionRange(0, valor.length);
 let ok = false;
 try { ok = document.execCommand('copy') === true; } catch (e) { ok = false; }
 document.body.removeChild(area);
 if (ok) {
 sucesso();
 } else {
 const toast = document.getElementById('toastNotification');
 if (toast) {
 toast.textContent = 'Não foi possível copiar automaticamente. Selecione e copie manualmente.';
 toast.classList.add('show');
 clearTimeout(window._legCopyToastTimer);
 window._legCopyToastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
 }
 }
 }



 // ========================= ASF / TEM SEGURO =========================
  // MOTOR = CÓPIA FUNCIONAL DO IPO_2.2 (único caminho que funciona no posto).
  // UI do VÉRIX mantida; transporte e cadência = IPO exacto.

  const ASF_PROXY_URL = 'https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/asf-proxy-v1';

  const ASF_TIMEOUT_MS = 15000;
  const ASF_MAX_ATTEMPTS = 3;
  const ASF_RETRY_DELAYS_MS = [300, 900];
  /*
   * Sem quota artificial VÉRIX por minuto.
   * A fila apenas serializa pedidos concorrentes para proteger a estabilidade.
   * Retries existem exclusivamente para falhas transitórias de transporte.
   * Um 429 devolvido pela ASF é respeitado e não é contornado automaticamente.
   */
  var ASF_FILA_PENDENTES = 0;

  function agoraASF() { return Date.now(); }
  function esperarASF(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // ASF helpers — kept independent from quota/rate-control code.
  function formatarDataPT(valor) {
    if (valor === undefined || valor === null || String(valor).trim() === '' || String(valor) === '—') return '—';
    var s = String(valor).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return s;
  }

  function formatarMatriculaDisplay(mat) {
    return String(mat || '').trim().toUpperCase();
  }

  function sanitizarMatriculaASF(matricula) {
    return String(matricula || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function valorCampo(obj, nomes, fallback) {
    fallback = fallback || '';
    if (!obj) return fallback;
    for (var i = 0; i < nomes.length; i++) {
      var v = obj[nomes[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        if (typeof v === 'object') return v.name || v.label || v.value || v.description || fallback;
        return String(v);
      }
    }
    return fallback;
  }


  function atualizarContadorVisualASF() {
    var widget = document.getElementById('asfRateWidget');
    var cd = document.getElementById('asfRateCountdown');
    var usage = document.getElementById('asfRateUsage');
    var windowText = document.getElementById('asfRateWindowText');
    if (!widget || !cd) return;

    widget.classList.remove('warn', 'high', 'cooldown', 'asf-wait-state');
    if (usage) usage.innerHTML = 'SEM QUOTA LOCAL';

    if (windowText) {
      windowText.textContent = (ASF_FILA_PENDENTES || 0) > 0
        ? (ASF_FILA_PENDENTES + ' CONSULTA' + (ASF_FILA_PENDENTES === 1 ? '' : 'S') + ' EM FILA')
        : 'PESQUISA DISPONÍVEL';
      windowText.setAttribute('data-window-state', 'ready');
    }

    cd.textContent = (ASF_FILA_PENDENTES || 0) > 0 ? 'A PROCESSAR' : 'LIVRE';
    cd.setAttribute('data-state', 'ready');
    cd.title = 'Sem limite artificial local VÉRIX; pedidos concorrentes seguem em paralelo.';
  }

  function reservarSlotFisicoASF() {
    atualizarContadorVisualASF();
    return Promise.resolve(agoraASF());
  }
  atualizarContadorVisualASF();

  function agoraMsASFDiag() { return Date.now(); }

  function hashTextoASF(value) {
    var s = String(value || '');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function textoErroASF(e) {
    if (!e) return '';
    var parts = [];
    try { if (e.name) parts.push(String(e.name)); } catch (_) {}
    try { if (e.message) parts.push(String(e.message)); } catch (_) {}
    try { if (e.number) parts.push('number=' + String(e.number)); } catch (_) {}
    return parts.join(' | ').slice(0, 500);
  }

  function classificarErroASF(e, timeoutForcado) {
    var t = textoErroASF(e).toLowerCase();
    if (
      timeoutForcado ||
      t.indexOf('abort') >= 0 ||
      t.indexOf('timed out') >= 0 ||
      t.indexOf('timeout') >= 0 ||
      t.indexOf('tempo esgotado') >= 0
    ) return 'timeout';

    if (
      t.indexOf('cors') >= 0 ||
      t.indexOf('networkerror') >= 0 ||
      t.indexOf('network error') >= 0 ||
      t.indexOf('failed to fetch') >= 0 ||
      t.indexOf('internet') >= 0
    ) return 'network';

    return 'unknown';
  }

  function criarDiagASF(queryId, matDisplay) {
    return {
      queryId: queryId || null,
      matricula: String(matDisplay || '').slice(0, 30),
      asfHttpStatus: null,
      asfDurationMs: null,
      asfTotalMs: null,
      asfQueueWaitMs: null,
      asfMethod: null,
      asfTransport: null,
      asfErrorType: null,
      asfMessage: null,
      asfAttempts: [],
      asfResponseBytes: null,
      asfResponseContentType: null,
      asfResponseHash: null,
      asfStatusText: null,
      asfRelayLatencyMs: null
    };
  }

  function erroComDiagASF(mensagem, diagnostico) {
    var err = new Error(String(mensagem || 'Falha ASF'));
    try { err.asfDiagnostic = diagnostico || null; } catch (_) {}
    return err;
  }

  function finalizarTentativaDiagASF(diag, tentativa, extra) {
    tentativa.durationMs = Math.max(0, agoraMsASFDiag() - tentativa.startedAt);

    if (extra) {
      Object.keys(extra).forEach(function (k) {
        tentativa[k] = extra[k];
      });
    }

    diag.asfAttempts.push(tentativa);
    diag.asfDurationMs = tentativa.durationMs;
    diag.asfTotalMs = (diag.asfQueueWaitMs || 0) + tentativa.durationMs;
    diag.asfHttpStatus = tentativa.status == null ? null : Number(tentativa.status);
    diag.asfMethod = tentativa.method || null;
    diag.asfTransport = tentativa.transport || null;
    diag.asfErrorType = tentativa.errorType || diag.asfErrorType || null;
    diag.asfMessage = tentativa.message
      ? String(tentativa.message).slice(0, 500)
      : diag.asfMessage;
    diag.asfResponseContentType = tentativa.responseContentType || diag.asfResponseContentType || null;
    diag.asfResponseHash = tentativa.responseHash || diag.asfResponseHash || null;
    diag.asfStatusText = tentativa.statusText || diag.asfStatusText || null;
  }

  // ---- HTTP ASF: relay servidor-servidor ----
  // O browser deixa de contactar ext01.asf.com.pt diretamente.
  // O pedido é enviado ao relay VÉRIX por HTTPS; o relay fala com a ASF.
  // Assim o caminho crítico do cliente não depende de CORS/LNA/PNA, split-DNS
  // ou das políticas de acesso do browser à origem ASF.
  // Uma consulta = um pedido físico. Sem GET de fallback e sem retries.

  function obterAsfInstallationId() {
    try {
      var id = localStorage.getItem('VERIX_T2_INSTALL_ID');
      if (id) return String(id).slice(0, 120);
    } catch (_) {}

    try {
      var existing = localStorage.getItem('VERIX_ASF_INSTALL_ID_V1');
      if (existing) return String(existing).slice(0, 120);

      var created;
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        created = 'i-' + window.crypto.randomUUID();
      } else {
        created = 'i-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      }
      localStorage.setItem('VERIX_ASF_INSTALL_ID_V1', created);
      return created.slice(0, 120);
    } catch (_) {
      return 'i-anon';
    }
  }


  function asfTentativaRetryable(status, errorType) {
    if (Number(status) === 429) return false;
    if ([502, 503, 504].indexOf(Number(status)) >= 0) return true;
    return ['timeout', 'network', 'unknown'].indexOf(String(errorType || '')) >= 0;
  }

  async function efetuarPedidoHttpASF(payload, matDisplay, queryId) {
    var diag = criarDiagASF(queryId, matDisplay);
    var securityTokenASF = null;
    try {
      securityTokenASF = await window.VERIX_SECURITY.getToken(false);
    } catch (_) {
      diag.asfErrorType = 'security_auth';
      diag.asfMessage = 'O VÉRIX não conseguiu validar a autorização desta instalação.';
      throw erroComDiagASF(diag.asfMessage, diag);
    }
    if (!securityTokenASF) {
      diag.asfErrorType = 'security_auth';
      diag.asfMessage = 'O VÉRIX não conseguiu obter a autorização desta instalação.';
      throw erroComDiagASF(diag.asfMessage, diag);
    }
    var queueStarted = agoraMsASFDiag();

    await reservarSlotFisicoASF(matDisplay);
    diag.asfQueueWaitMs = Math.max(0, agoraMsASFDiag() - queueStarted);

    var requestBody = JSON.stringify(payload || {});
    var ultimaTentativa = null;

    for (var tentativaNo = 1; tentativaNo <= ASF_MAX_ATTEMPTS; tentativaNo++) {
      var tentativa = {
        attempt: tentativaNo,
        method: 'POST',
        transport: (typeof ActiveXObject !== 'undefined') ? 'WinHTTP→VÉRIX-RELAY' : 'Fetch→VÉRIX-RELAY',
        startedAt: agoraMsASFDiag(),
        status: null,
        statusText: null,
        durationMs: null,
        errorType: null,
        message: null,
        responseBytes: null,
        responseContentType: null
      };

      var bodyText = '';
      try {
        if (typeof ActiveXObject !== 'undefined') {
          var xhr = new ActiveXObject('WinHttp.WinHttpRequest.5.1');
          xhr.open('POST', ASF_PROXY_URL, false);
          xhr.setTimeouts(10000, 10000, ASF_TIMEOUT_MS, ASF_TIMEOUT_MS);
          xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
          xhr.setRequestHeader('Content-Type', 'text/plain; charset=UTF-8');
          xhr.setRequestHeader('X-Verix-Build-Id', window.VERIX_BUILD_ID || '1.5-sec-20261008-a');
          xhr.setRequestHeader('X-Verix-Client-Token', securityTokenASF);
          xhr.send(requestBody);

          tentativa.status = Number(xhr.Status || 0);
          bodyText = xhr.ResponseText || '';
        } else {
          var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
          var timeoutId = null;
          var timeoutForcado = false;

          try {
            timeoutId = setTimeout(function () {
              timeoutForcado = true;
              try { if (controller) controller.abort(); } catch (_) {}
            }, ASF_TIMEOUT_MS);

            var res = await fetch(ASF_PROXY_URL, {
              method: 'POST',
              cache: 'no-store',
              credentials: 'omit',
              mode: 'cors',
              redirect: 'follow',
              headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'text/plain;charset=UTF-8',
                'X-Verix-Build-Id': window.VERIX_BUILD_ID || '1.5-sec-20261008-a',
                'X-Verix-Client-Token': securityTokenASF
              },
              body: requestBody,
              signal: controller ? controller.signal : undefined
            });

            tentativa.status = Number(res.status);
            tentativa.statusText = res.statusText || null;
            tentativa.responseContentType = res.headers && res.headers.get
              ? (res.headers.get('content-type') || null)
              : null;

            if (res.headers && res.headers.get) {
              var relayLatencyHeader = res.headers.get('X-Verix-ASF-Latency-Ms');
              var relayLatencyMs = Number(relayLatencyHeader);
              if (Number.isFinite(relayLatencyMs)) diag.asfRelayLatencyMs = relayLatencyMs;
            }

            bodyText = await res.text();

            if (res.status >= 400) {
              tentativa.errorType = res.status === 429
                ? 'http_429'
                : (res.status === 503
                  ? 'http_503'
                  : (res.status === 504 ? 'relay_timeout' : (res.status === 502 ? 'relay_network' : 'http_' + res.status)));
            }
          } catch (e) {
            tentativa.errorType = timeoutForcado
              ? 'timeout'
              : classificarErroASF(e, false);
            tentativa.message = textoErroASF(e);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }

        tentativa.responseBytes = bodyText ? String(bodyText).length : 0;
        tentativa.responseHash = hashTextoASF(bodyText);
        finalizarTentativaDiagASF(diag, tentativa);
        ultimaTentativa = tentativa;

        var retryable = asfTentativaRetryable(tentativa.status, tentativa.errorType);
        if (!retryable || tentativaNo >= ASF_MAX_ATTEMPTS) {
          if (Number(tentativa.status) >= 200 && Number(tentativa.status) < 300) {
            diag.asfErrorType = null;
            diag.asfMessage = null;
          }
          return {
            status: tentativa.status,
            statusText: tentativa.statusText || null,
            text: bodyText || '',
            __asfDiagnostic: diag
          };
        }

        var delay = ASF_RETRY_DELAYS_MS[Math.min(tentativaNo - 1, ASF_RETRY_DELAYS_MS.length - 1)] || 900;
        await esperarASF(delay);
      } catch (e) {
        if (!tentativa.durationMs) {
          tentativa.message = tentativa.message || textoErroASF(e);
          tentativa.errorType = tentativa.errorType || classificarErroASF(e, false);
          finalizarTentativaDiagASF(diag, tentativa);
        }
        ultimaTentativa = tentativa;

        if (tentativaNo >= ASF_MAX_ATTEMPTS || !asfTentativaRetryable(null, tentativa.errorType)) {
          throw erroComDiagASF((e && e.message) || 'Falha de comunicação com o relay ASF', diag);
        }

        var delayEx = ASF_RETRY_DELAYS_MS[Math.min(tentativaNo - 1, ASF_RETRY_DELAYS_MS.length - 1)] || 900;
        await esperarASF(delayEx);
      }
    }

    throw erroComDiagASF(
      (ultimaTentativa && ultimaTentativa.message) || 'Falha de comunicação com o relay ASF',
      diag
    );
  }

  // Parser robusto inspirado no Consulta Veiculo(2): aceita os envelopes ASF
  // conhecidos e uma estrutura alternativa onde o resultado aparece dentro de
  // outro objecto nodes. Nunca transforma erro de esquema em "sem seguro".
  function extrairNodesASF(data) {
    var candidatos = [
      data && data.data && data.data.mobishoutEntry && data.data.mobishoutEntry.noone && data.data.mobishoutEntry.noone.entry && data.data.mobishoutEntry.noone.entry.licenseNumber && data.data.mobishoutEntry.noone.entry.licenseNumber.nodes,
      data && data.mobishoutEntry && data.mobishoutEntry.noone && data.mobishoutEntry.noone.entry && data.mobishoutEntry.noone.entry.licenseNumber && data.mobishoutEntry.noone.entry.licenseNumber.nodes,
      data && data.data && data.data.licenseNumber && data.data.licenseNumber.nodes,
      data && data.licenseNumber && data.licenseNumber.nodes
    ];

    for (var i = 0; i < candidatos.length; i++) {
      if (Array.isArray(candidatos[i])) {
        return { found: true, nodes: candidatos[i] };
      }
    }

    var encontrado = null;
    function arrayTemCamposSeguro(arr) {
      if (!Array.isArray(arr) || !arr.length) return false;
      var campos = ['entity','insurer','insuranceCompany','policy','policyNumber','startDate','validFrom','endDate','validTo','license','licenseNumber','code'];
      return arr.some(function (item) {
        if (!item || typeof item !== 'object') return false;
        return campos.some(function (k) { return Object.prototype.hasOwnProperty.call(item, k); });
      });
    }

    function walk(v, profundidade, caminho) {
      if (encontrado || !v || profundidade > 12) return;
      if (Array.isArray(v) || typeof v !== 'object') return;

      if (Array.isArray(v.nodes)) {
        var caminhoTexto = (caminho || []).join('.').toLowerCase();
        var contextoASF = /license|insurance|mobishout|entry|noone|asf/.test(caminhoTexto)
          || Object.prototype.hasOwnProperty.call(v, 'licenseNumber')
          || Object.prototype.hasOwnProperty.call(v, 'policy');
        // Arrays vazios só podem ser considerados um "sem seguro" conclusivo
        // quando estão num contexto ASF conhecido. Arrays não vazios podem
        // ser aceites quando trazem campos de seguro reconhecíveis.
        if ((v.nodes.length === 0 && contextoASF) || arrayTemCamposSeguro(v.nodes)) {
          encontrado = v.nodes;
          return;
        }
      }

      var vals = Object.keys(v);
      for (var j = 0; j < vals.length; j++) {
        var k = vals[j];
        walk(v[k], profundidade + 1, (caminho || []).concat(k));
        if (encontrado) return;
      }
    }
    walk(data, 0, []);

    return encontrado ? { found: true, nodes: encontrado } : { found: false, nodes: [] };
  }

  function interpretarRespostaASF(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Resposta ASF inválida');
    }

    if (Array.isArray(json.errors) && json.errors.length) {
      var msgs = json.errors.map(function (e) {
        return e && e.message ? String(e.message) : '';
      }).filter(Boolean);
      throw new Error(msgs.length ? msgs.join(' | ') : 'A ASF devolveu um erro GraphQL');
    }

    var extraido = extrairNodesASF(json);
    if (!extraido.found) {
      throw new Error('Resposta ASF sem estrutura de resultados reconhecida');
    }

    var nodes = Array.isArray(extraido.nodes) ? extraido.nodes : null;
    if (!nodes) {
      throw new Error('Resposta ASF com campo nodes inválido');
    }

    /*
     * REGRA ASF ALINHADA COM A APK BASE:
     * - nodes vazio = SEM SEGURO
     * - node.license != null = TEM SEGURO
     * - nodes existentes sem `license` = SEM SEGURO
     *
     * Campos como entity/policy/startDate/endDate não são, por si só,
     * suficientes para classificar a existência do seguro.
     */
    if (nodes.length === 0) {
      return { estado: 'nao', node: null };
    }

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node || typeof node !== 'object') continue;

      if (node.license !== undefined && node.license !== null) {
        return { estado: 'sim', node: node };
      }
    }

    return { estado: 'nao', node: null };
  }

  // CONSULTA ASF = mesmo endpoint/mutation do IPO_2.2, com parser robusto.
  // Sem quota artificial VÉRIX; 429 devolvido pela ASF é respeitado.

  async function realizarConsultaASF_IPO(matLimpa, matDisplay, queryId) {
    var hoje = new Date();
    var yyyy = hoje.getFullYear();
    var mm = String(hoje.getMonth() + 1).padStart(2, '0');
    var dd = String(hoje.getDate()).padStart(2, '0');
    var dataHoje = yyyy + '/' + mm + '/' + dd;

    var resposta = await efetuarPedidoHttpASF({
      matricula: matLimpa,
      date: dataHoje,
      installationId: obterAsfInstallationId(),
      queryId: queryId || '',
      buildId: window.VERIX_BUILD_ID || '1.5-sec-20261008-a'
    }, matDisplay, queryId);

    var diag = resposta && resposta.__asfDiagnostic
      ? resposta.__asfDiagnostic
      : criarDiagASF(queryId, matDisplay);

    var httpStatus = resposta && resposta.status != null ? Number(resposta.status) : null;
    var responseText = resposta && resposta.text ? String(resposta.text) : '';

    diag.asfHttpStatus = Number.isFinite(httpStatus) ? httpStatus : null;
    diag.asfResponseBytes = responseText.length;

    if (httpStatus === 429) {
      diag.asfErrorType = 'http_429';
      diag.asfMessage = 'A ASF recusou temporariamente a consulta (HTTP 429)';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    if (httpStatus === 504) {
      diag.asfErrorType = 'relay_timeout';
      diag.asfMessage = 'O relay VÉRIX excedeu o tempo de resposta da ASF após as tentativas automáticas';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    if (httpStatus === 502) {
      diag.asfErrorType = 'relay_network';
      diag.asfMessage = 'O relay VÉRIX não conseguiu comunicar com a ASF após as tentativas automáticas';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    if (httpStatus === 503) {
      diag.asfErrorType = 'http_503';
      diag.asfMessage = 'Serviço temporariamente indisponível após as tentativas automáticas';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    if (httpStatus < 200 || httpStatus >= 300) {
      diag.asfErrorType = 'http_' + httpStatus;
      diag.asfMessage = 'Erro HTTP ' + httpStatus;
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    var json;
    try {
      json = JSON.parse(responseText);
    } catch (_) {
      diag.asfErrorType = 'invalid_json';
      diag.asfMessage = 'Resposta ASF não é JSON válido';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    try {
      if (Array.isArray(json.errors) && json.errors.length) {
        diag.asfErrorType = 'graphql';
      }

      var resultado = interpretarRespostaASF(json);
      diag.asfErrorType = null;
      diag.asfMessage = null;
      return { resultado: resultado, asfDiagnostic: diag };
    } catch (e) {
      if (!diag.asfErrorType) {
        diag.asfErrorType =
          (String(e && e.message || '').toLowerCase().indexOf('estrutura') >= 0)
            ? 'invalid_response'
            : 'graphql';
      }
      diag.asfMessage = String(e && e.message || 'Resposta ASF inválida').slice(0, 500);
      throw erroComDiagASF(diag.asfMessage, diag);
    }
  }

  function anunciarEstadoConsultaASF(mensagem) {
    var el = document.getElementById('seguroResultAnnouncement');
    if (el) el.textContent = String(mensagem || '');
  }

  function mostrarSeguroLoading(matricula, extra) {
    var box = document.getElementById('seguroResult');
    if (!box) return;
    var matShow = formatarMatriculaDisplay(matricula || '');
    anunciarEstadoConsultaASF('A consultar o serviço ASF para a matrícula ' + (matShow || 'indicada') + '.');
    box.innerHTML = ''
      + '<div class="asf-app asf-app-wait">'
      +   '<div class="asf-app-plate">'
      +     '<span class="asf-app-plate-label">Matrícula</span>'
      +     '<span class="asf-app-plate-badge">' + escapeHtml(matShow || '…') + '</span>'
      +   '</div>'
      +   '<div class="asf-status-card wait">'
      +     '<div class="asf-status-glow"></div>'
      +     '<div class="spinner asf-spinner"></div>'
      +     '<div class="asf-status-title">A consultar ASF…</div>'
      +     '<div class="asf-status-sub">' + escapeHtml(extra || 'Aguarde a resposta do canal de seguros') + '</div>'
      +   '</div>'
      + '</div>';
  }

  function calcularDiasRestantesASF(dateText) {
    var raw = String(dateText || '').trim();
    if (!raw) return null;
    var m = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    var d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59, 999) : new Date(raw);
    if (isNaN(d.getTime())) return null;
    var today = new Date();
    today.setHours(0,0,0,0);
    var end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.ceil((end.getTime() - today.getTime()) / 86400000);
  }

  function renderSeguroEncontrado(n, matricula, queryId, asfDiagnostic) {
    try { atualizarSeguroNoHistorico(queryId, matricula, 'sim'); } catch (_) {}
    var box = document.getElementById('seguroResult');
    if (!box) return;
    n = n || {};
    var matShow = formatarMatriculaDisplay(matricula);
    anunciarEstadoConsultaASF('Consulta ASF concluída: foi encontrado registo de seguro para a matrícula ' + (matShow || 'consultada') + '.');
    var entity = valorCampo(n, ['entity', 'insurer', 'insuranceCompany'], '—');
    var policy = valorCampo(n, ['policy', 'policyNumber'], '—');
    var ini = formatarDataPT(valorCampo(n, ['startDate', 'validFrom'], ''));
    var fim = formatarDataPT(valorCampo(n, ['endDate', 'validTo'], ''));
    var logo = valorCampo(n, ['logo'], '');
    var diasRestantes = calcularDiasRestantesASF(fim);
    var validadeTexto = diasRestantes == null ? 'DATA NÃO DISPONÍVEL' : (diasRestantes === 0 ? 'TERMINA HOJE' : (diasRestantes > 0 ? (diasRestantes + (diasRestantes === 1 ? ' DIA RESTANTE' : ' DIAS RESTANTES')) : ('EXPIRADO HÁ ' + Math.abs(diasRestantes) + (Math.abs(diasRestantes) === 1 ? ' DIA' : ' DIAS'))));
    var validadeClasse = diasRestantes == null ? 'unknown' : (diasRestantes >= 0 ? 'valid' : 'expired');
    var logoHtml = (logo && !/default\.png/i.test(logo))
      ? '<div class="asf-logo-wrap"><img class="asf-logo" src="' + escapeHtml(logo) + '" alt="" onerror="this.parentNode.style.display=\'none\'"></div>'
      : '<div class="asf-logo-wrap asf-logo-fallback">ASF</div>';
    box.innerHTML = ''
      + '<div class="asf-app asf-app-ok asf-operational-result">'
      +   '<div class="asf-success-hero">'
      +     '<div class="asf-success-badge">✓</div>'
      +     '<div class="asf-success-copy"><div class="asf-success-kicker">RESULTADO DA CONSULTA ASF</div><div class="asf-success-title">' + (diasRestantes == null ? 'REGISTO ENCONTRADO' : (diasRestantes < 0 ? 'SEGURO EXPIRADO' : (diasRestantes === 0 ? 'SEGURO VÁLIDO ATÉ HOJE' : 'SEGURO VÁLIDO'))) + '</div><div class="asf-success-sub">' + (diasRestantes == null ? 'REGISTO ENCONTRADO · VALIDADE POR CONFIRMAR' : (diasRestantes < 0 ? 'A DATA DE VALIDADE JÁ FOI ULTRAPASSADA' : (diasRestantes === 0 ? 'A DATA DE VALIDADE TERMINA HOJE' : 'REGISTO ASF ENCONTRADO · PRAZO EM VIGOR'))) + '</div></div>'
      +     '<div class="asf-success-plate"><span>' + escapeHtml(matShow) + '</span></div>'
      +   '</div>'
      +   '<div class="asf-operational-status ' + validadeClasse + '">'
      +     '<div><span class="asf-op-kicker">SITUAÇÃO</span><strong>' + (diasRestantes == null ? 'VALIDADE POR CONFIRMAR' : (diasRestantes < 0 ? 'SEGURO EXPIRADO' : 'SEGURO VÁLIDO')) + '</strong></div>'
      +     '<div class="asf-op-validity"><span class="asf-op-kicker">PRAZO DE VALIDADE</span><strong>' + escapeHtml(validadeTexto) + '</strong></div>'
      +   '</div>'
      +   '<div class="asf-detail-card asf-operational-card">'
      +     '<div class="asf-detail-head">' + logoHtml + '<div class="asf-detail-head-text"><span class="asf-detail-kicker">DADOS DO SEGURO</span><strong>' + escapeHtml(entity) + '</strong></div></div>'
      +     '<div class="asf-rows">'
      +       '<div class="asf-row asf-row-emphasis"><span class="k">SEGURADORA</span><span class="v">' + escapeHtml(entity) + '</span></div>'
      +       '<div class="asf-row asf-row-emphasis"><span class="k">APÓLICE</span><span class="v asf-mono">' + escapeHtml(policy) + '</span></div>'
      +       '<div class="asf-dates-grid">'
      +         '<div class="asf-date-box"><span class="k">INÍCIO</span><strong>' + escapeHtml(ini || '—') + '</strong></div>'
      +         '<div class="asf-date-box ' + validadeClasse + '"><span class="k">' + (diasRestantes == null ? 'VALIDADE' : (diasRestantes < 0 ? 'EXPIRADO EM' : (diasRestantes === 0 ? 'VÁLIDO ATÉ HOJE' : 'VÁLIDO ATÉ'))) + '</span><strong>' + escapeHtml(fim || '—') + '</strong></div>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="asf-operational-actions"><button type="button" class="aux-btn secondary" onclick="verificarSeguro()">ABRIR CONSULTA OFICIAL ASF</button></div>'
      +   '<div class="asf-note">Fonte: canal ASF · Confirme pelos meios oficiais da sua instituição</div>'
      + '</div>';
  }

  function renderSeguroNaoEncontrado(matricula, queryId, asfDiagnostic) {
    try { atualizarSeguroNoHistorico(queryId, matricula, 'nao'); } catch (_) {}
    var box = document.getElementById('seguroResult');
    if (!box) return;
    var matShow = formatarMatriculaDisplay(matricula);
    anunciarEstadoConsultaASF('Consulta ASF concluída. Não foi encontrado registo de seguro para a matrícula ' + (matShow || 'consultada') + '; confirme pelos meios oficiais.');
    box.innerHTML = ''
      + '<div class="asf-app asf-app-no asf-negative-operational">'
      +   '<section class="asf-negative-hero" aria-label="Resultado sem registo de seguro">'
      +     '<div class="asf-negative-heading">'
      +       '<div class="asf-negative-icon" aria-hidden="true">×</div>'
      +       '<div class="asf-negative-copy">'
      +         '<div class="asf-negative-kicker">RESULTADO DA CONSULTA ASF</div>'
      +         '<div class="asf-negative-title">SEM SEGURO VÁLIDO</div>'
      +         '<div class="asf-negative-sub">Sem registo ativo no canal ASF para esta data</div>'
      +       '</div>'
      +     '</div>'
      +     '<div class="asf-negative-plate-wrap">'
      +       '<span class="asf-negative-plate-label">MATRÍCULA CONSULTADA</span>'
      +       '<div class="asf-negative-plate"><span>' + escapeHtml(matShow || '—') + '</span></div>'
      +     '</div>'
      +   '</section>'
      +   '<section class="asf-negative-alert">'
      +     '<div class="asf-negative-alert-title">CONFIRMAÇÃO OFICIAL NECESSÁRIA</div>'
      +     '<p>Confirme a situação na consulta oficial ASF antes de qualquer decisão operacional.</p>'
      +   '</section>'
      +   '<div class="asf-negative-actions"><button type="button" class="asf-negative-button" onclick="verificarSeguro()">ABRIR CONSULTA OFICIAL ASF</button></div>'
      +   '<div class="asf-negative-source"><span class="asf-negative-source-dot" aria-hidden="true"></span> Resultado do canal ASF · Confirmar por meios oficiais</div>'
      + '</div>';
  }

  function mostrarSeguroErro(mensagem, matricula, diagnostico, queryId, asfDiagnostic) {
    try { atualizarSeguroNoHistorico(queryId, matricula, 'indisponivel'); } catch (_) {}
    var box = document.getElementById('seguroResult');
    if (!box) return;
    var matShow = formatarMatriculaDisplay(matricula);
    anunciarEstadoConsultaASF('Consulta ASF inconclusiva para a matrícula ' + (matShow || 'consultada') + '. Não interpretar como ausência de seguro.');
    box.innerHTML = ''
      + '<div class="asf-app asf-app-warn">'
      +   '<div class="asf-app-plate">'
      +     '<span class="asf-app-plate-label">Matrícula</span>'
      +     '<span class="asf-app-plate-badge">' + escapeHtml(matShow || '—') + '</span>'
      +   '</div>'
      +   '<div class="asf-status-card warn">'
      +     '<div class="asf-status-glow"></div>'
      +     '<div class="asf-status-icon"><span>!</span></div>'
      +     '<div class="asf-status-title">Consulta indisponível</div>'
      +     '<div class="asf-status-sub">Não é possível concluir se existe seguro</div>'
      +   '</div>'
      +   '<div class="asf-detail-card asf-detail-error">'
      +     '<div class="asf-row"><span class="k">Motivo</span><span class="v">' + escapeHtml(mensagem || '—') + '</span></div>'
      +   '</div>'
      +   (diagnostico ? '<div class="asf-diag">' + escapeHtml(diagnostico) + '</div>' : '')
      +   '<div class="asf-note">Uma falha de serviço nunca é apresentada como “sem seguro”</div>'
      +   '<div class="asf-actions"><button type="button" class="aux-btn" onclick="verificarSeguro()">Abrir consulta oficial ASF</button></div>'
      + '</div>';
  }

  // ---- Orquestração ASF ----
  // O controlo de cadência pertence agora ao nível do pedido físico, para que
  // POST e eventual GET de fallback contem e respeitem os mesmos limites.
  async function processarConsultaSeguroComCadencia(matLimpa, matDisplay, queryId) {
    mostrarSeguroLoading(matDisplay, 'A VERIFICAR...');

    try {
      var consulta = await realizarConsultaASF_IPO(matLimpa, matDisplay, queryId);
      var resultado = consulta.resultado;
      var asfDiagnostic = consulta.asfDiagnostic || null;
      if (resultado.estado === 'sim') {
        renderSeguroEncontrado(resultado.node || {}, matDisplay, queryId, asfDiagnostic);
      } else if (resultado.estado === 'nao') {
        renderSeguroNaoEncontrado(matDisplay, queryId, asfDiagnostic);
      } else {
        throw erroComDiagASF('Resposta ASF sem estado conclusivo', asfDiagnostic);
      }
    } catch (err) {
      var diagnostico = (err && err.message) ? String(err.message) : 'Falha de comunicação com a ASF';
      var asfDiagnostic = (err && err.asfDiagnostic) ? err.asfDiagnostic : null;
      console.warn('[ASF] Falha (' + matLimpa + '):', diagnostico, asfDiagnostic || '');
      mostrarSeguroErro(diagnostico, matDisplay, 'Diagnóstico ASF registado automaticamente.', queryId, asfDiagnostic);
    }
  }

  
var ASF_EM_VOO = Object.create(null);

  /*
   * EXECUÇÃO PARALELA:
   * ASF, inspeção IMT e livrete IMT são canais independentes.
   * Não existe fila entre consultas ASF e não existe espera pelo RNSI.
   * A única proteção local é deduplicar uma chamada idêntica ainda em execução.
   */
async function consultarSeguroASF(matricula) {
    var matDisplay = String(matricula || '').trim().toUpperCase();
    if (!matDisplay) return;

    var matLimpa = sanitizarMatriculaASF(matDisplay);
    if (!matLimpa) return;

    var queryId = window.__VERIX_CURRENT_QUERY_ID || null;
    var dedupeKey = matLimpa + '|' + String(queryId || '');

    if (ASF_EM_VOO[dedupeKey]) return ASF_EM_VOO[dedupeKey];

    ASF_FILA_PENDENTES = (ASF_FILA_PENDENTES || 0) + 1;
    atualizarContadorVisualASF();
    mostrarSeguroLoading(matDisplay, 'A VERIFICAR...');

    var promise = processarConsultaSeguroComCadencia(
      matLimpa,
      matDisplay,
      queryId
    ).finally(function () {
      ASF_FILA_PENDENTES = Math.max(0, (ASF_FILA_PENDENTES || 1) - 1);
      atualizarContadorVisualASF();
    });

    ASF_EM_VOO[dedupeKey] = promise;
    promise.then(function () {
      delete ASF_EM_VOO[dedupeKey];
    }, function () {
      delete ASF_EM_VOO[dedupeKey];
    });

    return promise;
  }

function verificarSeguro() {
 const mat = obterMatriculaOuVazia();
 if (!mat) {
  mostrarToast('Faça primeiro uma consulta de matrícula.');
  return;
 }
 copiarEVisualizar(mat);
 const url = 'https://www.consumidor.asf.com.pt/servi%C3%A7os/verificar-seguro-atrav%C3%A9s-da-matr%C3%ADcula';
 window.open(url, 'ASFPopup', 'width=900,height=700,top=100,left=100,resizable=yes,scrollbars=yes');
}

function consultarIMTERRU() {
 const mat = obterMatriculaOuVazia();
 copiarEVisualizar(mat);
 const url = `https://erru.imt-ip.pt/ERRU/`;
 window.open(url, 'IMTERRUPopup', 'width=900,height=700,top=100,left=100,resizable=yes,scrollbars=yes');
 }

 function consultarINEM() {
 const mat = obterMatriculaOuVazia();
 copiarEVisualizar(mat);
 const url = `https://alvaras.inem.pt/DMZ/ConsultaCertificado.aspx`;
 window.open(url, 'INEMPopup', 'width=900,height=700,top=100,left=100,resizable=yes,scrollbars=yes');
 }

 function consultarWAZE() {
 const modal = document.getElementById('wazeGpsModal');
 if (modal) modal.classList.add('active');
 }

 function fecharWazeGpsModal() {
 const modal = document.getElementById('wazeGpsModal');
 if (modal) modal.classList.remove('active');
 }

 function abrirDefinicoesLocalizacao() {
 const uri = 'ms-settings:privacy-location';
 try { window.location.href = uri; }
 catch (e) { window.open(uri, '_blank'); }
 }

 function confirmarWazeGps() {
 fecharWazeGpsModal();
 const url = `https://location.wazept.com/#/`;
 window.open(url, 'WazePopup', 'width=900,height=700,top=100,left=100,resizable=yes,scrollbars=yes');
 }

function cinRoundDown(n) {
 return Math.floor(n + 1e-9);
}

function cinEMA() {
 const modo = document.getElementById('cinSessaoModo')?.value || 'fixo';
 const ver = document.getElementById('cinVerificacao')?.value || 'primeira';
 if(modo==='perseguicao') return ver==='primeira' ? 0.03 : 0.05;
 if(modo==='movimento') return ver==='primeira' ? 0.05 : 0.07;
 return ver==='primeira' ? 0.03 : 0.05;
}

function cinEtiquetaEMA() {
 const modo = document.getElementById('cinSessaoModo')?.value || 'fixo';
 const v = cinEMA();
 const unit = v < 1 ? (v*100).toFixed(0)+' %' : '± '+v.toFixed(0)+' km/h';
 // For speeds >100 km/h the same source table switches to percentage;
 return modo==='perseguicao' || modo==='movimento' || modo==='fixo' ? '± '+(v*100).toFixed(0)+' %' : unit;
}

function cinCalcularDeducida(registada) {
 if(!Number.isFinite(registada) || registada<=0) return null;
 const ema = cinEMA();
 const desconto = registada <= 100 ? (ema*100) : (registada*ema);
 return cinRoundDown(registada - desconto);
}

function cinAtualizarEMA() {
 const e=document.getElementById('cinEmaValor'), n=document.getElementById('cinEmaNota');
 const top=document.getElementById('cinEmaTopValor'), topNota=document.getElementById('cinEmaTopNota');
 const registada=parseFloat(document.getElementById('cinRegistada')?.value);
 const ema=cinEMA();
 const pct=(ema*100).toFixed(0)+' %';
 const extra=pct;
 const verificacao=(document.getElementById('cinVerificacao')?.value==='primeira'?'Primeira verificação':'Verificação periódica');
 const modoEl=document.getElementById('cinSessaoModo');
 const modoTexto=modoEl?.selectedOptions?.[0]?.textContent||'';
 if(e)e.textContent=extra;
 if(n)n.textContent=verificacao;
 if(top)top.textContent=pct;
 if(topNota)topNota.textContent=modoTexto ? modoTexto+' • '+verificacao : verificacao;
 cinRecalcular();
}

function cinRecalcular() {
 const registada=parseFloat(document.getElementById('cinRegistada')?.value);
 const limite=parseFloat(document.getElementById('cinLimite')?.value);
 const ded=cinCalcularDeducida(registada);
 const k=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
 const sem=document.getElementById('cinSemInfracao');

 if(ded===null || !Number.isFinite(limite)){
 ['cinDeducida','cinDeducida2','cinExcesso','cinGravidade','cinCodigo','cinValor','cinCoima','cinPontos','cinInibicao','cinBaseLegal'].forEach(id=>k(id,'—'));
 if(sem)sem.classList.remove('show');
 cinMontarTexto();
 return;
 }

 const excesso=ded-limite;
 const classificacao=cinClassificarExcesso(Math.max(0,excesso));
 const codigo=cinCodigoOperacional(classificacao);
 const regime=document.getElementById('cinRegime')?.value||'local_geral';

 k('cinDeducida',ded+'');
 k('cinDeducida2',ded+'');
 k('cinExcesso',Math.max(0,excesso)+'');
 k('cinGravidade',excesso<=0?'Sem infração':classificacao.gravidade);
 k('cinCodigo',excesso<=0?'—':codigo);
 k('cinValor',excesso<=0?'—':classificacao.coima);
 k('cinCoima',excesso<=0?'—':classificacao.coima);
 k('cinPontos',excesso<=0?'—':classificacao.pontos);
 k('cinInibicao',excesso<=0?'—':classificacao.inibicao);

 if(excesso<=0){
 k('cinBaseLegal','—');
 if(sem)sem.classList.add('show');
 }else{
 if(sem)sem.classList.remove('show');
 let base='Art. 27.º + ';
 if(classificacao.gravidade==='Grave') base+='145.º + 147.º + 148.º CE';
 else if(classificacao.gravidade==='Muito Grave') base+='146.º + 147.º + 148.º CE';
 else base+='27.º CE';
 k('cinBaseLegal',base);
 }

 const a=document.getElementById('cinAviso');
 if(a){
 if(excesso<=0) a.textContent='A velocidade deduzida não ultrapassa o limite aplicável.';
 else if(regime==='especial') a.textContent='Limite especial sinalizado: confirme a sinalização aplicável e o enquadramento antes da emissão do auto.';
 else a.textContent='Classificação calculada pelo excesso sobre o limite aplicável.';
 }
 cinMontarTexto();
}

function cinMontarTexto() {
 const get=id=>(document.getElementById(id)?.value||'').trim();
 const registada=parseFloat(get('cinRegistada')), limite=parseFloat(get('cinLimite'));
 const ded=cinCalcularDeducida(registada);
 const marca=get('cinMarca'), modelo=get('cinModelo'), serie=get('cinSerie');
 const ansr=get('cinANSR'), ipq=get('cinIPQ'), data=get('cinDataIPQ');
 const certTipo=get('cinCertTipo'), cert=get('cinCert');
 const opNo=get('cinSessaoOperadorNo'), opNome=get('cinSessaoOperadorNome'), opPosto=get('cinSessaoOperadorPosto');
 let texto='';
 if(ded!==null && Number.isFinite(registada) && Number.isFinite(limite)) {
 const aparelho=(marca||'')+(modelo?(', modelo '+modelo):'')+(serie?(' n.º '+serie):'');
 texto='O veículo circulava, pelo menos, à velocidade de '+ded+' km/h correspondente à velocidade registada de '+registada+' km/h, deduzido o valor do erro máximo admissível, sendo o limite máximo de velocidade permitido no local de '+limite+' km/h. ';
 const modoSessao=document.getElementById('cinSessaoModo')?.value||'fixo';
 let prefixo='A velocidade foi verificada através do aparelho Cinemómetro - ';
 if(modoSessao==='media') prefixo='A velocidade foi verificada através do aparelho Cinemómetro - ';
 texto+=prefixo+aparelho+'. ';
 if(ansr) texto+='Aprovado para controlo e fiscalização pela ANSR através de '+ansr+'. ';
 if(ipq) texto+='Pelo IPQ através de '+ipq+'. ';
 if(data) texto+='Verificado pelo IPQ em '+data;
 if(certTipo) texto+=', com '+certTipo;
 if(cert) texto+=' n.º '+cert;
 if(data || certTipo || cert) texto+='. ';
 if(opNo || opNome || opPosto) texto+='Operador'+(opNo?' n.º '+opNo:'')+(opNome?(' — '+opNome):'')+(opPosto?(' — '+opPosto):'')+'.';
 } else {
 texto='Preencha a velocidade registada e o limite permitido para gerar o texto do auto.';
 }
 const ta=document.getElementById('cinTexto'); if(ta)ta.value=texto;
 cinMontarLocal();
}

function cinMontarLocal() {
 const get=id=>(document.getElementById(id)?.value||'').trim();
 const parts=[];
 if(get('cinLocalidade')) parts.push(get('cinLocalidade'));
 if(get('cinDistrito')) parts.push('Distrito: '+get('cinDistrito'));
 if(get('cinVia')) parts.push(get('cinVia'));
 const sent=get('cinSentido'); if(sent) parts.push('SENTIDO '+sent);
 const km=get('cinKm'); if(km) parts.push('KM '+km);
 const local='LOCAL: '+(parts.length?parts.join(', '):'—');
 const el=document.getElementById('cinLocalTexto'); if(el)el.textContent=local;
 return local;
}


let CIN_COPIA_CODIGO=false;
let CIN_COPIA_TEXTO=false;

function cinVelocidadeDigitada(el){
 if(!el) return;
 // Apenas algarismos introduzidos pelo utilizador; sem spinner/alteração por setas do teclado.
 const limpo=String(el.value||'').replace(/[^0-9]/g,'').slice(0,3);
 if(el.value!==limpo) el.value=limpo;
 CIN_COPIA_CODIGO=false;
 CIN_COPIA_TEXTO=false;
 cinRecalcular();
}

function cinLimparVelocidadeAposCopias(){
 if(!(CIN_COPIA_CODIGO && CIN_COPIA_TEXTO)) return;
 const el=document.getElementById('cinRegistada');
 if(el){
 el.value='';
 el.focus();
 }
 CIN_COPIA_CODIGO=false;
 CIN_COPIA_TEXTO=false;
 cinRecalcular();
}

function cinMostrarCopiaConfirmacao(mensagem){
 const toast=document.getElementById('cinCopyToast');
 if(!toast)return;
 toast.textContent=mensagem;
 toast.classList.add('show');
 clearTimeout(window._cinCopyToastTimer);
 window._cinCopyToastTimer=setTimeout(()=>toast.classList.remove('show'),2600);
}

async function cinCopiarCodigo() {
 const codigo = document.getElementById('cinCodigo')?.textContent?.trim() || '';
 const btn = document.getElementById('cinCopiarCodigoBtn');
 if(!codigo || codigo==='—') { mostrarToast('Ainda não existe código calculado.'); return; }
 try{
 await navigator.clipboard.writeText(codigo);
 if(btn){
 btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
 btn.textContent='CÓDIGO COPIADO';
 btn.classList.add('copied');
 clearTimeout(window._cinCodigoCopyTimer);
 window._cinCodigoCopyTimer=setTimeout(()=>{btn.textContent=btn.dataset.originalText||'COPIAR CÓDIGO';btn.classList.remove('copied');},1800);
 }
 CIN_COPIA_CODIGO=true;
 cinLimparVelocidadeAposCopias();
 cinMostrarCopiaConfirmacao('CÓDIGO COPIADO COM SUCESSO');
 }
 catch(e){ mostrarToast('Não foi possível copiar o código.'); }
}



const CIN_CONFIG_KEY='VÉRIX_CINEMOMETROS_V2';
const CIN_SESSION_OPERATOR_KEY='VÉRIX_CINEMOMETRO_OPERADOR_V2';
let CIN_ACTIVE_PROFILE_ID=null;

function cinLerPerfis(){
 try{
 /* sem cinemómetros de fábrica; lista começa vazia */
 const raw=localStorage.getItem(CIN_CONFIG_KEY);
 if(raw===null || raw==='' || raw==='[]') return [];
 const data=JSON.parse(raw||'[]');
 return Array.isArray(data)?data:[];
 }catch(e){return [];}
}
function cinGuardarPerfis(perfis){
 try{localStorage.setItem(CIN_CONFIG_KEY,JSON.stringify(perfis));}catch(e){}
}

function cinCriarId(){
 return 'cin_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
}
function cinNomePerfil(p){
 const parts=[p.marca,p.modelo,p.serie].map(v=>(v||'').trim()).filter(Boolean);
 return parts.length?parts.join(' — '):'Cinemómetro sem identificação';
}
function cinPerfilAtual(){
 return cinLerPerfis().find(p=>p.id===CIN_ACTIVE_PROFILE_ID)||null;
}
function cinAlternarConfiguracao(){cinAbrirGestor();}
function cinAbrirGestor(){
 const panel=document.getElementById('cinConfigPanel');
 if(!panel)return;
 cinAtualizarListaPerfis();
 cinAbrirConfiguracaoModal(false);
}
function cinEscaparHtml(v){
 return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cinAtualizarListaPerfis(){
 const list=document.getElementById('cinProfileList');
 const empty=document.getElementById('cinProfileEmpty');
 const activeCard=document.getElementById('cinActiveDeviceCard');
 if(!list || !activeCard)return;

 let perfis=cinLerPerfis();

 if(!perfis.length){
 list.innerHTML='';
 activeCard.innerHTML=`<div class="cin-no-active"><strong>NENHUM CINEMÓMETRO EM SERVIÇO</strong><small>Crie ou adicione uma ficha técnica para começar.</small></div>`;
 if(empty)empty.style.display='none';
 return;
 }

 if(CIN_ACTIVE_PROFILE_ID && perfis.some(p=>p.id===CIN_ACTIVE_PROFILE_ID)){
 const idx=perfis.findIndex(p=>p.id===CIN_ACTIVE_PROFILE_ID);
 if(idx>0){
 const [ativo]=perfis.splice(idx,1);
 perfis.unshift(ativo);
 cinGuardarPerfis(perfis);
 }
 }else{
 CIN_ACTIVE_PROFILE_ID=perfis[0].id;
 }

 const ativo=perfis[0];
 const ativoNome=cinEscaparHtml(cinNomePerfil(ativo));
 const ativoNota=ativo.nota?cinEscaparHtml(ativo.nota):'Sem nota identificativa';
 const ativoClass=ativo.nota?'has-note':'no-note';

 activeCard.innerHTML=`
 <div class="cin-active-mark"><span>●</span> EM SERVIÇO</div> <div class="cin-active-main"> <strong>${ativoNome}</strong> <small class="${ativoClass}">${ativoNota}</small> </div> <button type="button" class="cin-note-active-btn" onclick="cinEditarNota('${ativo.id}')">${ativo.nota?'✎ EDITAR NOTA':'＋ ADICIONAR NOTA'}</button> <button type="button" class="cin-active-tech-btn" onclick="cinAbrirGestor()">VER / EDITAR FICHA</button>
 `;

 const outros=perfis.slice(1);
 list.innerHTML=outros.map((p,i)=>{
 const nome=cinEscaparHtml(cinNomePerfil(p));
 const nota=p.nota?cinEscaparHtml(p.nota):'Sem nota identificativa';
 return `<div class="cin-profile-item-clean"> <button type="button" class="cin-other-select" onclick="cinSelecionarPerfil('${p.id}')"> <span class="cin-profile-mini-index">#${String(i+2).padStart(2,'0')}</span> <span class="cin-other-info"><strong>${nome}</strong><small class="${p.nota?'has-note':'no-note'}">${nota}</small></span> <span class="cin-other-arrow">›</span> </button> <div class="cin-profile-actions-clean"> <button type="button" class="cin-note-inline-btn-clean" onclick="cinEditarNota('${p.id}')">${p.nota?'✎ NOTA':'＋ NOTA'}</button> <button type="button" class="cin-delete-profile-btn cin-delete-profile-btn-mini" onclick="cinEliminarPerfilPorId('${p.id}')" title="Apagar cinemómetro guardado">🗑 APAGAR</button> </div> </div>`;
 }).join('');

 if(empty)empty.style.display=outros.length?'none':'block';
 cinAplicarPerfil(ativo);
}

function cinEditarNota(id){
 const perfil=cinLerPerfis().find(p=>p.id===id);
 if(!perfil)return;
 const atual=perfil.nota||'';
 let modal=document.getElementById('cinNotaModal');
 if(!modal){
 modal=document.createElement('div');
 modal.id='cinNotaModal';
 modal.className='cin-note-modal';
 modal.innerHTML=`<div class="cin-note-modal-box"> <div class="cin-note-modal-head"><strong>NOTA DO CINEMÓMETRO</strong><button type="button" onclick="cinFecharNota()">×</button></div> <div class="cin-note-modal-body"> <label><span>IDENTIFICAÇÃO INTERNA</span><textarea id="cinNotaTexto" maxlength="180" placeholder="Adiciona uma nota a este cinemómetro."></textarea></label> <small>Podes indicar, por exemplo, a unidade, localização habitual ou qualquer outra referência interna.</small> </div> <div class="cin-note-modal-actions"> <button type="button" class="cancel" onclick="cinFecharNota()">CANCELAR</button> <button type="button" class="save" onclick="cinGuardarNota()">GUARDAR NOTA</button> </div> </div>`;
 document.body.appendChild(modal);
 }
 modal.dataset.profileId=id;
 const area=document.getElementById('cinNotaTexto');
 if(area)area.value=atual;
 modal.classList.add('show');
 setTimeout(()=>area?.focus(),50);
}
function cinGuardarNota(){
 const modal=document.getElementById('cinNotaModal');
 const id=modal?.dataset.profileId;
 if(!id)return;
 const area=document.getElementById('cinNotaTexto');
 const nota=(area?.value||'').trim();
 const perfis=cinLerPerfis();
 const perfil=perfis.find(p=>p.id===id);
 if(!perfil)return;
 perfil.nota=nota;
 cinGuardarPerfis(perfis);
 cinFecharNota();
 cinAtualizarListaPerfis();
 cinAplicarPerfil(perfil);
 mostrarToast(nota?'Nota guardada.':'Nota removida.');
}
function cinFecharNota(){
 document.getElementById('cinNotaModal')?.classList.remove('show');
}

function cinCapturarPerfilFormulario(){
 const ids=['cinMarca','cinModelo','cinSerie','cinANSR','cinIPQ','cinDataIPQ','cinVerificacao','cinCertTipo','cinCert'];
 const p={id:CIN_ACTIVE_PROFILE_ID||cinCriarId()};
 ids.forEach(id=>{
 const e=document.getElementById(id);
 if(e)p[id.replace(/^cin/,'').toLowerCase()]=e.value.trim();
 });
 return p;
}
function cinAplicarPerfil(p){
 if(!p)return;
 const map={
 cinMarca:p.marca||'',
 cinModelo:p.modelo||'',
 cinSerie:p.serie||'',
 cinANSR:p.ansr||'',
 cinIPQ:p.ipq||'',
 cinDataIPQ:p.dataipq||'',
 cinVerificacao:p.verificacao||'primeira',
 cinCertTipo:p.certtipo||'',
 cinCert:p.cert||''
 };
 Object.entries(map).forEach(([id,val])=>{const e=document.getElementById(id);if(e)e.value=val;});
 const label=document.getElementById('cinActiveProfileLabel');
 if(label)label.textContent=cinNomePerfil(p);
 const state=document.getElementById('cinConfigState');
 if(state)state.textContent='CINEMÓMETRO SELECIONADO';
 const summary=document.getElementById('cinConfigSummary');
 if(summary)summary.textContent=cinNomePerfil(p)+(p.nota?' · '+p.nota:'');
 cinAtualizarEMA();cinRecalcular();cinMontarLocal();
}
function cinSelecionarPerfil(id){
 const p=cinLerPerfis().find(x=>x.id===id);
 if(!p)return;
 CIN_ACTIVE_PROFILE_ID=id;
 const perfis=cinLerPerfis();
 const idx=perfis.findIndex(x=>x.id===id);
 if(idx>0){
 const [ativo]=perfis.splice(idx,1);
 perfis.unshift(ativo);
 cinGuardarPerfis(perfis);
 }
 cinAplicarPerfil(p);
 cinAtualizarListaPerfis();
 if(document.body.classList.contains('cin-config-modal-open'))cinFecharConfiguracaoModal();
 else document.getElementById('cinConfigPanel')?.classList.add('collapsed');
}
let CIN_CONFIG_MODAL_STATE=null;
function cinAbrirConfiguracaoModal(isNew=false){
 const panel=document.getElementById('cinConfigPanel');
 if(!panel) return;
 const atual=cinPerfilAtual();
 CIN_CONFIG_MODAL_STATE={
 id:CIN_ACTIVE_PROFILE_ID,
 isNew:!!isNew,
 original:atual?JSON.parse(JSON.stringify(atual)):null
 };
 // Retira a ficha da árvore do módulo e coloca-a diretamente no body.
 // Assim não fica condicionada por transform/overflow/stacking-context do módulo.
 if(panel.parentElement!==document.body) document.body.appendChild(panel);
 panel.classList.remove('collapsed');
 document.body.classList.add('cin-config-modal-open');
 cinCriarOuMostrarConfigOverlay();
 setTimeout(()=>document.getElementById('cinMarca')?.focus(),60);
}
function cinFecharConfiguracaoModal(){
 const panel=document.getElementById('cinConfigPanel');
 if(panel)panel.classList.add('collapsed');
 document.body.classList.remove('cin-config-modal-open');
 const overlay=document.getElementById('cinConfigModalBackdrop');
 if(overlay)overlay.classList.remove('active');
 const confirm=document.getElementById('cinConfigCancelModal');
 if(confirm)confirm.classList.remove('active');
 CIN_CONFIG_MODAL_STATE=null;
}
function cinCriarOuMostrarConfigOverlay(){
 let overlay=document.getElementById('cinConfigModalBackdrop');
 if(!overlay){
 overlay=document.createElement('div');
 overlay.id='cinConfigModalBackdrop';
 overlay.className='cin-config-modal-backdrop';
 overlay.setAttribute('aria-hidden','true');
 document.body.appendChild(overlay);
 }
 overlay.classList.add('active');
}
function cinCancelarConfiguracao(){
 const confirm=document.getElementById('cinConfigCancelModal');
 if(confirm)confirm.classList.add('active');
}
function cinFecharCancelConfigModal(){
 const confirm=document.getElementById('cinConfigCancelModal');
 if(confirm)confirm.classList.remove('active');
}
function cinConfirmarCancelConfiguracao(){
 cinFecharCancelConfigModal();
 const st=CIN_CONFIG_MODAL_STATE;
 if(!st){cinFecharConfiguracaoModal();return;}
 let perfis=cinLerPerfis();
 if(st.isNew && st.id){
 perfis=perfis.filter(p=>p.id!==st.id);
 cinGuardarPerfis(perfis);
 CIN_ACTIVE_PROFILE_ID=perfis[0]?.id||null;
 if(CIN_ACTIVE_PROFILE_ID){
 const ativo=perfis.find(p=>p.id===CIN_ACTIVE_PROFILE_ID);
 if(ativo)cinAplicarPerfil(ativo);
 }
 }else if(st.original){
 const idx=perfis.findIndex(p=>p.id===st.id);
 if(idx>=0){perfis[idx]=st.original;cinGuardarPerfis(perfis);cinAplicarPerfil(st.original);}
 }
 cinAtualizarListaPerfis();
 cinFecharConfiguracaoModal();
}
function cinNovoPerfil(silencioso=false){
 const perfis=cinLerPerfis();
 const p={id:cinCriarId(),marca:'',modelo:'',serie:'',ansr:'',ipq:'',dataipq:'',verificacao:'primeira',certtipo:'',cert:'',nota:''};
 perfis.push(p);
 cinGuardarPerfis(perfis);
 CIN_ACTIVE_PROFILE_ID=p.id;
 cinAtualizarListaPerfis();
 cinAbrirConfiguracaoModal(true);
 if(silencioso)document.getElementById('cinMarca')?.blur();
}
function cinDuplicarPerfil(){
 const p=cinPerfilAtual();
 if(!p){cinNovoPerfil();return;}
 const dup=JSON.parse(JSON.stringify(p));
 dup.id=cinCriarId();
 dup.nota=p.nota||'';
 const perfis=cinLerPerfis();perfis.push(dup);cinGuardarPerfis(perfis);
 CIN_ACTIVE_PROFILE_ID=dup.id;
 cinAtualizarListaPerfis();
 cinAbrirConfiguracaoModal(true);
}
let CIN_PENDING_DELETE_ID=null;
function cinEliminarPerfilPorId(id){
 const perfis=cinLerPerfis();
 const p=perfis.find(x=>x.id===id);
 if(!p)return;
 CIN_PENDING_DELETE_ID=id;
 const nomeEl=document.getElementById('cinDeleteProfileName');
 if(nomeEl)nomeEl.textContent=cinNomePerfil(p);
 const modal=document.getElementById('cinDeleteModal');
 if(modal)modal.classList.add('active');
}
function cinFecharDeleteModal(){
 CIN_PENDING_DELETE_ID=null;
 const modal=document.getElementById('cinDeleteModal');
 if(modal)modal.classList.remove('active');
}
function cinConfirmarDeletePerfil(){
 const id=CIN_PENDING_DELETE_ID;
 if(!id){cinFecharDeleteModal();return;}
 cinFecharDeleteModal();
 const perfis=cinLerPerfis();
 const p=perfis.find(x=>x.id===id);
 if(!p)return;
 const restantes=perfis.filter(x=>x.id!==id);
 cinGuardarPerfis(restantes);
 if(CIN_ACTIVE_PROFILE_ID===id) CIN_ACTIVE_PROFILE_ID=restantes[0]?.id||null;
 if(CIN_ACTIVE_PROFILE_ID){
 const ativo=restantes.find(x=>x.id===CIN_ACTIVE_PROFILE_ID);
 if(ativo) cinAplicarPerfil(ativo);
 }else{
 ['cinMarca','cinModelo','cinSerie','cinANSR','cinIPQ','cinDataIPQ','cinCertTipo','cinCert'].forEach(fid=>{const e=document.getElementById(fid);if(e)e.value='';});
 }
 cinAtualizarListaPerfis();
 mostrarToast('Cinemómetro apagado dos guardados.');
}
function cinEliminarPerfil(){
 const p=cinPerfilAtual();
 if(p) cinEliminarPerfilPorId(p.id);
}
function cinGuardarConfiguracao(){
 let perfis=cinLerPerfis();
 if(!CIN_ACTIVE_PROFILE_ID)CIN_ACTIVE_PROFILE_ID=cinCriarId();
 const p=cinCapturarPerfilFormulario();
 p.id=CIN_ACTIVE_PROFILE_ID;
 const idx=perfis.findIndex(x=>x.id===p.id);
 if(idx>=0)perfis[idx]=p;else perfis.push(p);
 cinGuardarPerfis(perfis);
 cinAplicarPerfil(p);
 cinAtualizarListaPerfis();
 cinFecharConfiguracaoModal();
 mostrarToast('Configuração do cinemómetro guardada.');
}
function cinLerSessaoOperador(){
 try{return JSON.parse(localStorage.getItem(CIN_SESSION_OPERATOR_KEY)||'null');}catch(e){return null;}
}
function cinGuardarSessaoOperador(){
 const data={
 posto:document.getElementById('cinSessaoOperadorPosto')?.value||'',
 numero:document.getElementById('cinSessaoOperadorNo')?.value||'',
 nome:document.getElementById('cinSessaoOperadorNome')?.value||'',
 modo:document.getElementById('cinSessaoModo')?.value||'fixo',
 veiculo:document.getElementById('cinVeiculo')?.value||'ligeiros',
 regime:document.getElementById('cinRegime')?.value||'local_geral',
 limite:document.getElementById('cinLimite')?.value||''
 };
 try{localStorage.setItem(CIN_SESSION_OPERATOR_KEY,JSON.stringify(data));}catch(e){}
 cinMontarTexto();
}
function cinCarregarSessaoOperador(){
 const data=cinLerSessaoOperador();if(!data)return;
 const a=document.getElementById('cinSessaoOperadorPosto');if(a)a.value=data.posto||'';
 const b=document.getElementById('cinSessaoOperadorNo');if(b)b.value=data.numero||'';
 const c=document.getElementById('cinSessaoOperadorNome');if(c)c.value=data.nome||'';
 const d=document.getElementById('cinSessaoModo');if(d)d.value=data.modo||'fixo';
 const e=document.getElementById('cinVeiculo');if(e)e.value=data.veiculo||'ligeiros';
 const f=document.getElementById('cinRegime');if(f)f.value=data.regime||'local_geral';
 const g=document.getElementById('cinLimite');if(g && data.limite!==undefined)g.value=data.limite||'';
}
function cinAtualizarSessaoOperador(){cinGuardarSessaoOperador();cinAtualizarEMA();cinRecalcular();cinMontarTexto();}

async function cinCopiarTexto() {
 const t=document.getElementById('cinTexto')?.value||'';
 const btn=document.getElementById('cinCopiarTextoBtn');
 if(!t)return;
 try{
 await navigator.clipboard.writeText(t);
 if(btn){
 btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
 btn.textContent='TEXTO COPIADO';
 btn.classList.add('copied');
 clearTimeout(window._cinTextoCopyTimer);
 window._cinTextoCopyTimer=setTimeout(()=>{btn.textContent=btn.dataset.originalText||'COPIAR TEXTO';btn.classList.remove('copied');},1800);
 }
 CIN_COPIA_TEXTO=true;
 cinLimparVelocidadeAposCopias();
 cinMostrarCopiaConfirmacao('TEXTO COPIADO COM SUCESSO');
 }
 catch(e){mostrarToast('Não foi possível copiar a descrição.');}
}

async function cinCopiarLocal() {
 const t=cinMontarLocal();
 try{await navigator.clipboard.writeText(t);mostrarToast('Local copiado.');}
 catch(e){mostrarToast('Não foi possível copiar o local.');}
}

document.addEventListener('input', function(e){
 if(['cinMarca','cinModelo','cinSerie','cinANSR','cinIPQ','cinDataIPQ','cinCertTipo','cinCert','cinSessaoOperadorNome','cinSessaoOperadorNo','cinSessaoOperadorPosto'].includes(e.target?.id)){
 if(e.target.id==='cinLimite')e.target.dataset.manual='1';
 cinMontarTexto();
 }
 if(e.target?.id==='cinLimite'){e.target.dataset.manual='1';cinRecalcular();}
});

const _cinOriginalAbrirModulo = abrirModulo;
abrirModulo = function(nome,el){
 _cinOriginalAbrirModulo(nome,el);
 if(nome==='cinemometro') setTimeout(()=>{
 cinCarregarSessaoOperador();
 
 const _cinRegimeDefault = document.getElementById('cinRegime');
 if(_cinRegimeDefault) _cinRegimeDefault.value='autoestrada';
 
 let _factoryResetPending=false;
 try{_factoryResetPending=localStorage.getItem('VÉRIX_FACTORY_RESET_PENDING')==='1';}catch(e){}
 cinAtualizarListaPerfis();
 
 try{
 const _prefsCin=Object.assign({cinRadarCollapsed:true},JSON.parse(localStorage.getItem('VÉRIX_PREFS_V1')||'{}'));
 if(typeof cinAlternarListaCinemometros==='function') cinAlternarListaCinemometros(!!_prefsCin.cinRadarCollapsed);
 }catch(e){}
 if(_factoryResetPending){try{localStorage.removeItem('VÉRIX_FACTORY_RESET_PENDING')}catch(e){}}
 cinAtualizarLimite();
 cinAtualizarEMA();
 cinRecalcular();
 cinMontarLocal();
 const speed=document.getElementById('cinRegistada');
 if(speed){speed.value='';speed.focus();}
 const sec=document.getElementById('cinOtherRadarsSection');
 const screen=document.querySelector('.cin-one-screen');
 if(sec&&screen)screen.classList.toggle('cin-list-expanded',!sec.classList.contains('collapsed'));
 },0);
};

function toggleFullscreen() {
 const doc = document.documentElement;
 if (!document.fullscreenElement) {
 doc.requestFullscreen();
 } else {
 document.exitFullscreen();
 }
 }
