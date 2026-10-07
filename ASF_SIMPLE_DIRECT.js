/* VÉRIX ASF — modo simples/directo
   1 matrícula = 1 POST directo ao endpoint ASF.
   Sem retries, sem fallback, sem fila, sem espera/cadência.
   A interpretação usa o parser ASF já validado da aplicação.
*/
(function () {
  'use strict';

  var ASF_DIRECT_URL = 'https://ext01.asf.com.pt/api/src/?query=';
  var ASF_DIRECT_TIMEOUT = 15000;
  var ASF_DIRECT_BUSY = false;

  function agora() { return Date.now(); }

  function plateDisplay(v) {
    return String(v || '').trim().toUpperCase();
  }

  function plateClean(v) {
    return plateDisplay(v).replace(/[^A-Z0-9]/g, '');
  }

  function queryASF(plate) {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var data = yyyy + '/' + mm + '/' + dd;
    return 'mutation license { mobishoutEntry { noone { entry { licenseNumber(license: "' +
      plate + '", date: "' + data +
      '") { nodes { id entity startDate endDate policy license code logo } } } } } }';
  }

  function mostrarErroDireto(matricula, mensagem) {
    try {
      if (typeof mostrarSeguroErro === 'function') {
        mostrarSeguroErro(
          mensagem || 'Não foi possível obter uma resposta válida da ASF.',
          matricula,
          '',
          window.__VERIX_CURRENT_QUERY_ID || null,
          null
        );
        return;
      }
    } catch (_) {}

    var box = document.getElementById('seguroResult');
    if (box) {
      box.textContent = 'CONSULTA ASF INDISPONÍVEL — ' + String(mensagem || '');
    }
  }

  async function consultarSeguroASFDirect(matricula) {
    var display = plateDisplay(matricula);
    var clean = plateClean(matricula);
    if (!clean || ASF_DIRECT_BUSY) return;

    ASF_DIRECT_BUSY = true;

    try {
      if (typeof mostrarSeguroLoading === 'function') {
        mostrarSeguroLoading(display, 'A CONSULTAR ASF…');
      }

      var url = ASF_DIRECT_URL + encodeURIComponent(queryASF(clean));
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;

      if (controller) {
        timer = setTimeout(function () {
          try { controller.abort(); } catch (_) {}
        }, ASF_DIRECT_TIMEOUT);
      }

      var options = {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
        headers: { 'Accept': 'application/json, text/plain, */*' }
      };
      if (controller) options.signal = controller.signal;

      try {
        var response = await fetch(url, options);
        var textBody = await response.text();
        if (timer) clearTimeout(timer);

        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }

        var json;
        try {
          json = JSON.parse(textBody);
        } catch (_) {
          throw new Error('Resposta ASF não é JSON válido');
        }

        var resultado;
        if (typeof interpretarRespostaASF === 'function') {
          resultado = interpretarRespostaASF(json);
        } else {
          throw new Error('Interpretador ASF indisponível');
        }

        if (resultado && resultado.estado === 'sim') {
          if (typeof renderSeguroEncontrado === 'function') {
            renderSeguroEncontrado(resultado.node || {}, display, window.__VERIX_CURRENT_QUERY_ID || null, null);
          }
        } else if (resultado && resultado.estado === 'nao') {
          if (typeof renderSeguroNaoEncontrado === 'function') {
            renderSeguroNaoEncontrado(display, window.__VERIX_CURRENT_QUERY_ID || null, null);
          }
        } else {
          throw new Error('Resposta ASF sem estado conclusivo');
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (e) {
      mostrarErroDireto(display, e && e.message ? e.message : 'Falha na consulta ASF');
    } finally {
      ASF_DIRECT_BUSY = false;
    }
  }

  window.consultarSeguroASF = consultarSeguroASFDirect;

  /* O modo directo não utiliza o contador/rate-limit visual antigo. */
  var css = document.createElement('style');
  css.id = 'verix-asf-direct-style';
  css.textContent = '#asfRateWidget{display:none!important;}';
  (document.head || document.documentElement).appendChild(css);
})();
