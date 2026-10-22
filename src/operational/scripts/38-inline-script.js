
(function(){
function cinV44AtualizarRegimeVisual(){
 const r=document.getElementById('cinRegime');
 const wrap=document.querySelector('label:has(#cinRegime)');
 const lim=document.getElementById('cinLimite');
 const lw=lim?.closest('.cin-limit-wrap');
 if(!r)return;
 const entre=(r.value==='local_placas'||r.value==='fora_placas'||r.value==='auto_placas');
 const lab=r.closest('label');
 if(lab)lab.classList.toggle('cin-regime-between',entre);
 if(lw)lw.classList.toggle('cin-regime-between',entre);
 if(lw){
 const input=lw.querySelector('input');
 if(input && r.value==='auto_placas') input.classList.add('cin-limit-between');
 else if(input) input.classList.remove('cin-limit-between');
 }
 }
document.addEventListener('change',function(e){
 if(e.target?.id==='cinRegime') setTimeout(cinV44AtualizarRegimeVisual,0);
 });
 setTimeout(function(){
 try{cinV44AtualizarRegimeVisual();}catch(e){}
 },0);
})();
