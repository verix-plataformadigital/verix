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



 