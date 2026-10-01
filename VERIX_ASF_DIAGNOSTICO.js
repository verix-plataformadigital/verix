/* VÉRIX ASF DIAGNÓSTICO — somente diagnóstico, sem alterar a consulta.
   Não guarda matrículas. Regista apenas causa técnica, método, transporte e tempo. */
(function () {
  'use strict';

  var KEY = '__VERIX_ASF_DIAG';
  var state = window[KEY] = window[KEY] || {
    lastStartAt: 0,
    lastDurationMs: null,
    lastStatus: null,
    lastTransport: null,
    lastErrorName: null,
    lastErrorMessage: null,
    installed: false
  };

  function isASFUrl(input) {
    try {
      var u = typeof input === 'string'
        ? new URL(input, window.location.href)
        : input && input.url ? new URL(input.url, window.location.href) : null;
      return !!(u && /(^|\.)ext01\.asf\.com\.pt$/i.test(u.hostname) && /\/api\/src\//i.test(u.pathname));
    } catch (_) { return false; }
  }
  function nowMs() { return Date.now(); }
  function truncate(value, max) { var s = String(value == null ? '' : value); return s.length > max ? s.slice(0, max) : s; }
  function classify(message, status, errorName) {
    var s = String(message || '').toLowerCase();
    var n = String(errorName || '').toLowerCase();
    var code = Number(status);
    if (code >= 400 && code <= 599) return 'http_' + code;
    var m = s.match(/\bhttp\s*(\d{3})\b/i);
    if (m) return 'http_' + m[1];
    if (/429|rate limit|limite/.test(s)) return 'http_429';
    if (/403|proibido|forbidden/.test(s)) return 'http_403';
    if (/timeout|timed out|tempo limite|aborted|aborterror/.test(s) || /abort/.test(n)) return 'timeout';
    if (/failed to fetch|networkerror|network error|load failed|cors|connection|ligação|conex/.test(s)) return 'network';
    if (/json/.test(s)) return 'invalid_json';
    if (/estrutura|schema|nodes|conclusivo|resposta ASF sem/.test(s)) return 'invalid_response';
    if (/fila|queue/.test(s)) return 'queue';
    return 'unknown';
  }

  try {
    if (!window.fetch || window.fetch.__verixASFDiagnosticWrapped) throw new Error('skip');
    var originalFetch = window.fetch;
    var wrappedFetch = function () {
      var args = arguments, url = args[0];
      if (!isASFUrl(url)) return originalFetch.apply(this, args);
      state.lastStartAt = nowMs();
      state.lastStatus = null;
      state.lastTransport = 'fetch';
      state.lastErrorName = null;
      state.lastErrorMessage = null;
      var p;
      try { p = originalFetch.apply(this, args); }
      catch (e) {
        state.lastDurationMs = nowMs() - state.lastStartAt;
        state.lastErrorName = e && e.name ? String(e.name) : null;
        state.lastErrorMessage = e && e.message ? String(e.message) : String(e);
        throw e;
      }
      return Promise.resolve(p).then(function (res) {
        state.lastDurationMs = nowMs() - state.lastStartAt;
        state.lastStatus = res && typeof res.status === 'number' ? res.status : null;
        return res;
      }, function (err) {
        state.lastDurationMs = nowMs() - state.lastStartAt;
        state.lastErrorName = err && err.name ? String(err.name) : null;
        state.lastErrorMessage = err && err.message ? String(err.message) : String(err);
        throw err;
      });
    };
    wrappedFetch.__verixASFDiagnosticWrapped = true;
    wrappedFetch.__verixASFDiagnosticOriginal = originalFetch;
    window.fetch = wrappedFetch;
  } catch (_) {}

  function unwrap(fn) {
    var current = fn, guard = 0;
    while (current && current.__verixTelemetryV2Original && guard < 8) { current = current.__verixTelemetryV2Original; guard++; }
    return current;
  }

  function installErrorDiagnostic() {
    try {
      if (state.installed) return true;
      var fn = window.mostrarSeguroErro;
      if (typeof fn !== 'function' || !fn.__verixTelemetryV2Original) return false;
      var base = unwrap(fn);
      if (typeof base !== 'function') return false;
      var diagnostic = function (mensagem, matricula, diagnostico, queryId) {
        var message = String(mensagem || state.lastErrorMessage || 'Falha de comunicação com a ASF');
        var status = state.lastStatus;
        var duration = Number.isFinite(state.lastDurationMs) ? state.lastDurationMs : null;
        var errorName = state.lastErrorName || null;
        var meta = {
          queryId: queryId || window.__VERIX_CURRENT_QUERY_ID || null,
          asfDiagnosticVersion: 1,
          asfErrorType: classify(message, status, errorName),
          asfHttpStatus: status == null ? null : Number(status),
          asfDurationMs: duration,
          asfTransport: state.lastTransport || 'unknown',
          asfMethod: 'POST',
          asfBrowserError: truncate(errorName, 80) || null,
          asfMessage: truncate(message, 300)
        };
        try {
          if (window.VERIX_TELEMETRY && typeof window.VERIX_TELEMETRY.track === 'function') {
            window.VERIX_TELEMETRY.track('vehicle_insurance_error', 'consulta', meta);
          }
        } catch (_) {}
        return base.apply(this, arguments);
      };
      diagnostic.__verixASFDiagnosticWrapped = true;
      diagnostic.__verixASFDiagnosticOriginal = base;
      window.mostrarSeguroErro = diagnostic;
      state.installed = true;
      return true;
    } catch (_) { return false; }
  }

  var deadline = nowMs() + 10000;
  var timer = setInterval(function () {
    if (installErrorDiagnostic() || nowMs() >= deadline) clearInterval(timer);
  }, 100);
  try { window.addEventListener('load', function () { installErrorDiagnostic(); }); } catch (_) {}
})();
