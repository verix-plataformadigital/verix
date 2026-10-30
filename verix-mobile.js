(function(){
'use strict';

/*
 * VÉRIX handheld bootstrap.
 * Do not rewrite arbitrary layout nodes here: the responsive contract is
 * implemented with state-scoped CSS in verix-mobile-final.css.
 */
var queryMobile=/(?:^|[?&])_mobile=1(?:&|$)/.test(String(window.location.search||''));
var userAgent=String(navigator.userAgent||'');
var coarsePointer=false;
try{
  coarsePointer=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
}catch(e){}
var handheld=!!window.__VERIX_MOBILE_ROUTE||queryMobile||coarsePointer||
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
if(!handheld)return;

var root=document.documentElement;
root.classList.add('vx-handheld','vx-mobile-bootstrap');
var viewport=document.querySelector('meta[name="viewport"]');
if(viewport)viewport.setAttribute('content','width=device-width,initial-scale=1,viewport-fit=cover');

var mobileStylesheet=document.querySelector('link[href*="verix-mobile.css"]');
if(mobileStylesheet)mobileStylesheet.media='all';

function syncViewportHeight(){
  try{
    var visual=window.visualViewport;
    var height=Math.round((visual&&visual.height)||window.innerHeight||0);
    if(height>0)root.style.setProperty('--vx-vh',height+'px');
  }catch(e){}
}
syncViewportHeight();
window.addEventListener('resize',syncViewportHeight,{passive:true});
if(window.visualViewport)window.visualViewport.addEventListener('resize',syncViewportHeight,{passive:true});

function activateBody(){
  if(!document.body)return;
  document.body.classList.add('vx-mobile-mode');
  document.querySelectorAll('input,textarea,select').forEach(function(el){
    var hint=[
      el.placeholder,el.name,el.id,el.getAttribute('aria-label')
    ].join(' ').toLowerCase();
    if(/matr[ií]cula|placa|ve[ií]culo|license|registration/.test(hint)){
      el.setAttribute('inputmode','text');
      el.setAttribute('autocapitalize','characters');
      el.setAttribute('spellcheck','false');
    }
  });
  document.querySelectorAll('table').forEach(function(table){
    if(!table.parentElement||table.parentElement.classList.contains('vx-scroll-x'))return;
    var wrap=document.createElement('div');
    wrap.className='vx-scroll-x';
    table.parentNode.insertBefore(wrap,table);
    wrap.appendChild(table);
  });
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',activateBody,{once:true});
}else{
  activateBody();
}

window.VERIX_MOBILE_ADAPTER={
  version:'2.0',
  navigation:false,
  layout:'state-scoped'
};
})();