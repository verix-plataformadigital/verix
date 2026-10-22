
(function(){
 function aplicar(){
 try{
 const r=document.getElementById('cinRegime');
 if(!r)return;
 r.value='autoestrada';
 if(typeof window.cinAtualizarLimite==='function') window.cinAtualizarLimite();
 }catch(e){}
 }
 const oldOpen=window.abrirModulo;
 if(typeof oldOpen==='function' && !window.__cinV158Wrapped){
 window.__cinV158Wrapped=true;
 window.abrirModulo=function(nome,el){
 oldOpen(nome,el);
 if(nome==='cinemometro') setTimeout(aplicar,20);
 };
 }
})();
