// ========================= ASF / TEM SEGURO =========================
  // MOTOR = CÓPIA FUNCIONAL DO IPO_2.2 (único caminho que funciona no posto).
  // UI do VÉRIX mantida; transporte e cadência = IPO exacto.

  const ASF_PROXY_URL = 'https://onilkakbgpklxvxuxmks.supabase.co/functions/v1/asf-proxy-v1';

  const ASF_TIMEOUT_MS = 15000;
  const ASF_MAX_ATTEMPTS = 3;
  const ASF_RETRY_DELAYS_MS = [300, 900];
  /*
   * Sem quota artificial VÉRIX por minuto.
   * A fila apenas serializa pedidos concorrentes para proteger a estabilidade.
   * Retries existem exclusivamente para falhas transitórias de transporte.
   * Um 429 devolvido pela ASF é respeitado e não é contornado automaticamente.
   */
  var ASF_FILA_PENDENTES = 0;

  function agoraASF() { return Date.now(); }
  function esperarASF(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // ASF helpers — kept independent from quota/rate-control code.
  function formatarDataPT(valor) {
    if (valor === undefined || valor === null || String(valor).trim() === '' || String(valor) === '—') return '—';
    var s = String(valor).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return s;
  }

  function formatarMatriculaDisplay(mat) {
    return String(mat || '').trim().toUpperCase();
  }

  function sanitizarMatriculaASF(matricula) {
    return String(matricula || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function valorCampo(obj, nomes, fallback) {
    fallback = fallback || '';
    if (!obj) return fallback;
    for (var i = 0; i < nomes.length; i++) {
      var v = obj[nomes[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        if (typeof v === 'object') return v.name || v.label || v.value || v.description || fallback;
        return String(v);
      }
    }
    return fallback;
  }


  function atualizarContadorVisualASF() {
    var widget = document.getElementById('asfRateWidget');
    var cd = document.getElementById('asfRateCountdown');
    var usage = document.getElementById('asfRateUsage');
    var windowText = document.getElementById('asfRateWindowText');
    if (!widget || !cd) return;

    widget.classList.remove('warn', 'high', 'cooldown', 'asf-wait-state');
    if (usage) usage.innerHTML = 'SEM QUOTA LOCAL';

    if (windowText) {
      windowText.textContent = (ASF_FILA_PENDENTES || 0) > 0
        ? (ASF_FILA_PENDENTES + ' CONSULTA' + (ASF_FILA_PENDENTES === 1 ? '' : 'S') + ' EM FILA')
        : 'PESQUISA DISPONÍVEL';
      windowText.setAttribute('data-window-state', 'ready');
    }

    cd.textContent = (ASF_FILA_PENDENTES || 0) > 0 ? 'A PROCESSAR' : 'LIVRE';
    cd.setAttribute('data-state', 'ready');
    cd.title = 'Sem limite artificial local VÉRIX; pedidos concorrentes seguem em paralelo.';
  }

  function reservarSlotFisicoASF() {
    atualizarContadorVisualASF();
    return Promise.resolve(agoraASF());
  }
  atualizarContadorVisualASF();

  function agoraMsASFDiag() { return Date.now(); }

  function hashTextoASF(value) {
    var s = String(value || '');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function textoErroASF(e) {
    if (!e) return '';
    var parts = [];
    try { if (e.name) parts.push(String(e.name)); } catch (_) {}
    try { if (e.message) parts.push(String(e.message)); } catch (_) {}
    try { if (e.number) parts.push('number=' + String(e.number)); } catch (_) {}
    return parts.join(' | ').slice(0, 500);
  }

  function classificarErroASF(e, timeoutForcado) {
    var t = textoErroASF(e).toLowerCase();
    if (
      timeoutForcado ||
      t.indexOf('abort') >= 0 ||
      t.indexOf('timed out') >= 0 ||
      t.indexOf('timeout') >= 0 ||
      t.indexOf('tempo esgotado') >= 0
    ) return 'timeout';

    if (
      t.indexOf('cors') >= 0 ||
      t.indexOf('networkerror') >= 0 ||
      t.indexOf('network error') >= 0 ||
      t.indexOf('failed to fetch') >= 0 ||
      t.indexOf('internet') >= 0
    ) return 'network';

    return 'unknown';
  }

  function criarDiagASF(queryId, matDisplay) {
    return {
      queryId: queryId || null,
      matricula: String(matDisplay || '').slice(0, 30),
      asfHttpStatus: null,
      asfDurationMs: null,
      asfTotalMs: null,
      asfQueueWaitMs: null,
      asfMethod: null,
      asfTransport: null,
      asfErrorType: null,
      asfMessage: null,
      asfAttempts: [],
      asfResponseBytes: null,
      asfResponseContentType: null,
      asfResponseHash: null,
      asfStatusText: null,
      asfRelayLatencyMs: null
    };
  }

  function erroComDiagASF(mensagem, diagnostico) {
    var err = new Error(String(mensagem || 'Falha ASF'));
    try { err.asfDiagnostic = diagnostico || null; } catch (_) {}
    return err;
  }

  function finalizarTentativaDiagASF(diag, tentativa, extra) {
    tentativa.durationMs = Math.max(0, agoraMsASFDiag() - tentativa.startedAt);

    if (extra) {
      Object.keys(extra).forEach(function (k) {
        tentativa[k] = extra[k];
      });
    }

    diag.asfAttempts.push(tentativa);
    diag.asfDurationMs = tentativa.durationMs;
    diag.asfTotalMs = (diag.asfQueueWaitMs || 0) + tentativa.durationMs;
    diag.asfHttpStatus = tentativa.status == null ? null : Number(tentativa.status);
    diag.asfMethod = tentativa.method || null;
    diag.asfTransport = tentativa.transport || null;
    diag.asfErrorType = tentativa.errorType || diag.asfErrorType || null;
    diag.asfMessage = tentativa.message
      ? String(tentativa.message).slice(0, 500)
      : diag.asfMessage;
    diag.asfResponseContentType = tentativa.responseContentType || diag.asfResponseContentType || null;
    diag.asfResponseHash = tentativa.responseHash || diag.asfResponseHash || null;
    diag.asfStatusText = tentativa.statusText || diag.asfStatusText || null;
  }

  // ---- HTTP ASF: relay servidor-servidor ----
  // O browser deixa de contactar ext01.asf.com.pt diretamente.
  // O pedido é enviado ao relay VÉRIX por HTTPS; o relay fala com a ASF.
  // Assim o caminho crítico do cliente não depende de CORS/LNA/PNA, split-DNS
  // ou das políticas de acesso do browser à origem ASF.
  // Uma consulta = um pedido físico. Sem GET de fallback e sem retries.

  function obterAsfInstallationId() {
    try {
      var id = localStorage.getItem('VERIX_T2_INSTALL_ID');
      if (id) return String(id).slice(0, 120);
    } catch (_) {}

    try {
      var existing = localStorage.getItem('VERIX_ASF_INSTALL_ID_V1');
      if (existing) return String(existing).slice(0, 120);

      var created;
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        created = 'i-' + window.crypto.randomUUID();
      } else {
        created = 'i-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      }
      localStorage.setItem('VERIX_ASF_INSTALL_ID_V1', created);
      return created.slice(0, 120);
    } catch (_) {
      return 'i-anon';
    }
  }


  function asfTentativaRetryable(status, errorType) {
    if (Number(status) === 429) return false;
    if ([502, 503, 504].indexOf(Number(status)) >= 0) return true;
    return ['timeout', 'network', 'unknown'].indexOf(String(errorType || '')) >= 0;
  }

  async function efetuarPedidoHttpASF(payload, matDisplay, queryId) {
    var diag = criarDiagASF(queryId, matDisplay);
    var securityTokenASF = null;
    try {
      securityTokenASF = await window.VERIX_SECURITY.getToken(false);
    } catch (_) {
      diag.asfErrorType = 'security_auth';
      diag.asfMessage = 'O VÉRIX não conseguiu validar a autorização desta instalação.';
      throw erroComDiagASF(diag.asfMessage, diag);
    }
    if (!securityTokenASF) {
      diag.asfErrorType = 'security_auth';
      diag.asfMessage = 'O VÉRIX não conseguiu obter a autorização desta instalação.';
      throw erroComDiagASF(diag.asfMessage, diag);
    }
    var queueStarted = agoraMsASFDiag();

    await reservarSlotFisicoASF(matDisplay);
    diag.asfQueueWaitMs = Math.max(0, agoraMsASFDiag() - queueStarted);

    var requestBody = JSON.stringify(payload || {});
    var ultimaTentativa = null;

    for (var tentativaNo = 1; tentativaNo <= ASF_MAX_ATTEMPTS; tentativaNo++) {
      var tentativa = {
        attempt: tentativaNo,
        method: 'POST',
        transport: (typeof ActiveXObject !== 'undefined') ? 'WinHTTP→VÉRIX-RELAY' : 'Fetch→VÉRIX-RELAY',
        startedAt: agoraMsASFDiag(),
        status: null,
        statusText: null,
        durationMs: null,
        errorType: null,
        message: null,
        responseBytes: null,
        responseContentType: null
      };

      var bodyText = '';
      try {
        if (typeof ActiveXObject !== 'undefined') {
          var xhr = new ActiveXObject('WinHttp.WinHttpRequest.5.1');
          xhr.open('POST', ASF_PROXY_URL, false);
          xhr.setTimeouts(10000, 10000, ASF_TIMEOUT_MS, ASF_TIMEOUT_MS);
          xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
          xhr.setRequestHeader('Content-Type', 'text/plain; charset=UTF-8');
          xhr.setRequestHeader('X-Verix-Build-Id', window.VERIX_BUILD_ID || '1.5-sec-20261008-a');
          xhr.setRequestHeader('X-Verix-Client-Token', securityTokenASF);
          xhr.send(requestBody);

          tentativa.status = Number(xhr.Status || 0);
          bodyText = xhr.ResponseText || '';
        } else {
          var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
          var timeoutId = null;
          var timeoutForcado = false;

          try {
            timeoutId = setTimeout(function () {
              timeoutForcado = true;
              try { if (controller) controller.abort(); } catch (_) {}
            }, ASF_TIMEOUT_MS);

            var res = await fetch(ASF_PROXY_URL, {
              method: 'POST',
              cache: 'no-store',
              credentials: 'omit',
              mode: 'cors',
              redirect: 'follow',
              headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'text/plain;charset=UTF-8',
                'X-Verix-Build-Id': window.VERIX_BUILD_ID || '1.5-sec-20261008-a',
                'X-Verix-Client-Token': securityTokenASF
              },
              body: requestBody,
              signal: controller ? controller.signal : undefined
            });

            tentativa.status = Number(res.status);
            tentativa.statusText = res.statusText || null;
            tentativa.responseContentType = res.headers && res.headers.get
              ? (res.headers.get('content-type') || null)
              : null;

            if (res.headers && res.headers.get) {
              var relayLatencyHeader = res.headers.get('X-Verix-ASF-Latency-Ms');
              var relayLatencyMs = Number(relayLatencyHeader);
              if (Number.isFinite(relayLatencyMs)) diag.asfRelayLatencyMs = relayLatencyMs;
            }

            bodyText = await res.text();

            if (res.status >= 400) {
              tentativa.errorType = res.status === 429
                ? 'http_429'
                : (res.status === 503
                  ? 'http_503'
                  : (res.status === 504 ? 'relay_timeout' : (res.status === 502 ? 'relay_network' : 'http_' + res.status)));
            }
          } catch (e) {
            tentativa.errorType = timeoutForcado
              ? 'timeout'
              : classificarErroASF(e, false);
            tentativa.message = textoErroASF(e);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }

        tentativa.responseBytes = bodyText ? String(bodyText).length : 0;
        tentativa.responseHash = hashTextoASF(bodyText);
        finalizarTentativaDiagASF(diag, tentativa);
        ultimaTentativa = tentativa;

        var retryable = asfTentativaRetryable(tentativa.status, tentativa.errorType);
        if (!retryable || tentativaNo >= ASF_MAX_ATTEMPTS) {
          if (Number(tentativa.status) >= 200 && Number(tentativa.status) < 300) {
            diag.asfErrorType = null;
            diag.asfMessage = null;
          }
          return {
            status: tentativa.status,
            statusText: tentativa.statusText || null,
            text: bodyText || '',
            __asfDiagnostic: diag
          };
        }

        var delay = ASF_RETRY_DELAYS_MS[Math.min(tentativaNo - 1, ASF_RETRY_DELAYS_MS.length - 1)] || 900;
        await esperarASF(delay);
      } catch (e) {
        if (!tentativa.durationMs) {
          tentativa.message = tentativa.message || textoErroASF(e);
          tentativa.errorType = tentativa.errorType || classificarErroASF(e, false);
          finalizarTentativaDiagASF(diag, tentativa);
        }
        ultimaTentativa = tentativa;

        if (tentativaNo >= ASF_MAX_ATTEMPTS || !asfTentativaRetryable(null, tentativa.errorType)) {
          throw erroComDiagASF((e && e.message) || 'Falha de comunicação com o relay ASF', diag);
        }

        var delayEx = ASF_RETRY_DELAYS_MS[Math.min(tentativaNo - 1, ASF_RETRY_DELAYS_MS.length - 1)] || 900;
        await esperarASF(delayEx);
      }
    }

    throw erroComDiagASF(
      (ultimaTentativa && ultimaTentativa.message) || 'Falha de comunicação com o relay ASF',
      diag
    );
  }

  // Parser robusto inspirado no Consulta Veiculo(2): aceita os envelopes ASF
  // conhecidos e uma estrutura alternativa onde o resultado aparece dentro de
  // outro objecto nodes. Nunca transforma erro de esquema em "sem seguro".
  function extrairNodesASF(data) {
    var candidatos = [
      data && data.data && data.data.mobishoutEntry && data.data.mobishoutEntry.noone && data.data.mobishoutEntry.noone.entry && data.data.mobishoutEntry.noone.entry.licenseNumber && data.data.mobishoutEntry.noone.entry.licenseNumber.nodes,
      data && data.mobishoutEntry && data.mobishoutEntry.noone && data.mobishoutEntry.noone.entry && data.mobishoutEntry.noone.entry.licenseNumber && data.mobishoutEntry.noone.entry.licenseNumber.nodes,
      data && data.data && data.data.licenseNumber && data.data.licenseNumber.nodes,
      data && data.licenseNumber && data.licenseNumber.nodes
    ];

    for (var i = 0; i < candidatos.length; i++) {
      if (Array.isArray(candidatos[i])) {
        return { found: true, nodes: candidatos[i] };
      }
    }

    var encontrado = null;
    function arrayTemCamposSeguro(arr) {
      if (!Array.isArray(arr) || !arr.length) return false;
      var campos = ['entity','insurer','insuranceCompany','policy','policyNumber','startDate','validFrom','endDate','validTo','license','licenseNumber','code'];
      return arr.some(function (item) {
        if (!item || typeof item !== 'object') return false;
        return campos.some(function (k) { return Object.prototype.hasOwnProperty.call(item, k); });
      });
    }

    function walk(v, profundidade, caminho) {
      if (encontrado || !v || profundidade > 12) return;
      if (Array.isArray(v) || typeof v !== 'object') return;

      if (Array.isArray(v.nodes)) {
        var caminhoTexto = (caminho || []).join('.').toLowerCase();
        var contextoASF = /license|insurance|mobishout|entry|noone|asf/.test(caminhoTexto)
          || Object.prototype.hasOwnProperty.call(v, 'licenseNumber')
          || Object.prototype.hasOwnProperty.call(v, 'policy');
        // Arrays vazios só podem ser considerados um "sem seguro" conclusivo
        // quando estão num contexto ASF conhecido. Arrays não vazios podem
        // ser aceites quando trazem campos de seguro reconhecíveis.
        if ((v.nodes.length === 0 && contextoASF) || arrayTemCamposSeguro(v.nodes)) {
          encontrado = v.nodes;
          return;
        }
      }

      var vals = Object.keys(v);
      for (var j = 0; j < vals.length; j++) {
        var k = vals[j];
        walk(v[k], profundidade + 1, (caminho || []).concat(k));
        if (encontrado) return;
      }
    }
    walk(data, 0, []);

    return encontrado ? { found: true, nodes: encontrado } : { found: false, nodes: [] };
  }

  function interpretarRespostaASF(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Resposta ASF inválida');
    }

    if (Array.isArray(json.errors) && json.errors.length) {
      var msgs = json.errors.map(function (e) {
        return e && e.message ? String(e.message) : '';
      }).filter(Boolean);
      throw new Error(msgs.length ? msgs.join(' | ') : 'A ASF devolveu um erro GraphQL');
    }

    var extraido = extrairNodesASF(json);
    if (!extraido.found) {
      throw new Error('Resposta ASF sem estrutura de resultados reconhecida');
    }

    var nodes = Array.isArray(extraido.nodes) ? extraido.nodes : null;
    if (!nodes) {
      throw new Error('Resposta ASF com campo nodes inválido');
    }

    /*
     * REGRA ASF ALINHADA COM A APK BASE:
     * - nodes vazio = SEM SEGURO
     * - node.license != null = TEM SEGURO
     * - nodes existentes sem `license` = SEM SEGURO
     *
     * Campos como entity/policy/startDate/endDate não são, por si só,
     * suficientes para classificar a existência do seguro.
     */
    if (nodes.length === 0) {
      return { estado: 'nao', node: null };
    }

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node || typeof node !== 'object') continue;

      if (node.license !== undefined && node.license !== null) {
        return { estado: 'sim', node: node };
      }
    }

    return { estado: 'nao', node: null };
  }

  // CONSULTA ASF = mesmo endpoint/mutation do IPO_2.2, com parser robusto.
  // Sem quota artificial VÉRIX; 429 devolvido pela ASF é respeitado.

  async function realizarConsultaASF_IPO(matLimpa, matDisplay, queryId) {
    var hoje = new Date();
    var yyyy = hoje.getFullYear();
    var mm = String(hoje.getMonth() + 1).padStart(2, '0');
    var dd = String(hoje.getDate()).padStart(2, '0');
    var dataHoje = yyyy + '/' + mm + '/' + dd;

    var resposta = await efetuarPedidoHttpASF({
      matricula: matLimpa,
      date: dataHoje,
      installationId: obterAsfInstallationId(),
      queryId: queryId || '',
      buildId: window.VERIX_BUILD_ID || '1.5-sec-20261008-a'
    }, matDisplay, queryId);

    var diag = resposta && resposta.__asfDiagnostic
      ? resposta.__asfDiagnostic
      : criarDiagASF(queryId, matDisplay);

    var httpStatus = resposta && resposta.status != null ? Number(resposta.status) : null;
    var responseText = resposta && resposta.text ? String(resposta.text) : '';

    diag.asfHttpStatus = Number.isFinite(httpStatus) ? httpStatus : null;
    diag.asfResponseBytes = responseText.length;

    if (httpStatus === 429) {
      diag.asfErrorType = 'http_429';
      diag.asfMessage = 'A ASF recusou temporariamente a consulta (HTTP 429)';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    if (httpStatus === 504) {
      diag.asfErrorType = 'relay_timeout';
      diag.asfMessage = 'O relay VÉRIX excedeu o tempo de resposta da ASF após as tentativas automáticas';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    if (httpStatus === 502) {
      diag.asfErrorType = 'relay_network';
      diag.asfMessage = 'O relay VÉRIX não conseguiu comunicar com a ASF após as tentativas automáticas';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    if (httpStatus === 503) {
      diag.asfErrorType = 'http_503';
      diag.asfMessage = 'Serviço temporariamente indisponível após as tentativas automáticas';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    if (httpStatus < 200 || httpStatus >= 300) {
      diag.asfErrorType = 'http_' + httpStatus;
      diag.asfMessage = 'Erro HTTP ' + httpStatus;
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    var json;
    try {
      json = JSON.parse(responseText);
    } catch (_) {
      diag.asfErrorType = 'invalid_json';
      diag.asfMessage = 'Resposta ASF não é JSON válido';
      throw erroComDiagASF(diag.asfMessage, diag);
    }

    try {
      if (Array.isArray(json.errors) && json.errors.length) {
        diag.asfErrorType = 'graphql';
      }

      var resultado = interpretarRespostaASF(json);
      diag.asfErrorType = null;
      diag.asfMessage = null;
      return { resultado: resultado, asfDiagnostic: diag };
    } catch (e) {
      if (!diag.asfErrorType) {
        diag.asfErrorType =
          (String(e && e.message || '').toLowerCase().indexOf('estrutura') >= 0)
            ? 'invalid_response'
            : 'graphql';
      }
      diag.asfMessage = String(e && e.message || 'Resposta ASF inválida').slice(0, 500);
      throw erroComDiagASF(diag.asfMessage, diag);
    }
  }

  function anunciarEstadoConsultaASF(mensagem) {
    var el = document.getElementById('seguroResultAnnouncement');
    if (el) el.textContent = String(mensagem || '');
  }

  function mostrarSeguroLoading(matricula, extra) {
    var box = document.getElementById('seguroResult');
    if (!box) return;
    var matShow = formatarMatriculaDisplay(matricula || '');
    anunciarEstadoConsultaASF('A consultar o serviço ASF para a matrícula ' + (matShow || 'indicada') + '.');
    box.innerHTML = ''
      + '<div class="asf-app asf-app-wait">'
      +   '<div class="asf-app-plate">'
      +     '<span class="asf-app-plate-label">Matrícula</span>'
      +     '<span class="asf-app-plate-badge">' + escapeHtml(matShow || '…') + '</span>'
      +   '</div>'
      +   '<div class="asf-status-card wait">'
      +     '<div class="asf-status-glow"></div>'
      +     '<div class="spinner asf-spinner"></div>'
      +     '<div class="asf-status-title">A consultar ASF…</div>'
      +     '<div class="asf-status-sub">' + escapeHtml(extra || 'Aguarde a resposta do canal de seguros') + '</div>'
      +   '</div>'
      + '</div>';
  }

  function calcularDiasRestantesASF(dateText) {
    var raw = String(dateText || '').trim();
    if (!raw) return null;
    var m = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    var d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59, 999) : new Date(raw);
    if (isNaN(d.getTime())) return null;
    var today = new Date();
    today.setHours(0,0,0,0);
    var end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.ceil((end.getTime() - today.getTime()) / 86400000);
  }

  function renderSeguroEncontrado(n, matricula, queryId, asfDiagnostic) {
    try { atualizarSeguroNoHistorico(queryId, matricula, 'sim'); } catch (_) {}
    var box = document.getElementById('seguroResult');
    if (!box) return;
    n = n || {};
    var matShow = formatarMatriculaDisplay(matricula);
    anunciarEstadoConsultaASF('Consulta ASF concluída: foi encontrado registo de seguro para a matrícula ' + (matShow || 'consultada') + '.');
    var entity = valorCampo(n, ['entity', 'insurer', 'insuranceCompany'], '—');
    var policy = valorCampo(n, ['policy', 'policyNumber'], '—');
    var ini = formatarDataPT(valorCampo(n, ['startDate', 'validFrom'], ''));
    var fim = formatarDataPT(valorCampo(n, ['endDate', 'validTo'], ''));
    var logo = valorCampo(n, ['logo'], '');
    var diasRestantes = calcularDiasRestantesASF(fim);
    var validadeTexto = diasRestantes == null ? 'DATA NÃO DISPONÍVEL' : (diasRestantes === 0 ? 'TERMINA HOJE' : (diasRestantes > 0 ? (diasRestantes + (diasRestantes === 1 ? ' DIA RESTANTE' : ' DIAS RESTANTES')) : ('EXPIRADO HÁ ' + Math.abs(diasRestantes) + (Math.abs(diasRestantes) === 1 ? ' DIA' : ' DIAS'))));
    var validadeClasse = diasRestantes == null ? 'unknown' : (diasRestantes >= 0 ? 'valid' : 'expired');
    var logoHtml = (logo && !/default\.png/i.test(logo))
      ? '<div class="asf-logo-wrap"><img class="asf-logo" src="' + escapeHtml(logo) + '" alt="" onerror="this.parentNode.style.display=\'none\'"></div>'
      : '<div class="asf-logo-wrap asf-logo-fallback">ASF</div>';
    box.innerHTML = ''
      + '<div class="asf-app asf-app-ok asf-operational-result">'
      +   '<div class="asf-success-hero">'
      +     '<div class="asf-success-badge">✓</div>'
      +     '<div class="asf-success-copy"><div class="asf-success-kicker">RESULTADO DA CONSULTA ASF</div><div class="asf-success-title">' + (diasRestantes == null ? 'REGISTO ENCONTRADO' : (diasRestantes < 0 ? 'SEGURO EXPIRADO' : (diasRestantes === 0 ? 'SEGURO VÁLIDO ATÉ HOJE' : 'SEGURO VÁLIDO'))) + '</div><div class="asf-success-sub">' + (diasRestantes == null ? 'REGISTO ENCONTRADO · VALIDADE POR CONFIRMAR' : (diasRestantes < 0 ? 'A DATA DE VALIDADE JÁ FOI ULTRAPASSADA' : (diasRestantes === 0 ? 'A DATA DE VALIDADE TERMINA HOJE' : 'REGISTO ASF ENCONTRADO · PRAZO EM VIGOR'))) + '</div></div>'
      +     '<div class="asf-success-plate"><span>' + escapeHtml(matShow) + '</span></div>'
      +   '</div>'
      +   '<div class="asf-operational-status ' + validadeClasse + '">'
      +     '<div><span class="asf-op-kicker">SITUAÇÃO</span><strong>' + (diasRestantes == null ? 'VALIDADE POR CONFIRMAR' : (diasRestantes < 0 ? 'SEGURO EXPIRADO' : 'SEGURO VÁLIDO')) + '</strong></div>'
      +     '<div class="asf-op-validity"><span class="asf-op-kicker">PRAZO DE VALIDADE</span><strong>' + escapeHtml(validadeTexto) + '</strong></div>'
      +   '</div>'
      +   '<div class="asf-detail-card asf-operational-card">'
      +     '<div class="asf-detail-head">' + logoHtml + '<div class="asf-detail-head-text"><span class="asf-detail-kicker">DADOS DO SEGURO</span><strong>' + escapeHtml(entity) + '</strong></div></div>'
      +     '<div class="asf-rows">'
      +       '<div class="asf-row asf-row-emphasis"><span class="k">SEGURADORA</span><span class="v">' + escapeHtml(entity) + '</span></div>'
      +       '<div class="asf-row asf-row-emphasis"><span class="k">APÓLICE</span><span class="v asf-mono">' + escapeHtml(policy) + '</span></div>'
      +       '<div class="asf-dates-grid">'
      +         '<div class="asf-date-box"><span class="k">INÍCIO</span><strong>' + escapeHtml(ini || '—') + '</strong></div>'
      +         '<div class="asf-date-box ' + validadeClasse + '"><span class="k">' + (diasRestantes == null ? 'VALIDADE' : (diasRestantes < 0 ? 'EXPIRADO EM' : (diasRestantes === 0 ? 'VÁLIDO ATÉ HOJE' : 'VÁLIDO ATÉ'))) + '</span><strong>' + escapeHtml(fim || '—') + '</strong></div>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="asf-operational-actions"><button type="button" class="aux-btn secondary" onclick="verificarSeguro()">ABRIR CONSULTA OFICIAL ASF</button></div>'
      +   '<div class="asf-note">Fonte: canal ASF · Confirme pelos meios oficiais da sua instituição</div>'
      + '</div>';
  }

  function renderSeguroNaoEncontrado(matricula, queryId, asfDiagnostic) {
    try { atualizarSeguroNoHistorico(queryId, matricula, 'nao'); } catch (_) {}
    var box = document.getElementById('seguroResult');
    if (!box) return;
    var matShow = formatarMatriculaDisplay(matricula);
    anunciarEstadoConsultaASF('Consulta ASF concluída. Não foi encontrado registo de seguro para a matrícula ' + (matShow || 'consultada') + '; confirme pelos meios oficiais.');
    box.innerHTML = ''
      + '<div class="asf-app asf-app-no asf-negative-operational">'
      +   '<section class="asf-negative-hero" aria-label="Resultado sem registo de seguro">'
      +     '<div class="asf-negative-heading">'
      +       '<div class="asf-negative-icon" aria-hidden="true">×</div>'
      +       '<div class="asf-negative-copy">'
      +         '<div class="asf-negative-kicker">RESULTADO DA CONSULTA ASF</div>'
      +         '<div class="asf-negative-title">SEM SEGURO VÁLIDO</div>'
      +         '<div class="asf-negative-sub">Sem registo ativo no canal ASF para esta data</div>'
      +       '</div>'
      +     '</div>'
      +     '<div class="asf-negative-plate-wrap">'
      +       '<span class="asf-negative-plate-label">MATRÍCULA CONSULTADA</span>'
      +       '<div class="asf-negative-plate"><span>' + escapeHtml(matShow || '—') + '</span></div>'
      +     '</div>'
      +   '</section>'
      +   '<section class="asf-negative-alert">'
      +     '<div class="asf-negative-alert-title">CONFIRMAÇÃO OFICIAL NECESSÁRIA</div>'
      +     '<p>Confirme a situação na consulta oficial ASF antes de qualquer decisão operacional.</p>'
      +   '</section>'
      +   '<div class="asf-negative-actions"><button type="button" class="asf-negative-button" onclick="verificarSeguro()">ABRIR CONSULTA OFICIAL ASF</button></div>'
      +   '<div class="asf-negative-source"><span class="asf-negative-source-dot" aria-hidden="true"></span> Resultado do canal ASF · Confirmar por meios oficiais</div>'
      + '</div>';
  }

  function mostrarSeguroErro(mensagem, matricula, diagnostico, queryId, asfDiagnostic) {
    try { atualizarSeguroNoHistorico(queryId, matricula, 'indisponivel'); } catch (_) {}
    var box = document.getElementById('seguroResult');
    if (!box) return;
    var matShow = formatarMatriculaDisplay(matricula);
    anunciarEstadoConsultaASF('Consulta ASF inconclusiva para a matrícula ' + (matShow || 'consultada') + '. Não interpretar como ausência de seguro.');
    box.innerHTML = ''
      + '<div class="asf-app asf-app-warn">'
      +   '<div class="asf-app-plate">'
      +     '<span class="asf-app-plate-label">Matrícula</span>'
      +     '<span class="asf-app-plate-badge">' + escapeHtml(matShow || '—') + '</span>'
      +   '</div>'
      +   '<div class="asf-status-card warn">'
      +     '<div class="asf-status-glow"></div>'
      +     '<div class="asf-status-icon"><span>!</span></div>'
      +     '<div class="asf-status-title">Consulta indisponível</div>'
      +     '<div class="asf-status-sub">Não é possível concluir se existe seguro</div>'
      +   '</div>'
      +   '<div class="asf-detail-card asf-detail-error">'
      +     '<div class="asf-row"><span class="k">Motivo</span><span class="v">' + escapeHtml(mensagem || '—') + '</span></div>'
      +   '</div>'
      +   (diagnostico ? '<div class="asf-diag">' + escapeHtml(diagnostico) + '</div>' : '')
      +   '<div class="asf-note">Uma falha de serviço nunca é apresentada como “sem seguro”</div>'
      +   '<div class="asf-actions"><button type="button" class="aux-btn" onclick="verificarSeguro()">Abrir consulta oficial ASF</button></div>'
      + '</div>';
  }

  // ---- Orquestração ASF ----
  // O controlo de cadência pertence agora ao nível do pedido físico, para que
  // POST e eventual GET de fallback contem e respeitem os mesmos limites.
  async function processarConsultaSeguroComCadencia(matLimpa, matDisplay, queryId) {
    mostrarSeguroLoading(matDisplay, 'A VERIFICAR...');

    try {
      var consulta = await realizarConsultaASF_IPO(matLimpa, matDisplay, queryId);
      var resultado = consulta.resultado;
      var asfDiagnostic = consulta.asfDiagnostic || null;
      if (resultado.estado === 'sim') {
        renderSeguroEncontrado(resultado.node || {}, matDisplay, queryId, asfDiagnostic);
      } else if (resultado.estado === 'nao') {
        renderSeguroNaoEncontrado(matDisplay, queryId, asfDiagnostic);
      } else {
        throw erroComDiagASF('Resposta ASF sem estado conclusivo', asfDiagnostic);
      }
    } catch (err) {
      var diagnostico = (err && err.message) ? String(err.message) : 'Falha de comunicação com a ASF';
      var asfDiagnostic = (err && err.asfDiagnostic) ? err.asfDiagnostic : null;
      console.warn('[ASF] Falha (' + matLimpa + '):', diagnostico, asfDiagnostic || '');
      mostrarSeguroErro(diagnostico, matDisplay, 'Diagnóstico ASF registado automaticamente.', queryId, asfDiagnostic);
    }
  }

  
var ASF_EM_VOO = Object.create(null);

  /*
   * EXECUÇÃO PARALELA:
   * ASF, inspeção IMT e livrete IMT são canais independentes.
   * Não existe fila entre consultas ASF e não existe espera pelo RNSI.
   * A única proteção local é deduplicar uma chamada idêntica ainda em execução.
   */
async function consultarSeguroASF(matricula) {
    var matDisplay = String(matricula || '').trim().toUpperCase();
    if (!matDisplay) return;

    var matLimpa = sanitizarMatriculaASF(matDisplay);
    if (!matLimpa) return;

    var queryId = window.__VERIX_CURRENT_QUERY_ID || null;
    var dedupeKey = matLimpa + '|' + String(queryId || '');

    if (ASF_EM_VOO[dedupeKey]) return ASF_EM_VOO[dedupeKey];

    ASF_FILA_PENDENTES = (ASF_FILA_PENDENTES || 0) + 1;
    atualizarContadorVisualASF();
    mostrarSeguroLoading(matDisplay, 'A VERIFICAR...');

    var promise = processarConsultaSeguroComCadencia(
      matLimpa,
      matDisplay,
      queryId
    ).finally(function () {
      ASF_FILA_PENDENTES = Math.max(0, (ASF_FILA_PENDENTES || 1) - 1);
      atualizarContadorVisualASF();
    });

    ASF_EM_VOO[dedupeKey] = promise;
    promise.then(function () {
      delete ASF_EM_VOO[dedupeKey];
    }, function () {
      delete ASF_EM_VOO[dedupeKey];
    });

    return promise;
  }

function verificarSeguro() {
 const mat = obterMatriculaOuVazia();
 if (!mat) {
  mostrarToast('Faça primeiro uma consulta de matrícula.');
  return;
 }
 copiarEVisualizar(mat);
 const url = 'https://www.consumidor.asf.com.pt/servi%C3%A7os/verificar-seguro-atrav%C3%A9s-da-matr%C3%ADcula';
 window.open(url, 'ASFPopup', 'width=900,height=700,top=100,left=100,resizable=yes,scrollbars=yes');
}

