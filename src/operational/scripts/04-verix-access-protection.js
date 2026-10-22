
(function(){
  'use strict';

  var ALLOWED_HOSTS={
    'verix-plataformadigital.github.io':true,
    'localhost':true,
    '127.0.0.1':true,
    '[::1]':true
  };

  function hostAuthorized(){
    try{
      var protocol=String(window.location.protocol||'');
      if(protocol!=='http:' && protocol!=='https:') return true;
      return !!ALLOWED_HOSTS[String(window.location.hostname||'').toLowerCase()];
    }catch(_){
      return false;
    }
  }

  function blockUnauthorized(){
    try{
      document.documentElement.innerHTML='';
      var head=document.createElement('head');
      var meta=document.createElement('meta');
      meta.charset='utf-8';
      var title=document.createElement('title');
      title.textContent='VÉRIX — Acesso não autorizado';
      head.appendChild(meta);
      head.appendChild(title);

      var body=document.createElement('body');
      body.style.cssText='margin:0;min-height:100vh;background:#03080c;color:#eef4f5;font-family:Arial,Helvetica,sans-serif;display:grid;place-items:center;padding:24px;box-sizing:border-box';

      var box=document.createElement('div');
      box.style.cssText='max-width:620px;padding:34px 36px;border:1px solid #5b7078;border-radius:18px;background:#0b1820;box-shadow:0 24px 70px rgba(0,0,0,.55);text-align:center';

      var tag=document.createElement('div');
      tag.style.cssText='display:inline-block;margin-bottom:14px;padding:6px 10px;border:1px solid #c8102e;border-radius:999px;color:#ff7c91;font-size:11px;font-weight:800;letter-spacing:1.2px';
      tag.textContent='VÉRIX // PROTEÇÃO';

      var h=document.createElement('div');
      h.style.cssText='font-size:28px;font-weight:900;margin-bottom:12px';
      h.textContent='Publicação não autorizada';

      var p=document.createElement('div');
      p.style.cssText='color:#b9c7cc;font-size:15px;line-height:1.6';
      p.textContent='Esta versão do VÉRIX não está autorizada a funcionar neste endereço.';

      box.appendChild(tag);
      box.appendChild(h);
      box.appendChild(p);
      body.appendChild(box);

      document.documentElement.appendChild(head);
      document.documentElement.appendChild(body);
    }catch(_){
      try{document.body.textContent='VÉRIX — Publicação não autorizada.';}catch(__){}
    }
  }

  if(!hostAuthorized()){
    blockUnauthorized();
    throw new Error('VÉRIX: publicação não autorizada neste domínio.');
  }

  try{
    if(window.top!==window.self){
      window.top.location=window.location.href;
    }
  }catch(_){
    try{window.location.replace(window.location.href);}catch(__){}
  }

  document.addEventListener('contextmenu',function(e){e.preventDefault();},true);
  document.addEventListener('dragstart',function(e){e.preventDefault();},true);
  document.addEventListener('keydown',function(e){
    var k=String(e.key||'').toUpperCase();
    var blocked =
      k==='F12' ||
      (e.ctrlKey && e.shiftKey && ['I','J','C'].indexOf(k)>=0) ||
      (e.ctrlKey && ['U','S'].indexOf(k)>=0) ||
      (e.ctrlKey && e.shiftKey && k==='K');
    if(blocked){
      try{e.preventDefault();e.stopPropagation();}catch(_){}
      return false;
    }
  },true);
})();
