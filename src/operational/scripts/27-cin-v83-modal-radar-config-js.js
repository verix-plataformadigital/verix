(function(){
 'use strict';
 function syncRadarListViewport(shouldScroll){
  const screen=document.querySelector('.cin-one-screen');
  const section=document.getElementById('cinOtherRadarsSection');
  const body=document.querySelector('.module-overlay.cinemometro-fullpage .module-body');
  if(!section)return;
  const collapsed=section.classList.contains('collapsed');
  if(screen)screen.classList.toggle('cin-list-expanded',!collapsed);
  if(body)body.classList.toggle('cin-radar-expanded',!collapsed);
  if(collapsed){if(body)body.scrollTop=0;return;}
  if(shouldScroll){
   setTimeout(()=>{
    const target=document.getElementById('cinOtherRadarsSection');
    if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
    const search=document.getElementById('cinRadarSearch');
    if(search)search.focus();
   },80);
  }
 }
 const originalToggle=window.cinAlternarListaCinemometros;
 if(typeof originalToggle==='function'){
  window.cinAlternarListaCinemometros=function(force){
   const result=originalToggle.apply(this,arguments);
   const section=document.getElementById('cinOtherRadarsSection');
   syncRadarListViewport(section&&!section.classList.contains('collapsed'));
   return result;
  };
 }
 document.addEventListener('click',function(e){
  if(e.target?.closest('#cinCollapseRadarListBtn'))setTimeout(()=>syncRadarListViewport(false),0);
 });
 document.addEventListener('keydown',function(e){
  const panel=document.getElementById('cinConfigPanel');
  if(panel&&document.body.classList.contains('cin-config-modal-open')&&e.key==='Escape'){
   e.preventDefault();e.stopImmediatePropagation();
  }
 },true);
 window.addEventListener('load',()=>setTimeout(()=>syncRadarListViewport(false),80));
 setTimeout(()=>syncRadarListViewport(false),60);
})();