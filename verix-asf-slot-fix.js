/* VÉRIX — correção crítica ASF: define reservarSlotFisicoASF em falta
 * Carregar ANTES do resto da app (script no <head> ou no topo do body).
 */
(function (w) {
  'use strict';
  if (w.__VERIX_ASF_SLOT_FIX_V1__) return;
  w.__VERIX_ASF_SLOT_FIX_V1__ = true;

  var MIN_INTERVAL_MS = 8000;
  var JANELA_SEG = 63;
  var LIMITE_JANELA = 5;
  var STORAGE_KEY = 'VERIX_ASF_RATE_STATE_V2';
  var times = [];
  var cooldownUntil = 0;

  function now() { return Date.now(); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var obj = JSON.parse(raw);
      var t = now();
      if (obj && Array.isArray(obj.times)) {
        times = obj.times.map(Number).filter(function (x) {
          return Number.isFinite(x) && (t - x) < JANELA_SEG * 1000;
        }).slice(-LIMITE_JANELA);
      }
      if (obj && Number(obj.cooldownUntil) > t) cooldownUntil = Number(obj.cooldownUntil);
    } catch (_) {}
  }

  function save() {
    try {
      var t = now();
      times = times.filter(function (x) {
        return Number.isFinite(x) && (t - x) < JANELA_SEG * 1000;
      }).slice(-LIMITE_JANELA);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        times: times,
        cooldownUntil: Number(cooldownUntil || 0)
      }));
    } catch (_) {}
  }

  function delayMs() {
    load();
    var t = now();
    var atraso = 0;
    if (times.length) {
      var decorrido = t - times[times.length - 1];
      if (decorrido < MIN_INTERVAL_MS) atraso = Math.max(atraso, MIN_INTERVAL_MS - decorrido);
    }
    if (times.length >= LIMITE_JANELA) {
      atraso = Math.max(atraso, (times[0] + JANELA_SEG * 1000) - t + 200);
    }
    if (cooldownUntil > t) atraso = Math.max(atraso, cooldownUntil - t);
    return Math.max(0, Math.ceil(atraso));
  }

  async function reservarSlotFisicoASF(matDisplay) {
    load();
    var atraso = delayMs();
    if (atraso > 0) {
      var seg = Math.ceil(atraso / 1000);
      try {
        if (typeof w.mostrarSeguroLoading === 'function') {
          w.mostrarSeguroLoading(matDisplay || '', 'Aguarde ' + seg + 's · limite ASF (' + LIMITE_JANELA + ' / 60s)');
        }
      } catch (_) {}
      try {
        if (typeof w.atualizarContadorVisualASF === 'function') w.atualizarContadorVisualASF();
      } catch (_) {}
      await wait(atraso);
      load();
    }
    var t = now();
    times.push(t);
    save();
    try {
      if (typeof w.atualizarContadorVisualASF === 'function') w.atualizarContadorVisualASF();
    } catch (_) {}
  }

  w.reservarSlotFisicoASF = reservarSlotFisicoASF;
  console.info('[VÉRIX] reservarSlotFisicoASF (fix) disponível');
})(window);
