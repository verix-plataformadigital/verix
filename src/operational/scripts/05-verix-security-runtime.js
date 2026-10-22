
(function(){
  'use strict';
  var BUILD_ID = '1.5-sec-20261008-a';
  var GATE_URL = 'https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/verix-gate-v1';
  var securityToken = null;
  var securityTokenExp = 0;
  var securityTokenPromise = null;

  function persistentId(store, key, prefix) {
    try {
      var value = store && store.getItem(key);
      if (value) return String(value).slice(0, 120);
    } catch (_) {}
    var created = prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        created = prefix + '-' + window.crypto.randomUUID();
      }
    } catch (_) {}
    try { if (store) store.setItem(key, created); } catch (_) {}
    return created.slice(0, 120);
  }

  var installationId = persistentId(window.localStorage, 'VERIX_T2_INSTALL_ID', 'i');
  var sessionId = persistentId(window.sessionStorage, 'VERIX_T2_SESSION_ID', 's');
  var tabId = persistentId(window.sessionStorage, 'VERIX_T2_TAB_ID', 't');

  function requestGate() {
    var payload = JSON.stringify({
      build_id: BUILD_ID,
      installation_id: installationId,
      session_id: sessionId,
      tab_id: tabId
    });

    if (typeof ActiveXObject !== 'undefined') {
      return new Promise(function(resolve, reject){
        try {
          var xhr = new ActiveXObject('WinHttp.WinHttpRequest.5.1');
          xhr.open('POST', GATE_URL, false);
          xhr.setTimeouts(5000, 5000, 8000, 8000);
          xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
          xhr.send(payload);
          var status = Number(xhr.Status || 0);
          var text = xhr.ResponseText || '';
          if (status < 200 || status >= 300) throw new Error('VÉRIX gate HTTP ' + status);
          var data = JSON.parse(text);
          if (!data || !data.token) throw new Error('VÉRIX gate sem token');
          securityToken = String(data.token);
          securityTokenExp = Date.now() + Math.max(0, Number(data.expires_in || 0)) * 1000;
          resolve(securityToken);
        } catch (e) { reject(e); }
      });
    }

    return fetch(GATE_URL, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    }).then(function(res){
      return res.text().then(function(text){
        if (!res.ok) throw new Error('VÉRIX gate HTTP ' + res.status);
        var data = JSON.parse(text);
        if (!data || !data.token) throw new Error('VÉRIX gate sem token');
        securityToken = String(data.token);
        securityTokenExp = Date.now() + Math.max(0, Number(data.expires_in || 0)) * 1000;
        return securityToken;
      });
    });
  }

  function getToken(force) {
    if (!force && securityToken && Date.now() < securityTokenExp - 30000) {
      return Promise.resolve(securityToken);
    }
    if (securityTokenPromise) return securityTokenPromise;
    securityTokenPromise = requestGate().finally(function(){
      securityTokenPromise = null;
    });
    return securityTokenPromise;
  }

  var securityApi = {
    getToken: getToken,
    getIdentity: function(){
      return {
        installationId: installationId,
        sessionId: sessionId,
        tabId: tabId,
        buildId: BUILD_ID
      };
    },
    clear: function(){
      securityToken = null;
      securityTokenExp = 0;
    }
  };

  try {
    Object.freeze(securityApi);
    Object.defineProperty(window, 'VERIX_SECURITY', {
      value: securityApi,
      writable: false,
      configurable: false,
      enumerable: false
    });
    Object.defineProperty(window, 'VERIX_BUILD_ID', {
      value: BUILD_ID,
      writable: false,
      configurable: false,
      enumerable: false
    });
  } catch (_) {
    try {
      window.VERIX_SECURITY = securityApi;
      window.VERIX_BUILD_ID = BUILD_ID;
    } catch (__) {}
  }

  try { window.VERIX_SECURITY_WARMUP = getToken(false).catch(function(){ return null; }); } catch (_) {}
})();
