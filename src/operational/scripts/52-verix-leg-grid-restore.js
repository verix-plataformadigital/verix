
(function(){
 function sync(){
 try{
 var any=document.querySelector('.leg-category-panel.open');
 var grid=document.querySelector('.leg-category-grid');
 if(grid) grid.style.display = any ? 'none' : '';
 }catch(e){}
 }
 document.addEventListener('click', function(e){
 var t=e.target;
 if(!t) return;
 var txt=(t.textContent||'').replace(/\s+/g,' ').trim();
 if(/FECHAR/.test(txt) || /VOLTAR/.test(txt) || t.classList.contains('leg-back')){
 setTimeout(sync, 0);
 setTimeout(sync, 50);
 }
 }, true);
 if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', sync);
 else sync();
})();
