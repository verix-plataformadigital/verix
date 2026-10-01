/* VÉRIX ASF — DIAGNÓSTICO + MOTOR ASF COMPATÍVEL COM "TEM SEGURO"
   - POST único
   - timeout 10s
   - sem GET fallback
   - sem cache de resultados
   - mantém o limitador VÉRIX já existente (mín. 8s / máx. 5 por 60s)
   - erro técnico nunca é convertido em "sem seguro"
*/
(function () {
  'use strict';

  var KEY = '__VERIX_ASF_DIAG';
  var state = window[KEY] = window[KEY] || {
    lastStartAt: 0,
    lastDurationMs: null,
    lastStatus: null,
    lastTransport: null,
    lastMethod: null,
    lastErrorName: null,
    lastErrorMessage: null,
    installed: false,
    engineInstalled: false
  };

  function isASFUrl(input) {
    try {
      var u = typeof input === 'string'
        ? new URL(input, window.location.href)
        : input && input.url
          ? new URL(input.url, window.location.href)
          : null;
      return !!(u &&
        /(^|\.)ext01\.asf\.com\.pt$/i.test(u.hostname) &&
        /\/api\/src\//i.test(u.pathname));
    } catch (_) {
      return false;
    }
  }

  function nowMs() { return Date.now(); }

  function truncate(value, max) {
    var s = String(value == null ? '' : value);
    return s.length > max ? s.slice(0, max) : s;
  }

  function classify(message, status, errorName) {
    var s = String(message || '').toLowerCase();
    var n = String(errorName || '').toLowerCase();
    var code = Number(status);

    if (code >= 400 && code <= 599) return 'http_' + code;

    var m = s.match(/\bhttp\s*(\d{3})\b/i);
    if (m) return 'http_' + m[1];

    if (/429|rate limit|limite/.test(s)) return 'http_429';
    if (/403|proibido|forbidden/.test(s)) return 'http_403';
    if (/timeout|timed out|tempo limite|aborted|aborterror/.test(s) || /abort/.test(n)) {
      return 'timeout';
    }
    if (/failed to fetch|networkerror|network error|load failed|cors|connection|ligação|conex/.test(s)) {
      return 'network';
    }
    if (/json/.test(s)) return 'invalid_json';
    if (/estrutura|schema|nodes|resposta ASF sem/.test(s)) return 'invalid_response';
    return 'unknown';
  }

  /* Observa fetch ASF para diagnóstico sem alterar a resposta. */
  try {
    if (window.fetch && !window.fetch.__verixASFDiagnosticWrapped) {
      var originalFetch = window.fetch;

      var wrappedFetch = function () {
        var args = arguments;
        var url = args[0];

        if (!isASFUrl(url)) {
          return originalFetch.apply(this, args);
        }

        state.lastStartAt = nowMs();
        state.lastStatus = null;
        state.lastTransport = 'fetch';
        state.lastMethod = 'GET';
        state.lastErrorName = null;
        state.lastErrorMessage = null;

        try {
          var opt = args[1] || {};
          state.lastMethod = String(
            opt.method ||
            (url && typeof url === 'object' && url.method) ||
            'GET'
          ).toUpperCase();
        } catch (_) {}

        var p;
        try {
          p = originalFetch.apply(this, args);
        } catch (e) {
          state.lastDurationMs = nowMs() - state.lastStartAt;
          state.lastErrorName = e && e.name ? String(e.name) : null;
          state.lastErrorMessage = e && e.message ? String(e.message) : String(e);
          throw e;
        }

        return Promise.resolve(p).then(function (res) {
          state.lastDurationMs = nowMs() - state.lastStartAt;
          state.lastStatus = res && typeof res.status === 'number'
            ? res.status
            : null;
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
    }
  } catch (_) {}

  /*
   * Transporte ASF próprio da correção.
   * Mantém o limitador já existente no VÉRIX através de reservarSlotFisicoASF().
   */
  async function verixASFPost(url, matDisplay) {
    if (typeof ActiveXObject !== 'undefined') {
      await window.reservarSlotFisicoASF(matDisplay, 'POST');

      state.lastStartAt = nowMs();
      state.lastTransport = 'winhttp';
      state.lastMethod = 'POST';
      state.lastStatus = null;
      state.lastErrorName = null;
      state.lastErrorMessage = null;

      try {
        var xhr = new ActiveXObject('WinHttp.WinHttpRequest.5.1');
        xhr.open('POST', url, false);
        xhr.setTimeouts(10000, 10000, 10000, 10000);
        xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
        xhr.send(null);

        state.lastDurationMs = nowMs() - state.lastStartAt;
        state.lastStatus = Number(xhr.Status);

        return {
          status: Number(xhr.Status),
          text: String(xhr.ResponseText || '')
        };
      } catch (e) {
        state.lastDurationMs = nowMs() - state.lastStartAt;
        state.lastErrorName = e && e.name ? String(e.name) : 'WinHTTPError';
        state.lastErrorMessage = e && e.message ? String(e.message) : String(e);
        throw e;
      }
    }

    await window.reservarSlotFisicoASF(matDisplay, 'POST');

    var controller = typeof AbortController !== 'undefined'
      ? new AbortController()
      : null;

    var timer = setTimeout(function () {
      try {
        if (controller) controller.abort();
      } catch (_) {}
    }, 10000);

    try {
      var options = {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
        headers: {
          'Accept': 'application/json, text/plain, */*'
        }
      };

      if (controller) options.signal = controller.signal;

      return await fetch(url, options);
    } finally {
      clearTimeout(timer);
    }
  }

  /*
   * Regra de resultado baseada na APK:
   * - erros HTTP/transporte/JSON/estrutura => ERRO
   * - estrutura ASF válida + nodes vazio => SEM SEGURO
   * - estrutura ASF válida + primeiro node.license == null => SEM SEGURO
   * - estrutura ASF válida + primeiro node.license != null => TEM SEGURO
   */
  function verixInterpretarRespostaASF(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Resposta ASF inválida');
    }

    if (Array.isArray(json.errors) && json.errors.length) {
      var msgs = json.errors.map(function (e) {
        return e && e.message ? String(e.message) : '';
      }).filter(Boolean);

      throw new Error(
        msgs.length
          ? msgs.join(' | ')
          : 'A ASF devolveu um erro GraphQL'
      );
    }

    var nodes =
      json &&
      json.data &&
      json.data.mobishoutEntry &&
      json.data.mobishoutEntry.noone &&
      json.data.mobishoutEntry.noone.entry &&
      json.data.mobishoutEntry.noone.entry.licenseNumber &&
      json.data.mobishoutEntry.noone.entry.licenseNumber.nodes;

    if (!Array.isArray(nodes)) {
      throw new Error('Resposta ASF sem estrutura de resultados reconhecida');
    }

    if (nodes.length === 0) {
      return { estado: 'nao', node: null };
    }

    var node = nodes[0];

    if (!node || typeof node !== 'object') {
      return { estado: 'nao', node: null };
    }

    if (node.license === null || node.license === undefined) {
      return { estado: 'nao', node: null };
    }

    return { estado: 'sim', node: node };
  }

  function installEngineOverride() {
    try {
      if (state.engineInstalled) return true;

      if (typeof window.reservarSlotFisicoASF !== 'function') return false;

      window.efetuarPedidoHttpASF = async function (url, matDisplay) {
        return verixASFPost(url, matDisplay);
      };

      window.interpretarRespostaASF = function (json) {
        return verixInterpretarRespostaASF(json);
      };

      /* Garante que nenhum eventual chamador futuro aceite GET automático. */
      window.deveTentarGETASF = function () {
        return false;
      };

      state.engineInstalled = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function unwrap(fn) {
    var current = fn;
    var guard = 0;

    while (
      current &&
      current.__verixTelemetryV2Original &&
      guard < 8
    ) {
      current = current.__verixTelemetryV2Original;
      guard++;
    }

    return current;
  }

  function installErrorDiagnostic() {
    try {
      if (state.installed) return true;

      var fn = window.mostrarSeguroErro;
      if (typeof fn !== 'function' || !fn.__verixTelemetryV2Original) {
        return false;
      }

      var base = unwrap(fn);
      if (typeof base !== 'function') return false;

      var diagnostic = function (mensagem, matricula, diagnostico, queryId) {
        var message = String(
          mensagem ||
          state.lastErrorMessage ||
          'Falha de comunicação com a ASF'
        );

        var status = state.lastStatus;
        var duration = Number.isFinite(state.lastDurationMs)
          ? state.lastDurationMs
          : null;

        var errorName = state.lastErrorName || null;

        var meta = {
          queryId: queryId || window.__VERIX_CURRENT_QUERY_ID || null,
          asfDiagnosticVersion: 2,
          asfErrorType: classify(message, status, errorName),
          asfHttpStatus: status == null ? null : Number(status),
          asfDurationMs: duration,
          asfTransport: state.lastTransport || 'unknown',
          asfMethod: state.lastMethod || 'POST',
          asfBrowserError: truncate(errorName, 80) || null,
          asfMessage: truncate(message, 300)
        };

        try {
          if (
            window.VERIX_TELEMETRY &&
            typeof window.VERIX_TELEMETRY.track === 'function'
          ) {
            window.VERIX_TELEMETRY.track(
              'vehicle_insurance_error',
              'consulta',
              meta
            );
          }
        } catch (_) {}

        return base.apply(this, arguments);
      };

      diagnostic.__verixASFDiagnosticWrapped = true;
      diagnostic.__verixASFDiagnosticOriginal = base;
      window.mostrarSeguroErro = diagnostic;

      state.installed = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  /* Instala a correção imediatamente e volta a tentar durante o arranque. */
  try { installEngineOverride(); } catch (_) {}
  try { installErrorDiagnostic(); } catch (_) {}

  var deadline = nowMs() + 10000;
  var timer = setInterval(function () {
    var engineOk = installEngineOverride();
    var diagOk = installErrorDiagnostic();

    if (
      (engineOk && diagOk) ||
      nowMs() >= deadline
    ) {
      clearInterval(timer);
    }
  }, 100);

  try {
    window.addEventListener('load', function () {
      installEngineOverride();
      installErrorDiagnostic();
    });
  } catch (_) {}
})();
