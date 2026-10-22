
(function(){
 function atualizarDataSistema(){
 var agora=new Date();
 var meses=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
 var el=document.getElementById('dataSistema');
 if(el){
 var dd=String(agora.getDate()).padStart(2,'0');
 var hh=String(agora.getHours()).padStart(2,'0');
 var mm=String(agora.getMinutes()).padStart(2,'0');
 var ss=String(agora.getSeconds()).padStart(2,'0');
 var dataTexto=dd+' '+meses[agora.getMonth()]+' '+agora.getFullYear()+' | '+hh+':'+mm+':'+ss;
 var dateEl=el.querySelector('.date-label');
 if(dateEl) dateEl.textContent=dataTexto;
 else el.textContent=dataTexto;
 }
 }
 atualizarDataSistema();
 setInterval(atualizarDataSistema,1000);
})();
