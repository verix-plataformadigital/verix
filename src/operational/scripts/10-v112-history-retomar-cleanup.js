
(function(){
 function limpar(){
 var root=document.getElementById('historyOverlay'); if(!root) return;
 var els=root.querySelectorAll('button,a');
 els.forEach(function(el){
 var txt=(el.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
 if(txt.indexOf('RETOMAR CONSULTA')!==-1){ el.remove(); }
 });
 }
 if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',limpar); else limpar();
 new MutationObserver(limpar).observe(document.documentElement,{childList:true,subtree:true});
})();
