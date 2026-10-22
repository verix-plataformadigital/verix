
(function(){
 function initAlcohol(){
 if(typeof inicializarTabelaAlcoolLive==='function') inicializarTabelaAlcoolLive();
 }

 // The cards call the global abrirModulo(). Hook the final version so the
 // dynamically injected alcohol UI is initialized after moduleBody.innerHTML.
 const prev=window.abrirModulo;
 if(typeof prev==='function'){
 window.abrirModulo=function(nome,el){
 const result=prev.apply(this,arguments);
 if(nome==='alcoolExcel') setTimeout(initAlcohol,0);
 return result;
 };
 }
})();
