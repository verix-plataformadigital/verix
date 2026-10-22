
(function(){
 function showLegCopyFeedback(btn,label){
 if(!btn)return;
 const old=btn.dataset.originalText || btn.textContent;
 btn.dataset.originalText=old;
 btn.textContent=label;
 btn.classList.add('copied');
 btn.classList.add('leg-copy-feedback');
 setTimeout(()=>{btn.textContent=old;btn.classList.remove('copied','leg-copy-feedback');},1600);
 const toast=document.getElementById('toastNotification');
 if(toast){
 toast.textContent='COPIADO PARA A ÁREA DE TRANSFERÊNCIA';
 toast.classList.add('show');
 clearTimeout(window.__legCopyToastTimer);
 window.__legCopyToastTimer=setTimeout(()=>toast.classList.remove('show'),1800);
 }
 }

 function copiarTextoLegislacao(texto,btn){
 const valor=String(texto||'').trim();
 if(!valor)return;
 const sucesso=()=>showLegCopyFeedback(btn,'✓ COPIADO');
 function fallback(){
  const area=document.createElement('textarea');
  area.value=valor;area.style.position='fixed';area.style.left='-9999px';area.style.top='0';
  document.body.appendChild(area);area.focus();area.select();
  try{document.execCommand('copy');sucesso();}catch(e){}
  area.remove();
 }
 if(navigator.clipboard && window.isSecureContext){
  navigator.clipboard.writeText(valor).then(sucesso).catch(fallback);
 }else fallback();
 }
 window.copiarLegislacaoDescricao=copiarTextoLegislacao;
 window.copiarLegislacao=copiarTextoLegislacao;
 
 const oldFilter=window.filtrarLegislacao;
 if(typeof oldFilter==='function'){
 window.filtrarLegislacao=function(valor){
 const result=oldFilter.apply(this,arguments);
 const raw=String(valor||'').trim();
 const q=typeof window.VÉRIX10?.searchNorm==='function'?window.VÉRIX10.searchNorm(raw):raw.toLowerCase();
 document.querySelectorAll('.leg-category-panel').forEach(panel=>{
 const count=panel.querySelector('.leg-panel-count');
 if(!count)return;
 const visible=[...panel.querySelectorAll('.leg-card-new')].filter(c=>getComputedStyle(c).display!=='none');
 const total=panel.querySelectorAll('.leg-card-new').length;
 if(q){
 count.textContent=`${visible.length} ${visible.length===1?'RESULTADO':'RESULTADOS'}`;
 count.classList.add('filtered');
 }else{
 count.textContent=`${total} REGISTOS`;
 count.classList.remove('filtered');
 }
 });
 return result;
 };
 }
})();
