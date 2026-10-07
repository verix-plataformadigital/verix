/* VÉRIX ASF forensic capture V6 — PASSIVE ONLY.
 * IMPORTANTE: este ficheiro observa a chamada ASF sem a repetir, atrasar,
 * substituir a resposta ou alterar a política de retry da aplicação.
 */
(function(){
  'use strict';

  if (window.__VERIX_ASF_FORENSICS_V6__) return;
  window.__VERIX_ASF_FORENSICS_V6__ = true;
  window.__VERIX_ASF_FORENSICS_VERSION__ = '6';

  var originalFetch = window.fetch;
  var captures = [];
  var captureSeq = 0;
  var MAX_CAPTURES = 40;
  var MAX_RAW = 262144;
  var MAX_QUERY = 16000;
  var MAX_STACK = 8000;
  var MAX_HEADERS = 60;

  function s(v,max){
    try {
      var x=String(v==null?'':v);
      return max?x.slice(0,max):x;
    } catch(_){return '';}
  }
  function finite(v){return typeof v==='number'&&isFinite(v)?v:null;}
  function safeJson(v,max){try{return s(JSON.stringify(v),max||16000);}catch(_){return '';}}
  function fnv1a(text){
    var h=2166136261,str=String(text||'');
    for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
    return ('00000000'+(h>>>0).toString(16)).slice(-8);
  }
  function redactHeader(name,value){
    var n=String(name||'').toLowerCase();
    if(n==='authorization'||n==='cookie'||n==='set-cookie'||n==='proxy-authorization'||
       n.indexOf('api-key')>=0||n.indexOf('apikey')>=0||n.indexOf('token')>=0||n.indexOf('secret')>=0)
      return '[REDACTED]';
    return s(value,2000);
  }
  function headerObject(headers){
    var out={},count=0;
    try{
      if(headers&&typeof headers.forEach==='function'){
        headers.forEach(function(v,k){
          if(count>=MAX_HEADERS)return;
          out[s(k,100)]=redactHeader(k,v);count++;
        });
      }
    }catch(_){}
    return out;
  }
  function clientContext(){
    var c={};
    try{
      var n=window.navigator||{};
      c.userAgent=s(n.userAgent,1000); c.platform=s(n.platform,200);
      c.language=s(n.language,50);
      c.onLine=typeof n.onLine==='boolean'?n.onLine:null;
      c.cookieEnabled=typeof n.cookieEnabled==='boolean'?n.cookieEnabled:null;
      c.webdriver=typeof n.webdriver==='boolean'?n.webdriver:null;
      c.viewport={width:window.innerWidth||null,height:window.innerHeight||null,dpr:finite(window.devicePixelRatio)};
    }catch(_){}
    return c;
  }
  function parseRequest(url){
    var out={plate:null,date:null,operation:null,query:null};
    try{
      var u=new URL(String(url),window.location.href),q=u.searchParams.get('query')||'';
      out.query=s(q,MAX_QUERY);
      var m=q.match(/license\s*:\s*"([A-Z0-9-]+)"/i);
      if(m)out.plate=s(m[1],50).toUpperCase();
      var d=q.match(/date\s*:\s*"([0-9/ -]+)"/i);
      if(d)out.date=s(d[1],50);
      var op=q.match(/(?:mutation|query)\s+([A-Za-z0-9_]+)/i);
      if(op)out.operation=s(op[1],100);
    }catch(_){}
    return out;
  }
  function isASF(url){return String(url||'').indexOf('ext01.asf.com.pt/api/src/')>=0;}
  function graphqlDetails(raw){
    var out={isJson:false,topLevelKeys:[],hasData:false,dataKeys:[],hasErrors:false,errorCount:0,errors:[],graphqlErrorsJson:''};
    try{
      var j=JSON.parse(raw);out.isJson=true;
      if(j&&typeof j==='object'&&!Array.isArray(j)){
        out.topLevelKeys=Object.keys(j).slice(0,80);
        out.hasData=Object.prototype.hasOwnProperty.call(j,'data');
        if(j.data&&typeof j.data==='object'&&!Array.isArray(j.data))out.dataKeys=Object.keys(j.data).slice(0,80);
        if(Array.isArray(j.errors)){
          out.hasErrors=true;out.errorCount=j.errors.length;
          out.errors=j.errors.slice(0,20).map(function(e){
            return {message:s(e&&e.message,4000),locations:Array.isArray(e&&e.locations)?e.locations.slice(0,20):[],
              path:Array.isArray(e&&e.path)?e.path.slice(0,20):[],
              extensions:e&&e.extensions&&typeof e.extensions==='object'?e.extensions:null};
          });
          out.graphqlErrorsJson=safeJson(j.errors,50000);
        }
      }
    }catch(_){}
    return out;
  }
  function addCapture(c){
    captures.push(c);
    if(captures.length>MAX_CAPTURES)captures.shift();
  }
  function buildBase(url,method,input,init){
    var parsed=parseRequest(url),stamp=Date.now(),body=null;
    try{
      if(init&&typeof init.body==='string')body=s(init.body,32000);
    }catch(_){}
    return {
      captureVersion:'6',captureId:'asf-'+stamp+'-'+(++captureSeq),
      requestStartEpochMs:stamp,requestStartIso:new Date(stamp).toISOString(),
      method:s(method||'GET',20).toUpperCase(),url:s(url,8000),query:parsed,
      requestHeaders:mergeHeaders(input,init),requestBody:body,
      requestBodyBytes:body!=null?body.length:null,requestBodyHash:body!=null?fnv1a(body):null,
      client:clientContext(),callerStack:s((new Error()).stack,MAX_STACK),
      ok:null,status:null,statusText:null,redirected:null,responseType:null,responseUrl:null,
      responseHeaders:{},responseContentType:null,responseBytes:null,responseBodyHash:null,
      rawResponse:'',graphql:null,error:null,requestEndEpochMs:null,requestEndIso:null,durationMs:null,isError:null
    };
  }
  function mergeHeaders(input,init){
    var merged={};
    try{
      var ih=input&&input.headers;
      if(ih&&typeof ih.forEach==='function')ih.forEach(function(v,k){merged[s(k,100)]=redactHeader(k,v);});
    }catch(_){}
    try{
      var h=init&&init.headers;
      if(h&&typeof h.forEach==='function')h.forEach(function(v,k){merged[s(k,100)]=redactHeader(k,v);});
      else if(h&&typeof h==='object')Object.keys(h).slice(0,MAX_HEADERS).forEach(function(k){merged[s(k,100)]=redactHeader(k,h[k]);});
    }catch(_){}
    return merged;
  }
  function finish(c,response,raw,err){
    var end=Date.now();
    c.requestEndEpochMs=end;c.requestEndIso=new Date(end).toISOString();
    c.durationMs=end-c.requestStartEpochMs;
    if(response){
      c.ok=typeof response.ok==='boolean'?response.ok:null;
      c.status=finite(response.status);c.statusText=s(response.statusText,300);
      c.redirected=typeof response.redirected==='boolean'?response.redirected:null;
      c.responseType=s(response.type,80);c.responseUrl=s(response.url,8000);
      c.responseHeaders=headerObject(response.headers);
      c.responseContentType=response.headers&&response.headers.get?s(response.headers.get('content-type'),200):null;
    }
    if(raw!=null){
      var full=String(raw);c.responseBytes=full.length;c.responseBodyHash=fnv1a(full);
      c.rawResponse=full.slice(0,MAX_RAW);c.graphql=graphqlDetails(full);
      c.isError=(c.status!=null&&(c.status<200||c.status>=300))||!!(c.graphql&&c.graphql.hasErrors);
    }else c.isError=true;
    if(err)c.error={name:s(err.name,200),message:s(err.message,2000),code:s(err.code,200),stack:s(err.stack,MAX_STACK)};
  }

  function captureFetch(input,init,url,method){
    var c=buildBase(url,method,input,init);
    var p;
    try{p=originalFetch.apply(window,arguments);}catch(err){finish(c,null,null,err);addCapture(c);throw err;}
    return p.then(function(response){
      var done=false;
      function complete(raw,err){
        if(done)return;done=true;finish(c,response,raw,err);addCapture(c);
      }
      try{
        var clone=response.clone();
        clone.text().then(function(raw){complete(raw,null);}).catch(function(){});
      }catch(_){}
      return response;
    },function(err){finish(c,null,null,err);addCapture(c);throw err;});
  }

  window.fetch=function(input,init){
    var url='';
    try{url=typeof input==='string'?input:(input&&input.url)||'';}catch(_){}
    if(!isASF(url))return originalFetch.apply(this,arguments);
    /* PASSIVO: exatamente UMA chamada, com os mesmos argumentos da aplicação. */
    return captureFetch(input,init,url,(init&&init.method)||(input&&input.method)||'GET');
  };

  /* Captura WinHTTP sem repetir, bloquear ou alterar a chamada da aplicação. */
  try{
    var OriginalActiveXObject=window.ActiveXObject;
    if(typeof OriginalActiveXObject==='function'){
      window.ActiveXObject=function(progId){
        var obj=new OriginalActiveXObject(progId),state={url:'',method:'GET',start:null,capture:null,headers:{}};
        var isHttp=String(progId||'').toLowerCase().indexOf('winhttp.winhttprequest')>=0||
                   String(progId||'').toLowerCase().indexOf('msxml2.xmlhttp')>=0||
                   String(progId||'').toLowerCase().indexOf('microsoft.xmlhttp')>=0;
        if(!isHttp)return obj;
        try{
          var oo=obj.open;
          obj.open=function(method,url,async){
            state.method=s(method||'GET',20).toUpperCase();state.url=s(url,8000);
            if(isASF(state.url)){state.start=Date.now();state.capture=buildBase(state.url,state.method,obj,null);state.capture.async=async;}
            return oo.apply(this,arguments);
          };
        }catch(_){}
        try{
          var osh=obj.setRequestHeader;
          obj.setRequestHeader=function(name,value){
            if(isASF(state.url))state.headers[s(name,100)]=redactHeader(name,value);
            return osh.apply(this,arguments);
          };
        }catch(_){}
        try{
          var os=obj.send;
          obj.send=function(body){
            if(!isASF(state.url))return os.apply(this,arguments);
            var c=state.capture||buildBase(state.url,state.method,obj,null);
            c.requestHeaders=state.headers;c.requestBody=typeof body==='string'?s(body,32000):null;
            c.requestBodyBytes=typeof body==='string'?body.length:null;c.requestBodyHash=typeof body==='string'?fnv1a(body):null;
            c.requestStartEpochMs=state.start||Date.now();c.requestStartIso=new Date(c.requestStartEpochMs).toISOString();
            try{
              var out=os.apply(this,arguments);
              var raw=s(obj.responseText,MAX_RAW);
              finish(c,{ok:obj.status>=200&&obj.status<300,status:finite(obj.status),statusText:s(obj.statusText,300),
                redirected:null,type:'ActiveX',url:state.url,headers:{'content-type':s(obj.getResponseHeader?obj.getResponseHeader('Content-Type'):'',200)}},raw,null);
              c.asfResponseTextEncoding='text';addCapture(c);return out;
            }catch(err){finish(c,null,null,err);c.responseStatusAfterException=finite(obj.status);addCapture(c);throw err;}
          };
        }catch(_){}
        return obj;
      };
    }
  }catch(_){}

  function chooseCapture(plate){
    var wanted=s(plate,'').replace(/[^A-Z0-9]/gi,'').toUpperCase(),now=Date.now(),best=null,bestDelta=Infinity;
    for(var i=captures.length-1;i>=0;i--){
      var c=captures[i];if(!c||now-c.requestStartEpochMs>30000)continue;
      var cp=(c.query&&c.query.plate||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
      if(wanted&&cp&&wanted!==cp)continue;
      var d=Math.abs(now-(c.requestEndEpochMs||c.requestStartEpochMs));
      if(d<bestDelta){best=c;bestDelta=d;}
    }
    return best;
  }

  function augment(){
    if(typeof window.mostrarSeguroErro!=='function')return false;
    if(window.__VERIX_ASF_FORENSICS_WRAPPED_V6__)return true;
    var original=window.mostrarSeguroErro;
    window.mostrarSeguroErro=function(mensagem,matricula,diagnostico,queryId,asfDiagnostic){
      try{
        var capture=chooseCapture(matricula);
        var target=asfDiagnostic&&typeof asfDiagnostic==='object'?asfDiagnostic:
                   (diagnostico&&typeof diagnostico==='object'?diagnostico:null);
        if(!target&&capture){target={};arguments[4]=target;}
        if(target&&capture){
          target.asfForensicsVersion='6';target.captureVersion=capture.captureVersion;
          target.asfCaptureId=capture.captureId;target.asfRequestStartEpochMs=capture.requestStartEpochMs;
          target.asfRequestStartIso=capture.requestStartIso;target.asfRequestEndEpochMs=capture.requestEndEpochMs;
          target.asfRequestEndIso=capture.requestEndIso;target.asfDurationMs=capture.durationMs;
          target.asfMethod=capture.method;target.asfTransport=capture.comTransport||'fetch';
          target.asfUrl=capture.url;target.asfRequestQuery=capture.query?capture.query.query:null;
          target.asfRequestHeaders=capture.requestHeaders;target.asfRequestBody=capture.requestBody;
          target.asfRequestBodyBytes=capture.requestBodyBytes;target.asfRequestBodyHash=capture.requestBodyHash;
          target.asfHttpStatus=capture.status;target.asfStatusText=capture.statusText;target.asfOk=capture.ok;
          target.asfResponseType=capture.responseType;target.asfResponseUrl=capture.responseUrl;
          target.asfResponseHeaders=capture.responseHeaders;target.asfResponseContentType=capture.responseContentType;
          target.asfResponseBytes=capture.responseBytes;target.asfResponseHash=capture.responseBodyHash;
          target.asfRawResponse=capture.rawResponse;
          target.asfGraphqlErrorCount=capture.graphql?capture.graphql.errorCount:0;
          target.asfGraphqlMessages=capture.graphql?capture.graphql.errors.map(function(e){return e.message;}).filter(Boolean).slice(0,20):[];
          target.asfGraphqlCodes=capture.graphql?capture.graphql.errors.map(function(e){return e.extensions&&e.extensions.code?s(e.extensions.code,200):'';}).filter(Boolean).slice(0,20):[];
          target.asfGraphqlErrors=capture.graphql?capture.graphql.errors:[];
          target.asfGraphqlErrorsRaw=capture.graphql?capture.graphql.graphqlErrorsJson:'';
          target.asfClientContext=capture.client;target.asfCallerStack=capture.callerStack;
          target.asfNetworkError=capture.error||null;target.asfCaptureMatch='plate+nearest_recent';
          /* Não inventar retries: o diagnóstico só reporta o que realmente ocorreu. */
          target.asfRetryCount=0;target.asfRetryGroup=null;target.asfRetryReason=null;target.asfRetryAttempts=[];
        }
      }catch(_){}
      return original.apply(this,arguments);
    };
    window.__VERIX_ASF_FORENSICS_WRAPPED_V6__=true;
    return true;
  }
  var timer=setInterval(function(){if(augment())clearInterval(timer);},250);
  setTimeout(function(){clearInterval(timer);},60000);
})();