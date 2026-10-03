/* VÉRIX ASF forensic capture — comprehensive, side-effect-minimising diagnostics. */
(function(){
  'use strict';

  if (window.__VERIX_ASF_FORENSICS_V2__) return;
  window.__VERIX_ASF_FORENSICS_V2__ = true;

  var originalFetch = window.fetch;
  var captures = [];
  var captureSeq = 0;
  var MAX_CAPTURES = 60;
  var MAX_RAW = 65536;
  var MAX_QUERY = 16000;
  var MAX_STACK = 12000;
  var MAX_HEADERS = 80;

  function s(v, max){
    try {
      var x = String(v == null ? '' : v);
      return max ? x.slice(0, max) : x;
    } catch (_) { return ''; }
  }

  function finite(v){
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function safeJson(v, max){
    try { return s(JSON.stringify(v), max || 16000); } catch (_) { return ''; }
  }

  function fnv1a(text){
    var h = 2166136261;
    var str = String(text || '');
    for (var i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function redactHeader(name, value){
    var n = String(name || '').toLowerCase();
    if (n === 'authorization' || n === 'cookie' || n === 'set-cookie' ||
        n === 'proxy-authorization' || n.indexOf('api-key') >= 0 ||
        n.indexOf('apikey') >= 0 || n.indexOf('token') >= 0 || n.indexOf('secret') >= 0){
      return '[REDACTED]';
    }
    return s(value, 2000);
  }

  function headerObject(headers){
    var out = {};
    var count = 0;
    try {
      if (headers && typeof headers.forEach === 'function'){
        headers.forEach(function(v,k){
          if (count >= MAX_HEADERS) return;
          out[s(k,100)] = redactHeader(k,v);
          count++;
        });
      }
    } catch (_) {}
    return out;
  }

  function mergeHeaders(input, init){
    var merged = {};
    try {
      var fromInput = input && input.headers ? headerObject(input.headers) : {};
      for (var k in fromInput) if (Object.prototype.hasOwnProperty.call(fromInput,k)) merged[k]=fromInput[k];
    } catch (_) {}
    try {
      var ih = init && init.headers;
      if (ih){
        if (typeof Headers !== 'undefined' && ih instanceof Headers){
          var x = headerObject(ih);
          for (var a in x) if (Object.prototype.hasOwnProperty.call(x,a)) merged[a]=x[a];
        } else if (Array.isArray(ih)){
          for (var i=0;i<ih.length && i<MAX_HEADERS;i++){
            if (ih[i] && ih[i].length >= 2) merged[s(ih[i][0],100)] = redactHeader(ih[i][0],ih[i][1]);
          }
        } else if (typeof ih === 'object'){
          var keys = Object.keys(ih);
          for (var j=0;j<keys.length && j<MAX_HEADERS;j++){
            var key = keys[j];
            merged[s(key,100)] = redactHeader(key, ih[key]);
          }
        }
      }
    } catch (_) {}
    return merged;
  }

  function clientContext(){
    var c = {};
    try {
      var nav = window.navigator || {};
      c.userAgent = s(nav.userAgent,1000);
      c.platform = s(nav.platform,200);
      c.language = s(nav.language,50);
      c.languages = Array.isArray(nav.languages) ? nav.languages.slice(0,12).map(function(x){return s(x,50);}) : [];
      c.cookieEnabled = typeof nav.cookieEnabled === 'boolean' ? nav.cookieEnabled : null;
      c.onLine = typeof nav.onLine === 'boolean' ? nav.onLine : null;
      c.hardwareConcurrency = finite(nav.hardwareConcurrency);
      c.deviceMemory = finite(nav.deviceMemory);
      c.maxTouchPoints = finite(nav.maxTouchPoints);
      c.webdriver = typeof nav.webdriver === 'boolean' ? nav.webdriver : null;
      c.pdfViewerEnabled = typeof nav.pdfViewerEnabled === 'boolean' ? nav.pdfViewerEnabled : null;

      var conn = nav.connection || nav.mozConnection || nav.webkitConnection;
      if (conn){
        c.connection = {
          type: s(conn.type,50),
          effectiveType: s(conn.effectiveType,30),
          downlink: finite(conn.downlink),
          rtt: finite(conn.rtt),
          saveData: typeof conn.saveData === 'boolean' ? conn.saveData : null
        };
      }
    } catch (_) {}

    try {
      c.viewport = { width: window.innerWidth || null, height: window.innerHeight || null, dpr: finite(window.devicePixelRatio) };
    } catch (_) {}

    try {
      c.screen = {
        width: finite(window.screen && window.screen.width),
        height: finite(window.screen && window.screen.height),
        availWidth: finite(window.screen && window.screen.availWidth),
        availHeight: finite(window.screen && window.screen.availHeight),
        colorDepth: finite(window.screen && window.screen.colorDepth),
        pixelDepth: finite(window.screen && window.screen.pixelDepth)
      };
    } catch (_) {}

    try {
      c.page = {
        href: s(window.location && window.location.href,2000),
        origin: s(window.location && window.location.origin,300),
        referrer: s(document && document.referrer,2000),
        visibility: s(document && document.visibilityState,40),
        readyState: s(document && document.readyState,40)
      };
    } catch (_) {}

    return c;
  }

  function parseRequest(url){
    var out = { plate:null, date:null, operation:null, query:null, queryEncoded:null };
    try {
      var u = new URL(String(url), window.location.href);
      var q = u.searchParams.get('query') || '';
      out.queryEncoded = s((String(url).split('?')[1] || ''), MAX_QUERY);
      out.query = s(q, MAX_QUERY);
      var m = q.match(/license\\s*:\\s*\\?"([A-Z0-9-]+)\\?"/i);
      if (m) out.plate = s(m[1],50).toUpperCase();
      var d = q.match(/date\\s*:\\s*\\?"([0-9/ -]+)\\?"/i);
      if (d) out.date = s(d[1],50);
      var op = q.match(/(?:mutation|query)\\s+([A-Za-z0-9_]+)/i);
      if (op) out.operation = s(op[1],100);
    } catch (_) {}
    return out;
  }

  function resourceTiming(url){
    try {
      if (!window.performance || !performance.getEntriesByName) return null;
      var entries = performance.getEntriesByName(String(url));
      if (!entries || !entries.length) return null;
      var e = entries[entries.length-1];
      return {
        name: s(e.name,2000),
        initiatorType: s(e.initiatorType,80),
        startTime: finite(e.startTime),
        duration: finite(e.duration),
        redirectStart: finite(e.redirectStart),
        redirectEnd: finite(e.redirectEnd),
        workerStart: finite(e.workerStart),
        fetchStart: finite(e.fetchStart),
        domainLookupStart: finite(e.domainLookupStart),
        domainLookupEnd: finite(e.domainLookupEnd),
        connectStart: finite(e.connectStart),
        connectEnd: finite(e.connectEnd),
        secureConnectionStart: finite(e.secureConnectionStart),
        requestStart: finite(e.requestStart),
        responseStart: finite(e.responseStart),
        responseEnd: finite(e.responseEnd),
        transferSize: finite(e.transferSize),
        encodedBodySize: finite(e.encodedBodySize),
        decodedBodySize: finite(e.decodedBodySize),
        nextHopProtocol: s(e.nextHopProtocol,50),
        serverTiming: e.serverTiming && typeof e.serverTiming.length === 'number'
          ? Array.prototype.slice.call(e.serverTiming,0,20).map(function(st){
              return {name:s(st.name,100),duration:finite(st.duration),description:s(st.description,500)};
            }) : []
      };
    } catch (_) { return null; }
  }

  function graphqlDetails(raw){
    var out = {
      isJson:false,
      topLevelKeys:[],
      hasData:false,
      dataKeys:[],
      hasErrors:false,
      errorCount:0,
      errors:[],
      graphqlErrorsJson:''
    };
    try {
      var j = JSON.parse(raw);
      out.isJson=true;
      if (j && typeof j === 'object' && !Array.isArray(j)){
        out.topLevelKeys = Object.keys(j).slice(0,80);
        out.hasData = Object.prototype.hasOwnProperty.call(j,'data');
        if (j.data && typeof j.data === 'object' && !Array.isArray(j.data)) out.dataKeys=Object.keys(j.data).slice(0,80);
        if (Array.isArray(j.errors)){
          out.hasErrors=true;
          out.errorCount=j.errors.length;
          out.errors=j.errors.slice(0,20).map(function(e){
            return {
              message:s(e && e.message,4000),
              locations:Array.isArray(e && e.locations)?e.locations.slice(0,30):[],
              path:Array.isArray(e && e.path)?e.path.slice(0,30):[],
              extensions:(e && e.extensions && typeof e.extensions === 'object') ? e.extensions : null
            };
          });
          out.graphqlErrorsJson = safeJson(j.errors, 50000);
        }
      }
    } catch (_) {}
    return out;
  }

  function addCapture(c){
    captures.push(c);
    if (captures.length > MAX_CAPTURES) captures.shift();
  }

  function isASF(url){
    return String(url || '').indexOf('ext01.asf.com.pt/api/src/') >= 0;
  }

  function buildBase(url, method, input, init){
    var parsed = parseRequest(url);
    var stamp = Date.now();
    var perf = (window.performance && performance.now) ? performance.now() : null;
    var body = null;

    try {
      if (init && typeof init.body === 'string'){
        body = s(init.body, 32000);
      } else if (input && input.bodyUsed === false && input.body == null) {
        body = null;
      }
    } catch (_) {}

    return {
      captureVersion:'2',
      captureId:'asf-' + stamp + '-' + (++captureSeq),
      requestStartEpochMs:stamp,
      requestStartIso:new Date(stamp).toISOString(),
      requestPerfStart:perf,
      method:s(method || 'GET',20).toUpperCase(),
      url:s(url,8000),
      query:parsed,
      requestHeaders:mergeHeaders(input,init),
      requestBody:body,
      requestBodyBytes:body != null ? body.length : null,
      requestBodyHash:body != null ? fnv1a(body) : null,
      client:clientContext(),
      callerStack:s((new Error()).stack,MAX_STACK),
      ok:null,
      status:null,
      statusText:null,
      redirected:null,
      responseType:null,
      responseUrl:null,
      responseHeaders:{},
      responseContentType:null,
      responseBytes:null,
      responseBodyHash:null,
      rawResponse:'',
      graphql:null,
      resourceTiming:null,
      error:null,
      requestEndEpochMs:null,
      requestEndIso:null,
      durationMs:null
    };
  }

  function finishCapture(c, response, raw, thrown){
    var end=Date.now();
    c.requestEndEpochMs=end;
    c.requestEndIso=new Date(end).toISOString();
    c.durationMs = c.requestStartEpochMs ? end-c.requestStartEpochMs : null;

    if (response){
      c.ok=typeof response.ok === 'boolean' ? response.ok : null;
      c.status=finite(response.status);
      c.statusText=s(response.statusText,300);
      c.redirected=typeof response.redirected === 'boolean' ? response.redirected : null;
      c.responseType=s(response.type,80);
      c.responseUrl=s(response.url,8000);
      c.responseHeaders=headerObject(response.headers);
      c.responseContentType=response.headers&&response.headers.get?s(response.headers.get('content-type'),200):null;
    }

    if (raw != null){
      var full=String(raw);
      c.responseBytes=full.length;
      c.responseBodyHash=fnv1a(full);
      c.rawResponse=full.slice(0,MAX_RAW);
      c.graphql=graphqlDetails(full);
      c.resourceTiming=resourceTiming(c.responseUrl || c.url);
      c.isError = (c.status != null && (c.status < 200 || c.status >= 300)) || !!(c.graphql && c.graphql.hasErrors);
    } else {
      c.isError=true;
    }

    if (thrown){
      c.error={
        name:s(thrown.name,200),
        message:s(thrown.message,2000),
        code:s(thrown.code,200),
        stack:s(thrown.stack,MAX_STACK),
        toString:s(thrown.toString ? thrown.toString() : thrown,3000)
      };
      c.isError=true;
    }

    if (!c.isError && c.error == null) {
      c.isError = c.status != null && (c.status < 200 || c.status >= 300);
    }
  }

  window.fetch = function(input, init){
    var url='';
    var method='';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      method = (init && init.method) || (input && input.method) || 'GET';
    } catch (_) {}

    if (!isASF(url)) return originalFetch.apply(this, arguments);

    var c=buildBase(url,method,input,init);
    var p;
    try {
      p=originalFetch.apply(this,arguments);
    } catch (err) {
      finishCapture(c,null,null,err);
      addCapture(c);
      throw err;
    }

    return p.then(function(response){
      // Do not hold up the real response: forensic body reading runs on a clone.
      try {
        var clone=response.clone();
        clone.text().then(function(raw){
          finishCapture(c,response,raw,null);
          addCapture(c);
        }).catch(function(err){
          finishCapture(c,response,null,err);
          addCapture(c);
        });
      } catch (err2) {
        finishCapture(c,response,null,err2);
        addCapture(c);
      }
      return response;
    },function(err){
      finishCapture(c,null,null,err);
      addCapture(c);
      throw err;
    });
  };

  /* HTA / IE transport capture. Best-effort: if COM methods are not writable, app continues untouched. */
  try {
    var OriginalActiveXObject = window.ActiveXObject;
    if (typeof OriginalActiveXObject === 'function'){
      window.ActiveXObject = function(progId){
        var obj = new OriginalActiveXObject(progId);
        var isHttp = String(progId || '').toLowerCase().indexOf('winhttp.winhttprequest') >= 0 ||
                     String(progId || '').toLowerCase().indexOf('msxml2.xmlhttp') >= 0 ||
                     String(progId || '').toLowerCase().indexOf('microsoft.xmlhttp') >= 0;
        if (!isHttp) return obj;

        var state={
          url:'',
          method:'GET',
          async:null,
          requestHeaders:{},
          start:null,
          capture:null
        };

        try {
          var originalOpen=obj.open;
          obj.open=function(method,url,async){
            state.method=s(method || 'GET',20).toUpperCase();
            state.url=s(url,8000);
            state.async=async;
            if (isASF(state.url)){
              state.start=Date.now();
              state.capture=buildBase(state.url,state.method,obj,null);
              state.capture.comTransport='ActiveXObject:'+s(progId,100);
              state.capture.async=async;
            }
            return originalOpen.apply(this,arguments);
          };
        } catch (_) {}

        try {
          var originalSetRequestHeader=obj.setRequestHeader;
          obj.setRequestHeader=function(name,value){
            if (isASF(state.url)) state.requestHeaders[s(name,100)]=redactHeader(name,value);
            return originalSetRequestHeader.apply(this,arguments);
          };
        } catch (_) {}

        try {
          var originalSetTimeouts=obj.setTimeouts;
          obj.setTimeouts=function(resolveTimeout,connectTimeout,sendTimeout,receiveTimeout){
            if (isASF(state.url) && state.capture){
              state.capture.timeouts={
                resolveMs:finite(resolveTimeout),
                connectMs:finite(connectTimeout),
                sendMs:finite(sendTimeout),
                receiveMs:finite(receiveTimeout)
              };
            }
            return originalSetTimeouts.apply(this,arguments);
          };
        } catch (_) {}

        try {
          var originalSend=obj.send;
          obj.send=function(body){
            if (!isASF(state.url)) return originalSend.apply(this,arguments);
            var c=state.capture || buildBase(state.url,state.method,obj,null);
            c.requestHeaders=state.requestHeaders;
            c.requestBody=typeof body === 'string' ? s(body,32000) : (body == null ? null : '[non-text body]');
            c.requestBodyBytes=typeof body === 'string' ? body.length : null;
            c.requestBodyHash=typeof body === 'string' ? fnv1a(body) : null;
            c.requestStartEpochMs=state.start || Date.now();
            c.requestStartIso=new Date(c.requestStartEpochMs).toISOString();

            try {
              var out=originalSend.apply(this,arguments);
              var raw=s(obj.responseText,MAX_RAW);
              finishCapture(c,{
                ok:(obj.status>=200 && obj.status<300),
                status:finite(obj.status),
                statusText:s(obj.statusText,300),
                redirected:null,
                type:'ActiveX',
                url:state.url,
                headers:{'content-type':s(obj.getResponseHeader ? obj.getResponseHeader('Content-Type') : '',200)}
              },raw,null);
              c.asfResponseTextEncoding='text';
              addCapture(c);
              return out;
            } catch (err){
              finishCapture(c,null,null,err);
              c.responseStatusAfterException=finite(obj.status);
              c.responseStatusTextAfterException=s(obj.statusText,300);
              try { c.partialResponseText=s(obj.responseText,MAX_RAW); } catch (_) {}
              addCapture(c);
              throw err;
            }
          };
        } catch (_) {}

        return obj;
      };
    }
  } catch (_) {}

  function chooseCapture(plate){
    var wanted=s(plate,'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
    var now=Date.now();
    var best=null;
    var bestDelta=Infinity;
    for (var i=captures.length-1;i>=0;i--){
      var c=captures[i];
      if (!c || now-c.requestStartEpochMs>30000) continue;
      var cp=(c.query&&c.query.plate ? c.query.plate : '').replace(/[^A-Z0-9]/gi,'').toUpperCase();
      if (wanted && cp && wanted!==cp) continue;
      if (!c.isError) continue;
      var d=Math.abs(now-(c.requestEndEpochMs||c.requestStartEpochMs));
      if (d<bestDelta){ best=c; bestDelta=d; }
    }
    if (!best){
      for (var j=captures.length-1;j>=0;j--){
        var x=captures[j];
        if (!x || now-x.requestStartEpochMs>30000) continue;
        var xp=(x.query&&x.query.plate ? x.query.plate : '').replace(/[^A-Z0-9]/gi,'').toUpperCase();
        if (wanted && xp && wanted!==xp) continue;
        var dx=Math.abs(now-(x.requestEndEpochMs||x.requestStartEpochMs));
        if (dx<bestDelta){ best=x; bestDelta=dx; }
      }
    }
    return best;
  }

  function augment(){
    if (typeof window.mostrarSeguroErro !== 'function') return false;
    if (window.__VERIX_ASF_FORENSICS_WRAPPED__) return true;

    var original=window.mostrarSeguroErro;
    window.mostrarSeguroErro=function(mensagem,matricula,diagnostico,queryId,asfDiagnostic){
      try {
        var capture=chooseCapture(matricula);
        var target=asfDiagnostic && typeof asfDiagnostic==='object' ? asfDiagnostic :
                   (diagnostico && typeof diagnostico==='object' ? diagnostico : null);

        if (!target && capture){
          target={};
          arguments[4]=target;
        }

        if (target && capture){
          target.asfForensicsVersion='2';
          target.asfCaptureId=capture.captureId;
          target.asfRequestStartEpochMs=capture.requestStartEpochMs;
          target.asfRequestStartIso=capture.requestStartIso;
          target.asfRequestEndEpochMs=capture.requestEndEpochMs;
          target.asfRequestEndIso=capture.requestEndIso;
          target.asfDurationMs=capture.durationMs;
          target.asfMethod=capture.method;
          target.asfTransport=capture.comTransport || 'fetch';
          target.asfUrl=capture.url;
          target.asfRequestQuery=capture.query ? capture.query.query : null;
          target.asfRequestHeaders=capture.requestHeaders;
          target.asfRequestBody=capture.requestBody;
          target.asfRequestBodyBytes=capture.requestBodyBytes;
          target.asfRequestBodyHash=capture.requestBodyHash;
          target.asfHttpStatus=capture.status;
          target.asfStatusText=capture.statusText;
          target.asfOk=capture.ok;
          target.asfRedirected=capture.redirected;
          target.asfResponseType=capture.responseType;
          target.asfResponseUrl=capture.responseUrl;
          target.asfResponseHeaders=capture.responseHeaders;
          target.asfResponseContentType=capture.responseContentType;
          target.asfResponseBytes=capture.responseBytes;
          target.asfResponseHash=capture.responseBodyHash;
          target.asfRawResponse=capture.rawResponse;
          target.asfGraphqlErrorCount=capture.graphql ? capture.graphql.errorCount : 0;
          target.asfGraphqlMessages=capture.graphql ? capture.graphql.errors.map(function(e){return e.message;}).filter(Boolean).slice(0,20) : [];
          target.asfGraphqlCodes=capture.graphql ? capture.graphql.errors.map(function(e){return e.extensions&&e.extensions.code?s(e.extensions.code,200):'';}).filter(Boolean).slice(0,20) : [];
          target.asfGraphqlErrors=capture.graphql ? capture.graphql.errors : [];
          target.asfGraphqlErrorsRaw=capture.graphql ? capture.graphql.graphqlErrorsJson : '';
          target.asfGraphqlRawParsed=capture.graphql || null;
          target.asfResourceTiming=capture.resourceTiming;
          target.asfClientContext=capture.client;
          target.asfCallerStack=capture.callerStack;
          target.asfNetworkError=capture.error || null;
          target.asfCaptureAgeMs=Date.now()-(capture.requestEndEpochMs||capture.requestStartEpochMs||Date.now());
          target.asfCaptureMatch='plate+nearest_recent_error';
        }

        if (!target && !capture && diagnostico && typeof diagnostico==='object'){
          diagnostico.asfForensicsVersion='2';
          diagnostico.asfCaptureMatch='no_matching_capture';
        }
      } catch (_) {}

      return original.apply(this,arguments);
    };

    window.__VERIX_ASF_FORENSICS_WRAPPED__=true;
    return true;
  }

  var timer=setInterval(function(){if(augment())clearInterval(timer);},250);
  setTimeout(function(){clearInterval(timer);},60000);
})();
