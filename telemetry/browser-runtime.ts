/*
 * VÉRIX browser telemetry runtime.
 *
 * Source of truth: TypeScript. The release builder bundles this file and injects
 * it into the portable HTML artefact, keeping the distributed app self-contained.
 * Do not edit the generated inline script in dist/.
 */

type TelemetryEventName =
  | "app_open" | "heartbeat" | "session_close" | "vehicle_lookup"
  | "vehicle_insurance_pending" | "vehicle_insurance_yes"
  | "vehicle_insurance_no" | "vehicle_insurance_error" | "imt_loaded"
  | "module_open" | "history_open" | "history_reopen" | "external_tool_open"
  | "alcohol_lookup" | "cinemometer_operation_start" | "cinemometer_speed_entry"
  | "cinemometer_calculation" | "cinemometer_copy_code" | "cinemometer_copy_text"
  | "cinemometer_copy_location" | "cinemometer_profile_select"
  | "cinemometer_profile_new" | "cinemometer_profile_duplicate"
  | "cinemometer_profile_delete" | "cinemometer_profile_save"
  | "legislation_category_open" | "legislation_search" | "legislation_copy"
  | "legislation_favorite_toggle";

type TelemetryMetadata = Record<string, unknown>;

interface VerixTelemetryApi {
  readonly version: 2;
  readonly enabled: boolean;
  readonly installationId: string;
  readonly endpoint: string;
  newQueryId(): string;
  track(event: TelemetryEventName | string, module?: string | null, metadata?: TelemetryMetadata): void;
  queueSize(): number;
  rejectedQueueSize(): number;
  flush(): void;
}

interface Window {
  VERIX_TELEMETRY?: VerixTelemetryApi;
  __VERIX_CURRENT_QUERY_ID?: string | null;
}

