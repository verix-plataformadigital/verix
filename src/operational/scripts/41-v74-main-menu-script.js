
(function(){
 const oldMostrar=window.mostrarMenuPrincipal;
 if(typeof oldMostrar==='function'){
 window.mostrarMenuPrincipal=function(){
 document.body.classList.remove('consultation-screen-active');
 const r=oldMostrar.apply(this,arguments);
 atualizarMenuPrincipalRelogio();
 return r;
 };
 }
 const oldAbrirConsulta=window.abrirConsultaPrincipal;
 if(typeof oldAbrirConsulta==='function'){
 window.abrirConsultaPrincipal=function(){
 document.body.classList.add('consultation-screen-active');
 return oldAbrirConsulta.apply(this,arguments);
 };
 }
 const oldAbrirModulo=window.abrirModulo;
 if(typeof oldAbrirModulo==='function'){
 window.abrirModulo=function(nome,el){
 document.body.classList.remove('consultation-screen-active');
 return oldAbrirModulo.apply(this,arguments);
 };
 }
 function atualizarMenuPrincipalRelogio(){
 const el=document.getElementById('mainMenuDateTime'); if(!el)return;
 const d=new Date();
 const meses=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
 const dd=String(d.getDate()).padStart(2,'0');
 const hh=String(d.getHours()).padStart(2,'0');
 const mm=String(d.getMinutes()).padStart(2,'0');
 const ss=String(d.getSeconds()).padStart(2,'0');
 el.textContent=dd+' '+meses[d.getMonth()]+' '+d.getFullYear()+' | '+hh+':'+mm+':'+ss;
 }
 window.addEventListener('DOMContentLoaded',function(){
 atualizarMenuPrincipalRelogio();
 setInterval(atualizarMenuPrincipalRelogio,1000);
 });
})();
