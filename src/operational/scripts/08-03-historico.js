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

 