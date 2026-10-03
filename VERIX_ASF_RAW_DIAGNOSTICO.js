/* VÉRIX ASF forensic capture — does not alter the ASF request or retry policy. */
(function(){
  'use strict';
  if (window.__VERIX_ASF_RAW_CAPTURE__) return;
  window.__VERIX_ASF_RAW_CAPTURE__ = true;
  var originalFetch = window.fetch;
  var responses = [];
  function plateFromUrl(url){
    try {
      var u = new URL(String(url), window.location.href);
      var q = u.searchParams.get('query') || '';
      var m = q.match(/license:\s*\\?"([A-Z0-9-]+)\\?"/i);
      return m ? m[1].toUpperCase() : null;
    } catch (_) { return null; }
  }
  window.fetch = function(input, init){
    var url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (_) {}
    var isASF = String(url).indexOf('ext01.asf.com.pt/api/src/') >= 0;
    var p = originalFetch.apply(this, arguments);
    if (!isASF) return p;
    return p.then(function(response){
      var clone = response.clone();
      return clone.text().then(function(text){
        responses.push({at:Date.now(),plate:plateFromUrl(url),status:response.status,contentType:response.headers&&response.headers.get?response.headers.get('content-type'):null,raw:String(text||'').slice(0,4000)});
        if (responses.length > 30) responses.shift();
        return response;
      }).catch(function(){ return response; });
    });
  };
  function augment(){
    if (typeof window.mostrarSeguroErro !== 'function') return false;
    if (window.__VERIX_ASF_RAW_WRAPPED__) return true;
    var original = window.mostrarSeguroErro;
    window.mostrarSeguroErro = function(mensagem, matricula, diagnostico, queryId, asfDiagnostic){
      try {
        var plate = String(matricula || '').replace(/[^A-Z0-9]/gi,'').toUpperCase();
        var now = Date.now();
        for (var i=responses.length-1;i>=0;i--) {
          var r=responses[i];
          if (now-r.at>15000) continue;
          if (r.plate && plate && r.plate.replace(/[^A-Z0-9]/gi,'')!==plate) continue;
          if (asfDiagnostic && typeof asfDiagnostic==='object') {
            asfDiagnostic.asfRawResponse=r.raw;
            try {
              var j=JSON.parse(r.raw);
              if(Array.isArray(j.errors)){
                asfDiagnostic.asfGraphqlMessages=j.errors.map(function(e){return e&&e.message?String(e.message).slice(0,1000):'';}).filter(Boolean).slice(0,10);
                asfDiagnostic.asfGraphqlCodes=j.errors.map(function(e){return e&&e.extensions&&e.extensions.code?String(e.extensions.code).slice(0,200):'';}).filter(Boolean).slice(0,10);
              }
            } catch (_) {}
            asfDiagnostic.asfResponseBytes=r.raw.length;
          }
          break;
        }
      } catch (_) {}
      return original.apply(this, arguments);
    };
    window.__VERIX_ASF_RAW_WRAPPED__=true;
    return true;
  }
  var timer=setInterval(function(){if(augment())clearInterval(timer);},250);
  setTimeout(function(){clearInterval(timer);},30000);
})();