/*
 VÉRIX TELEMETRIA V2 — implementação nova
 -----------------------------------------
 - Identidade persistente por instalação/navegador.
 - Sessão por abertura de separador.
 - Fila offline local separada da telemetria antiga.
 - Sem limpeza automática de localStorage.
 - Matrículas só são anexadas aos eventos ASF de resultado «sem registo» ou erro; os outros eventos continuam sem matrículas.
 - API pública compatível: window.VERIX_TELEMETRY.track/newQueryId/flush.
*/
(function () {
  'use strict';

  var ENDPOINT = 'https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/telemetry-v2';
  var APP_VERSION = '1.5';
  var INSTALL_KEY = 'VERIX_T2_INSTALL_ID';
  var SESSION_KEY = 'VERIX_T2_SESSION_ID';
  var TAB_KEY = 'VERIX_T2_TAB_ID';
  var QUEUE_KEY = 'VERIX_T2_QUEUE';
  var REJECTED_QUEUE_KEY = 'VERIX_T2_REJECTED_QUEUE';
  var MAX_QUEUE = 300;
  var MAX_REJECTED_QUEUE = 50;
  var BATCH_SIZE = 25;
  var FLUSH_MS = 15000;
  var HEARTBEAT_MS = 60000;
  var TIMEOUT_MS = 10000;

  var localStore = null;
  var sessionStore = null;
  try { localStore = window.localStorage; } catch (_) {}
  try { sessionStore = window.sessionStorage; } catch (_) {}

  var queue = [];
  var flushBusy = false;
  var flushTimer = null;
  var retryTimer = null;
  var retryStep = 0;
  var lastAction = Object.create(null);
  var legSearchTimer = null;

  function uid(prefix) {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return prefix + '-' + window.crypto.randomUUID();
      }
    } catch (_) {}
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function storageGet(store, key) {
    try { return store.getItem(key); } catch (_) { return null; }
  }

  function storageSet(store, key, value) {
    try { store.setItem(key, value); } catch (_) {}
  }

  function persistentId(store, key, prefix) {
    var value = storageGet(store, key);
    if (!value) {
      value = uid(prefix);
      storageSet(store, key, value);
    }
    return value;
  }

  var installationId = persistentId(localStore, INSTALL_KEY, 'i');
  var sessionId = persistentId(sessionStore, SESSION_KEY, 's');
  var tabId = persistentId(sessionStore, TAB_KEY, 't');

  function deviceType() {
    var w = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    if (/Mobi|Android/i.test(navigator.userAgent || '')) return 'mobile';
    if (w && w <= 900) return 'tablet';
    return 'desktop';
  }

  function browserName() {
    var ua = navigator.userAgent || '';
    if (/EdgA\//.test(ua) || /EdgiOS\//.test(ua) || /Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua)) return 'Opera';
    if (/CriOS\//.test(ua) || /Chrome\//.test(ua)) return 'Chrome';
    if (/FxiOS\//.test(ua) || /Firefox\//.test(ua)) return 'Firefox';
    if (/Version\//.test(ua) && /Safari\//.test(ua)) return 'Safari';
    return 'Other';
  }

  // Diagnóstico de cliente — apenas metadados técnicos para correlacionar erros.
  // Não envia matrícula, nome, conteúdo operacional ou dados de localização.
  var clientInfo = {
    browserVersion: null,
    osPlatform: null,
    osVersion: null,
    navigatorPlatform: null,
    uaMobile: null,
    online: null,
    connectionType: null,
    effectiveType: null,
    downlinkMbps: null,
    rttMs: null,
    saveData: null,
    hardwareConcurrency: null,
    deviceMemoryGb: null,
    viewport: null,
    devicePixelRatio: null,
    uaDataAvailable: false
  };

  function firstMatch(re, value) {
    var m = re.exec(value || '');
    return m ? m[1] : null;
  }

  function browserVersionFromUA(ua) {
    return firstMatch(/(?:EdgA|EdgiOS|Edg|CriOS|Chrome|FxiOS|Firefox|OPR|Version)\/([0-9.]+)/i, ua);
  }

  function osFromUA(ua) {
    if (/Android/i.test(ua)) {
      return { platform: 'Android', version: firstMatch(/Android\s+([0-9._]+)/i, ua) };
    }
    if (/Windows NT/i.test(ua)) {
      var w = firstMatch(/Windows NT\s+([0-9.]+)/i, ua);
      var map = { '10.0': '10', '6.4': '10', '6.3': '8.1', '6.2': '8', '6.1': '7' };
      return { platform: 'Windows', version: map[w] || w };
    }
    if (/iPhone|iPad|iPod/i.test(ua)) {
      return { platform: 'iOS', version: firstMatch(/(?:iPhone OS|CPU OS)\s+([0-9_]+)/i, ua) };
    }
    if (/Mac OS X/i.test(ua)) {
      return { platform: 'macOS', version: firstMatch(/Mac OS X\s*([0-9_\.]+)/i, ua) };
    }
    if (/Linux/i.test(ua)) return { platform: 'Linux', version: null };
    return { platform: null, version: null };
  }

  function refreshClientInfo() {
    try {
      var ua = navigator.userAgent || '';
      var os = osFromUA(ua);
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
      clientInfo.browserVersion = browserVersionFromUA(ua);
      clientInfo.osPlatform = os.platform;
      clientInfo.osVersion = os.version;
      clientInfo.navigatorPlatform = navigator.platform || null;
      clientInfo.uaMobile = /Mobi|Android/i.test(ua);
      clientInfo.online = navigator.onLine == null ? null : !!navigator.onLine;
      clientInfo.connectionType = c && c.type ? String(c.type).slice(0, 30) : null;
      clientInfo.effectiveType = c && c.effectiveType ? String(c.effectiveType).slice(0, 20) : null;
      clientInfo.downlinkMbps = c && typeof c.downlink === 'number' ? c.downlink : null;
      clientInfo.rttMs = c && typeof c.rtt === 'number' ? c.rtt : null;
      clientInfo.saveData = c && typeof c.saveData === 'boolean' ? c.saveData : null;
      clientInfo.hardwareConcurrency = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;
      clientInfo.deviceMemoryGb = typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null;
      clientInfo.viewport = (window.innerWidth || 0) + 'x' + (window.innerHeight || 0);
      clientInfo.devicePixelRatio = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : null;
      clientInfo.uaDataAvailable = !!navigator.userAgentData;
    } catch (_) {}
  }

  refreshClientInfo();

  // User-Agent Client Hints permite obter a versão completa do browser e a
  // versão real da plataforma em browsers que suportem a API.
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
      navigator.userAgentData.getHighEntropyValues(['platformVersion', 'fullVersionList']).then(function (ua) {
        try {
          if (ua && Array.isArray(ua.fullVersionList)) {
            var brands = ua.fullVersionList;
            var preferred = brands.find(function (b) {
              return /Microsoft Edge|Google Chrome|Chromium/i.test(b.brand || '');
            }) || brands.find(function (b) { return /Chrome|Chromium|Edge/i.test(b.brand || ''); });
            if (preferred && preferred.version) clientInfo.browserVersion = String(preferred.version).slice(0, 40);
          }
          if (ua && ua.platform) clientInfo.osPlatform = String(ua.platform).slice(0, 30);
          if (ua && ua.platformVersion) clientInfo.osVersion = String(ua.platformVersion).slice(0, 40);
          if (ua && typeof ua.mobile === 'boolean') clientInfo.uaMobile = ua.mobile;
        } catch (_) {}
      }).catch(function () {});
    }
  } catch (_) {}

  function readQueue() {
    try {
      var value = JSON.parse(storageGet(localStore, QUEUE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function saveQueue() {
    try {
      storageSet(localStore, QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
    } catch (_) {}
  }

  function recordRejectedEvents(batch, receipt) {
    var rejectedIds = Object.create(null);
    var retryIds = Object.create(null);
    var reasons = receipt && receipt.rejection_reasons || {};
    (receipt && receipt.rejected_event_ids || []).forEach(function (id) { rejectedIds[id] = true; });
    (receipt && receipt.retry_event_ids || []).forEach(function (id) { retryIds[id] = true; });
    var records = [];
    try {
      var stored = JSON.parse(storageGet(localStore, REJECTED_QUEUE_KEY) || '[]');
      if (Array.isArray(stored)) records = stored;
    } catch (_) {}
    batch.forEach(function (item) {
      var id = item && item.eventId;
      if (id && rejectedIds[id] && !retryIds[id]) {
        // Keep only a minimal diagnostic. Never copy metadata, plates or payloads.
        records.push({
          eventId: String(id).slice(0, 120),
          event: String(item.event || '').slice(0, 80),
          occurredAt: String(item.occurredAt || '').slice(0, 40),
          reason: String(reasons[id] || 'rejected_by_server').slice(0, 80),
          recordedAt: new Date().toISOString()
        });
      }
    });
    storageSet(localStore, REJECTED_QUEUE_KEY, JSON.stringify(records.slice(-MAX_REJECTED_QUEUE)));
  }

  queue = readQueue();

  function cleanMetadata(meta, event) {
    var m = meta && typeof meta === 'object' ? meta : {};
    var out = {};
    if (m.queryId) out.queryId = String(m.queryId).slice(0, 120);
    // Minimização: matrícula só segue nos dois resultados que alimentam as listas ASF.
    var normalizedPlate = '';
    if (event === 'vehicle_insurance_no' || event === 'vehicle_insurance_error') {
      var rawPlate = String(m.matricula || m.matriculaNormalizada || '').trim().toUpperCase().slice(0, 30);
      normalizedPlate = String(m.matriculaNormalizada || rawPlate).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30);
      if (rawPlate) out.matricula = rawPlate;
      if (normalizedPlate) out.matriculaNormalizada = normalizedPlate;
    }
    if (m.source) out.source = String(m.source).slice(0, 80);
    if (m.itemId) out.itemId = String(m.itemId).slice(0, 120);
    if (m.itemLabel) out.itemLabel = String(m.itemLabel).slice(0, 180);
    if (m.copyType) out.copyType = String(m.copyType).slice(0, 40);
    if (m.asfUserMessage) out.asfUserMessage = String(m.asfUserMessage).slice(0, 500);
    // Cinemómetro: guardar apenas medições/classificações necessárias às estatísticas.
    // Não persistir nome/número do operador, número de série nem local exato através deste snapshot.
    if (m.cin && typeof m.cin === 'object' && !Array.isArray(m.cin)) {
      var cin = m.cin;
      var cinNumber = function (value) {
        if (value === null || value === undefined || String(value).trim() === '') return null;
        var n = Number(String(value).trim().replace(',', '.'));
        return isFinite(n) ? n : null;
      };
      var cinText = function (value, max) {
        var v = String(value == null ? '' : value).trim();
        return v && v !== '—' ? v.slice(0, max) : null;
      };
      out.cin = {
        velocidade_registada: cinNumber(cin.velocidade_registada),
        velocidade_deduzida: cinNumber(cin.velocidade_deduzida),
        limite: cinNumber(cin.limite),
        excesso: cinNumber(cin.excesso),
        gravidade: cinText(cin.gravidade, 40),
        codigo: cinText(cin.codigo, 30),
        modo: cinText(cin.modo, 30),
        veiculo: cinText(cin.veiculo, 80),
        enquadramento: cinText(cin.enquadramento, 60),
        verificacao: cinText(cin.verificacao, 30)
      };
    }
    // Contexto técnico do cliente para diagnosticar diferenças entre browser/OS/rede.
    out.client = {
      browser: browserName(),
      browserVersion: clientInfo.browserVersion,
      osPlatform: clientInfo.osPlatform,
      osVersion: clientInfo.osVersion,
      navigatorPlatform: clientInfo.navigatorPlatform,
      uaMobile: clientInfo.uaMobile,
      online: clientInfo.online,
      connectionType: clientInfo.connectionType,
      effectiveType: clientInfo.effectiveType,
      downlinkMbps: clientInfo.downlinkMbps,
      rttMs: clientInfo.rttMs,
      saveData: clientInfo.saveData,
      hardwareConcurrency: clientInfo.hardwareConcurrency,
      deviceMemoryGb: clientInfo.deviceMemoryGb,
      viewport: clientInfo.viewport,
      devicePixelRatio: clientInfo.devicePixelRatio,
      uaDataAvailable: clientInfo.uaDataAvailable
    };

    if (m.asfDiagnostic && typeof m.asfDiagnostic === 'object') {
      var a = m.asfDiagnostic;
      out.asfDiagnostic = {
        queryId: a.queryId ? String(a.queryId).slice(0, 120) : null,
        matricula: a.matricula ? String(a.matricula).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30) : (event === 'vehicle_insurance_error' ? normalizedPlate || null : null),
        asfHttpStatus: a.asfHttpStatus == null ? null : Number(a.asfHttpStatus),
        asfDurationMs: a.asfDurationMs == null ? null : Number(a.asfDurationMs),
        asfMethod: a.asfMethod ? String(a.asfMethod).slice(0, 20) : null,
        asfTransport: a.asfTransport ? String(a.asfTransport).slice(0, 30) : null,
        asfErrorType: a.asfErrorType ? String(a.asfErrorType).slice(0, 60) : null,
        asfMessage: a.asfMessage ? String(a.asfMessage).slice(0, 500) : null,
        asfResponseBytes: a.asfResponseBytes == null ? null : Number(a.asfResponseBytes),
        asfAttempts: Array.isArray(a.asfAttempts) ? a.asfAttempts.slice(-4).map(function (t) {
          return {
            method: t.method ? String(t.method).slice(0, 20) : null,
            transport: t.transport ? String(t.transport).slice(0, 30) : null,
            status: t.status == null ? null : Number(t.status),
            durationMs: t.durationMs == null ? null : Number(t.durationMs),
            errorType: t.errorType ? String(t.errorType).slice(0, 60) : null,
            message: t.message ? String(t.message).slice(0, 500) : null,
            responseBytes: t.responseBytes == null ? null : Number(t.responseBytes)
          };
        }) : []
      };
    }
    return out;
  }

  function push(event, module, meta) {
    if (!event) return null;
    refreshClientInfo();

    var item = {
      eventId: uid('e'),
      buildId: window.VERIX_BUILD_ID || '1.5-sec-20261008-a',
      installationId: installationId,
      sessionId: sessionId,
      tabId: tabId,
      appVersion: APP_VERSION,
      deviceType: deviceType(),
      browser: browserName(),
      event: String(event),
      module: module ? String(module).slice(0, 50) : null,
      occurredAt: new Date().toISOString(),
      metadata: cleanMetadata(meta, event)
    };
    queue.push(item);

    saveQueue();

    // Os resultados que alimentam a lista de matrículas e os erros ASF são enviados
    // imediatamente. Os marcadores de início/presença usam o debounce de 50 ms
    // para poderem partilhar o mesmo lote com eventos emitidos no mesmo instante.
    if (event === 'vehicle_insurance_no' || event === 'vehicle_insurance_error') {
      flushNow();
    } else if (event === 'app_open' || event === 'heartbeat' || event === 'vehicle_lookup' || queue.length >= BATCH_SIZE) {
      flush();
    }
    return item;
  }

  function parseReceipt(text) {
    try {
      var data = JSON.parse(String(text || ''));
      if (!data || data.ok !== true ||
          !Array.isArray(data.acknowledged_event_ids) ||
          !Array.isArray(data.rejected_event_ids) ||
          !Array.isArray(data.retry_event_ids)) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  async function sendViaFetch(batch) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;

    try {
      var response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ events: batch }),
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true,
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) return null;
      return parseReceipt(await response.text());
    } catch (_) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function sendViaXhr(batch) {
    return new Promise(function (resolve) {
      try {
        var X = window.XMLHttpRequest;
        if (typeof X !== 'function') return resolve(null);
        var xhr = new X();
        var done = false;
        var finish = function (receipt) {
          if (done) return;
          done = true;
          try { xhr.abort(); } catch (_) {}
          resolve(receipt || null);
        };
        xhr.open('POST', ENDPOINT, true);
        xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
        xhr.timeout = TIMEOUT_MS;
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            finish(xhr.status >= 200 && xhr.status < 300 ? parseReceipt(xhr.responseText) : null);
          }
        };
        xhr.onerror = function () { finish(null); };
        xhr.ontimeout = function () { finish(null); };
        xhr.send(JSON.stringify({ events: batch }));
      } catch (_) {
        resolve(null);
      }
    });
  }

  function sendBeacon(batch) {
    try {
      if (!navigator.sendBeacon) return false;
      var payload = JSON.stringify({ events: batch });
      // O browser apenas confirma que aceitou a transmissão; não existe recibo.
      // Por isso a fila local nunca é removida com base no sendBeacon.
      return navigator.sendBeacon(
        ENDPOINT,
        new Blob([payload], { type: 'text/plain;charset=UTF-8' })
      );
    } catch (_) {
      return false;
    }
  }

  function sendViaActiveX(batch) {
    return new Promise(function (resolve) {
      try {
        if (typeof ActiveXObject === 'undefined') return resolve(null);
        var xhr = new ActiveXObject('WinHttp.WinHttpRequest.5.1');
        xhr.open('POST', ENDPOINT, false);
        xhr.setTimeouts(3000, 3000, TIMEOUT_MS, TIMEOUT_MS);
        xhr.setRequestHeader('Content-Type', 'text/plain; charset=UTF-8');
        xhr.send(JSON.stringify({ events: batch }));
        var status = Number(xhr.Status || 0);
        resolve(status >= 200 && status < 300 ? parseReceipt(xhr.ResponseText || xhr.responseText) : null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function send(batch) {
    if (typeof fetch === 'function') {
      var receipt = await sendViaFetch(batch);
      if (receipt) return receipt;
    }
    var xhrReceipt = await sendViaXhr(batch);
    if (xhrReceipt) return xhrReceipt;
    return await sendViaActiveX(batch);
  }

  function schedule(delay) {
    if (retryTimer || !queue.length) return;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      flushNow();
    }, Math.max(0, delay || 0));
  }

  async function flushNow() {
    if (flushBusy || !queue.length) return;
    flushBusy = true;

    var batch = queue.slice(0, BATCH_SIZE);

    try {
      var receipt = await send(batch);
      if (receipt && receipt.ok === true) {
        var acknowledged = Object.create(null);
        var retryIds = Object.create(null);
        (receipt.acknowledged_event_ids || []).forEach(function (id) { acknowledged[id] = true; });
        (receipt.retry_event_ids || []).forEach(function (id) { retryIds[id] = true; });
        (receipt.rejected_event_ids || []).forEach(function (id) {
          if (!retryIds[id]) acknowledged[id] = true;
        });
        Object.keys(retryIds).forEach(function (id) { delete acknowledged[id]; });
        recordRejectedEvents(batch, receipt);
        queue = queue.filter(function (item) {
          return !!item && !acknowledged[item.eventId];
        });
        saveQueue();
        retryStep = 0;
        if (queue.length) schedule(Object.keys(retryIds).length ? 2000 : 50);
      } else {
        retryStep = Math.min(retryStep + 1, 4);
        schedule([2000, 5000, 15000, 30000, 60000][retryStep]);
      }
    } finally {
      flushBusy = false;
    }
  }

  function flush() {
    if (!queue.length || flushBusy || retryTimer) return;
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flushNow();
    }, 50);
  }

  function flushBeacon() {
    if (!queue.length || flushBusy) return false;
    var batch = queue.slice(0, Math.min(BATCH_SIZE, 10));
    if (!sendBeacon(batch)) return false;
    // Keep the durable copy until fetch/XHR returns an application receipt.
    // The server's idempotency keys make a resend safe.
    return true;
  }

  function rateLimited(key, ms) {
    var now = Date.now();
    if (lastAction[key] && (now - lastAction[key]) < ms) return false;
    lastAction[key] = now;
    return true;
  }

  function newQueryId() {
    return uid('q');
  }

  function wrap(name, mapper) {
    try {
      var original = window[name];
      if (typeof original !== 'function' || original.__verixTelemetryV2Wrapped) return;

      var wrapped = function () {
        try { mapper.apply(this, arguments); } catch (_) {}
        return original.apply(this, arguments);
      };

      wrapped.__verixTelemetryV2Wrapped = true;
      wrapped.__verixTelemetryV2Original = original;
      window[name] = wrapped;
    } catch (_) {}
  }

  function cinTelemetryRaw(id) {
    var element = document.getElementById(id);
    if (!element) return '';
    return typeof element.value === 'string' ? element.value : (element.textContent || '');
  }

  function cinTelemetryNumber(id) {
    var raw = String(cinTelemetryRaw(id) || '').trim();
    if (!raw || raw === '—') return null;
    var value = Number(raw.replace(',', '.'));
    return isFinite(value) ? value : null;
  }

  function cinTelemetryText(id, max) {
    var value = String(cinTelemetryRaw(id) || '').trim();
    return value && value !== '—' ? value.slice(0, max) : null;
  }

  // Snapshot mínimo para diagnosticar cálculos, sem identidade do operador,
  // número de série do aparelho ou localização operacional exata.
  function cinTelemetrySnapshot() {
    var registered = cinTelemetryNumber('cinRegistada');
    if (registered === null || registered <= 0) return null;

    var deduced = cinTelemetryNumber('cinDeducida2');
    if (deduced === null && typeof window.cinCalcularDeducida === 'function') {
      try {
        var calculated = window.cinCalcularDeducida(registered);
        if (calculated !== null && isFinite(Number(calculated))) deduced = Number(calculated);
      } catch (_) {}
    }

    return {
      velocidade_registada: registered,
      velocidade_deduzida: deduced,
      limite: cinTelemetryNumber('cinLimite'),
      excesso: cinTelemetryNumber('cinExcesso'),
      gravidade: cinTelemetryText('cinGravidade', 40),
      codigo: cinTelemetryText('cinCodigo', 30),
      modo: cinTelemetryText('cinSessaoModo', 30),
      veiculo: cinTelemetryText('cinVeiculo', 80),
      enquadramento: cinTelemetryText('cinRegime', 60),
      verificacao: cinTelemetryText('cinVerificacao', 30)
    };
  }

  function insurancePlateMetadata(value, asfDiagnostic) {
    var raw = String(value || (asfDiagnostic && asfDiagnostic.matricula) || '').trim().toUpperCase().slice(0, 30);
    var normalized = raw.replace(/[^A-Z0-9]/g, '').slice(0, 30);
    var diagnostic = asfDiagnostic && typeof asfDiagnostic === 'object'
      ? Object.assign({}, asfDiagnostic)
      : null;
    if (diagnostic && normalized) diagnostic.matricula = normalized;
    return {
      matricula: raw || null,
      matriculaNormalizada: normalized || null,
      asfDiagnostic: diagnostic
    };
  }

  function installWrappers() {
    wrap('abrirConsultaPrincipal', function () {
      push('module_open', 'consulta');
    });

    wrap('abrirModulo', function (nome) {
      if (nome) push('module_open', String(nome));
    });

    wrap('abrirHistorico', function () {
      push('history_open', 'consulta');
    });

    wrap('repetirPesquisaHistorico', function () {
      push('history_reopen', 'consulta');
    });

    wrap('verificarSeguro', function () {
      push('external_tool_open', 'consulta');
    });

    wrap('consultarIMTERRU', function () {
      push('external_tool_open', 'ferramentas');
    });

    wrap('consultarINEM', function () {
      push('external_tool_open', 'ferramentas');
    });

    wrap('consultarWAZE', function () {
      push('external_tool_open', 'ferramentas');
    });

    wrap('consultarAlcoolTAS', function () {
      push('alcohol_lookup', 'alcoolExcel');
    });

    wrap('cinCopiarCodigo', function () {
      push('cinemometer_copy_code', 'cinemometro');
    });

    wrap('cinCopiarTexto', function () {
      push('cinemometer_copy_text', 'cinemometro');
    });

    wrap('cinCopiarLocal', function () {
      push('cinemometer_copy_location', 'cinemometro');
    });

    wrap('cinSelecionarPerfil', function () {
      push('cinemometer_profile_select', 'cinemometro');
    });

    wrap('cinNovoPerfil', function () {
      push('cinemometer_profile_new', 'cinemometro');
    });

    wrap('cinDuplicarPerfil', function () {
      push('cinemometer_profile_duplicate', 'cinemometro');
    });

    wrap('cinEliminarPerfil', function () {
      push('cinemometer_profile_delete', 'cinemometro');
    });

    wrap('cinGuardarConfiguracao', function () {
      push('cinemometer_profile_save', 'cinemometro');
    });

    wrap('cinRecalcular', function () {
      var registered = cinTelemetryNumber('cinRegistada');
      var limit = cinTelemetryNumber('cinLimite');
      if (registered === null || registered <= 0 || limit === null || limit <= 0) return;
      if (!rateLimited('cin_recalculate', 3000)) return;
      // Executar depois da função original atualizar dedutiva/excesso/classificação.
      setTimeout(function () {
        var snapshot = cinTelemetrySnapshot();
        if (!snapshot || snapshot.limite === null || snapshot.velocidade_deduzida === null) return;
        push('cinemometer_calculation', 'cinemometro', { cin: snapshot });
      }, 0);
    });

    wrap('renderSeguroEncontrado', function (_n, _mat, queryId, asfDiagnostic) {
      push('vehicle_insurance_yes', 'consulta', { queryId: queryId || window.__VERIX_CURRENT_QUERY_ID || null, asfDiagnostic: asfDiagnostic || null });
    });

    wrap('renderSeguroNaoEncontrado', function (_mat, queryId, asfDiagnostic) {
      var meta = insurancePlateMetadata(_mat, asfDiagnostic);
      meta.queryId = queryId || window.__VERIX_CURRENT_QUERY_ID || null;
      push('vehicle_insurance_no', 'consulta', meta);
    });

    wrap('mostrarSeguroErro', function (_msg, _mat, _diag, queryId, asfDiagnostic) {
      var meta = insurancePlateMetadata(_mat, asfDiagnostic);
      meta.queryId = queryId || window.__VERIX_CURRENT_QUERY_ID || null;
      meta.asfUserMessage = _msg || null;
      push('vehicle_insurance_error', 'consulta', meta);
    });

    wrap('consultarSeguroASF', function (matricula) {
      // Última barreira de consistência: quando o motor ASF é chamado,
      // a consulta já existe operacionalmente. Garantimos query_id + lookup
      // aqui, independentemente de o código de submit ter conseguido emitir
      // a telemetria antes.
      try {
        var q = window.__VERIX_CURRENT_QUERY_ID || null;
        if (!q) {
          q = newQueryId();
          window.__VERIX_CURRENT_QUERY_ID = q;
        }
        var qKey = 'query:' + String(q);
        if (!lastAction[qKey]) {
          lastAction[qKey] = Date.now();
          push('vehicle_lookup', 'consulta', { queryId: q });
        }
      } catch (_) {}

      push('vehicle_insurance_pending', 'consulta', {
        queryId: window.__VERIX_CURRENT_QUERY_ID || null
      });
    });
  }

  function bindDom() {
    document.addEventListener('click', function (ev) {
      var el = ev.target && ev.target.closest
        ? ev.target.closest('button,[role="button"]')
        : null;

      if (!el) return;

      if (el.matches('.leg-category')) {
        push('legislation_category_open', 'legislacao');
        return;
      }

      if (el.matches('.copy-btn-new,.copy-desc-new,.copy-all-new,.copy-btn')) {
        var card = el.closest('.leg-card-new');
        var title = card && card.querySelector('h3')
          ? String(card.querySelector('h3').textContent || '').trim()
          : '';
        var code = card && card.querySelector('.leg-code-box strong')
          ? String(card.querySelector('.leg-code-box strong').textContent || '').trim()
          : '';

        var copyType = el.classList.contains('copy-desc-new')
          ? 'description'
          : el.classList.contains('copy-all-new')
            ? 'all'
            : 'code';

        push('legislation_copy', 'legislacao', {
          itemId: code || title.slice(0, 120),
          itemLabel: title,
          copyType: copyType
        });
        return;
      }

      if (el.matches('.leg-search-fav')) {
        push('legislation_favorite_toggle', 'legislacao');
        return;
      }

      if (el.id === 'consultaHistoryTool' || el.classList.contains('consulta-history-bottom')) {
        push('history_open', 'consulta');
      }
    }, true);

    document.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'legSearch') {
        clearTimeout(legSearchTimer);
        legSearchTimer = setTimeout(function () {
          var len = String(ev.target.value || '').trim().length;
          if (len >= 2) push('legislation_search', 'legislacao');
        }, 700);
      }

      if (ev.target && ev.target.id === 'cinRegistada') {
        var value = String(ev.target.value || '').trim();
        if (value && rateLimited('cin_speed_entry', 2000)) {
          // O listener é de captura; recolher após o oninput e o recálculo do campo.
          setTimeout(function () {
            var snapshot = cinTelemetrySnapshot();
            if (snapshot) push('cinemometer_speed_entry', 'cinemometro', { cin: snapshot });
          }, 0);
        }
      }
    }, true);

  }

  function scheduleHeartbeat() {
    push('heartbeat', null);
    // Reagenda depois de executar a tentativa atual, evitando acumulação
    // de intervalos quando o browser está sob throttling.
    setTimeout(scheduleHeartbeat, HEARTBEAT_MS);
  }

  function start() {
    installWrappers();
    bindDom();

    // Presença imediata: a abertura da aplicação já marca o dispositivo ativo.
    push('app_open', null);
    flush();

    // Heartbeat recursivo + eventos de ciclo de vida.
    setTimeout(scheduleHeartbeat, HEARTBEAT_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        flushBeacon();
      } else {
        push('heartbeat', null);
      }
    });

    window.addEventListener('pagehide', function () {
      // Send an explicit close signal so the admin KPI drops this tab immediately
      // when the browser delivers pagehide. Keep the event in the durable queue
      // until a normal server receipt confirms acceptance.
      var closingEvent = push('session_close', null);
      try {
        if (closingEvent && navigator.sendBeacon) {
          navigator.sendBeacon(
            ENDPOINT,
            new Blob([JSON.stringify({ events: [closingEvent] })], { type: 'text/plain;charset=UTF-8' })
          );
        }
      } catch (_) {}
      flushBeacon();
    });

    window.addEventListener('pageshow', function () {
      push('heartbeat', null);
    });

    window.addEventListener('focus', function () {
      push('heartbeat', null);
    });

    window.addEventListener('online', function () {
      retryStep = 0;
      flush();
      push('heartbeat', null);
    });

    setTimeout(installWrappers, 500);
    setTimeout(installWrappers, 1500);
    setTimeout(installWrappers, 3000);
  }

  window.VERIX_TELEMETRY = {
    version: 2,
    enabled: true,
    installationId: installationId,
    newQueryId: newQueryId,
    track: function (event, module, meta) {
      push(event, module || null, meta);
      flush();
    },
    queueSize: function () { return queue.length; },
    rejectedQueueSize: function () {
      try {
        var stored = JSON.parse(storageGet(localStore, REJECTED_QUEUE_KEY) || '[]');
        return Array.isArray(stored) ? stored.length : 0;
      } catch (_) { return 0; }
    },
    flush: flush,
    endpoint: ENDPOINT
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
