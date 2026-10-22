


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

