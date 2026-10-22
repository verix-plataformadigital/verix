
(function(){
  function qs(id){ return document.getElementById(id); }

  function tryCall(name){
    try{
      if(typeof window[name]==='function'){
        window[name].apply(null,Array.prototype.slice.call(arguments,1));
        return true;
      }
    }catch(e){}
    return false;
  }

  function onKey(e){
    var tag=(e.target&&e.target.tagName)?e.target.tagName.toUpperCase():'';
    var typing=tag==='INPUT'||tag==='TEXTAREA';

    if(e.key==='Enter'&&typing){
      var form=e.target.form||qs('formConsulta')||document.querySelector('.searchbar form');
      if(form){
        e.preventDefault();
        if(typeof form.requestSubmit==='function') form.requestSubmit();
        else{
          var btn=form.querySelector('.consult,button[type="submit"]');
          if(btn) btn.click();
        }
      }
      return;
    }

    // Atalhos F1/F2 removidos; usar a navegação visível e os comandos universais.

    // Escape é gerido pelo controlador global, que fecha apenas a camada superior.
  }

  function ready(fn){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true});
    else fn();
  }

  ready(function(){
    try{ document.body.classList.add('fx-hud-body','ops-console-12'); }catch(e){}
    document.addEventListener('keydown',onKey,true);

    try{
      var a=qs('MatriculaVeiculo');
      var b=qs('MatriculaReboque');
      if(a&&!a.getAttribute('placeholder')) a.setAttribute('placeholder','AA-00-AA');
      if(b&&!b.getAttribute('placeholder')) b.setAttribute('placeholder','Reboque');
      if(a) a.setAttribute('title','Matrícula do veículo — Enter para consultar');
      if(b) b.setAttribute('title','Matrícula do reboque (opcional)');
    }catch(e){}
  });
})();
