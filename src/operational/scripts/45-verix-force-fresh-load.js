
(function(){
  window.VERIXForceFreshLoad=function(){
    try{
      var current=window.location.href;
      var hash=window.location.hash||'';
      var base=current.split('#')[0];
      var url=new URL(base);
      url.searchParams.set('_verix_refresh',String(Date.now()));
      url.hash=hash.replace(/^#/, '');
      window.location.replace(url.toString());
    }catch(e){
      try{ window.location.reload(); }catch(_){ window.location.href=window.location.href; }
    }
  };
})();
