/* VÉRIX live presence — anonymous installation-level presence.
   This client uses only the project's publishable Supabase key.
   It deliberately sends no registration number, name, or other personal content. */
(function () {
  'use strict';

  var PROJECT_URL = 'https://onilkakbgpklxvxuxmks.supabase.co';
  var PUBLISHABLE_KEY = 'sb_publishable_Rr9MItsNEhKPE-aSO3jI-Q_HYUXj-yU';
  var SDK_URL = 'https://esm.sh/@supabase/supabase-js@2.118.0?bundle';
  var TOPIC = 'verix-live-presence-v1';
  var ACTIVE_WINDOW_MS = 5 * 60 * 1000;
  var TRACK_INTERVAL_MS = 60 * 1000;
  var ADMIN_RECALCULATE_MS = 30 * 1000;

  var allowedHosts = {
    'verix-plataformadigital.github.io': true,
    'localhost': true,
    '127.0.0.1': true,
    '[::1]': true
  };
  if (!allowedHosts[String(window.location.hostname || '').toLowerCase()]) return;

  var adminRoot = document.getElementById('app');
  var isAdminPage = !!(document.getElementById('loginScreen') && adminRoot);
  var supabaseClient = null;
  var liveChannel = null;
  var channelConnected = false;
  var adminStarting = false;
  var adminObserver = null;
  var adminPulse = null;
  var adminPresencePayload = null;
  var lastTrackAt = 0;
  var lastActivityAt = document.visibilityState === 'visible' ? Date.now() : 0;
  var activeInstallId = '';
  var sessionId = '';
  var tabId = '';

  function uuid(prefix) {
    var suffix;
    try {
      suffix = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    } catch (_) {
      suffix = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    }
    return prefix + '-' + suffix;
  }

  function storageId(storage, key, prefix) {
    try {
      var existing = storage && storage.getItem(key);
      if (existing) return String(existing).slice(0, 120);
    } catch (_) {}
    var value = uuid(prefix);
    try { if (storage) storage.setItem(key, value); } catch (_) {}
    return value.slice(0, 120);
  }

  function readApplicationIdentity() {
    var localStore = null;
    var sessionStore = null;
    try { localStore = window.localStorage; } catch (_) {}
    try { sessionStore = window.sessionStorage; } catch (_) {}
    activeInstallId = storageId(localStore, 'VERIX_T2_INSTALL_ID', 'i');
    sessionId = storageId(sessionStore, 'VERIX_T2_SESSION_ID', 's');
    tabId = storageId(sessionStore, 'VERIX_T2_TAB_ID', 't');
  }

  function activityPayload(role, keyId, session, tab, visible, activeAt) {
    return {
      role: role,
      installationId: keyId,
      sessionId: session || null,
      tabId: tab || null,
      visible: visible === true,
      lastActivityAt: Number(activeAt) || 0,
      appVersion: '1.5',
      trackedAt: Date.now()
    };
  }

  function emitAdminSnapshot(snapshot) {
    var previous = window.VERIX_LIVE_PRESENCE;
    var changed = !previous
      || previous.connected !== snapshot.connected
      || previous.onlineInstallations !== snapshot.onlineInstallations
      || previous.activeInstallations !== snapshot.activeInstallations;
    window.VERIX_LIVE_PRESENCE = snapshot;
    if (changed) {
      try {
        window.dispatchEvent(new CustomEvent('verix-presence-update', { detail: snapshot }));
      } catch (_) {}
    }
  }

  function disconnectAdminSnapshot() {
    emitAdminSnapshot({
      connected: false,
      onlineInstallations: null,
      activeInstallations: null,
      observedAt: new Date().toISOString(),
      source: 'supabase-realtime',
      status: 'disconnected'
    });
  }

  function allPresenceMetas(state) {
    var items = [];
    if (!state || typeof state !== 'object') return items;
    Object.keys(state).forEach(function (key) {
      var value = state[key];
      (Array.isArray(value) ? value : [value]).forEach(function (entry) {
        if (!entry || typeof entry !== 'object') return;
        var payload = entry.payload && typeof entry.payload === 'object'
          ? Object.assign({}, entry.payload, entry)
          : entry;
        items.push({ key: key, payload: payload });
      });
    });
    return items;
  }

  function recomputeAdminPresence() {
    if (!isAdminPage || !channelConnected || !liveChannel) {
      disconnectAdminSnapshot();
      return;
    }

    var installations = new Map();
    allPresenceMetas(liveChannel.presenceState()).forEach(function (item) {
      var p = item.payload || {};
      if (p.role !== 'app') return;

      var id = String(p.installationId || item.key || '').trim();
      if (!id || id.length > 160) return;
      var current = installations.get(id);
      if (!current) {
        current = { active: false };
        installations.set(id, current);
      }

      var activeAt = Number(p.lastActivityAt) || 0;
      if (p.visible === true && activeAt > 0 && Date.now() - activeAt >= 0 && Date.now() - activeAt <= ACTIVE_WINDOW_MS) {
        current.active = true;
      }
    });

    var active = 0;
    installations.forEach(function (value) {
      if (value.active) active++;
    });

    emitAdminSnapshot({
      connected: true,
      onlineInstallations: installations.size,
      activeInstallations: active,
      observedAt: new Date().toISOString(),
      source: 'supabase-realtime',
      status: 'connected'
    });
  }

  function appPresencePayload() {
    return activityPayload(
      'app',
      activeInstallId,
      sessionId,
      tabId,
      document.visibilityState === 'visible',
      lastActivityAt
    );
  }

  function adminPresencePayloadNow() {
    return adminPresencePayload;
  }

  function trackAppPresence(force) {
    if (!liveChannel || !channelConnected || isAdminPage) return;
    var now = Date.now();
    if (!force && now - lastTrackAt < TRACK_INTERVAL_MS) return;
    lastTrackAt = now;
    try {
      Promise.resolve(liveChannel.track(appPresencePayload())).catch(function () {});
    } catch (_) {}
  }

  function makeAdminPresencePayload() {
    return activityPayload(
      'admin',
      uuid('admin'),
      uuid('as'),
      uuid('at'),
      document.visibilityState === 'visible',
      Date.now()
    );
  }

  async function makeSupabaseClient() {
    var sdk = await import(SDK_URL);
    return sdk.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      realtime: {
        params: { eventsPerSecond: 5 }
      }
    });
  }

  async function startAppPresence() {
    if (liveChannel || supabaseClient) return;
    readApplicationIdentity();
    try {
      supabaseClient = await makeSupabaseClient();
      liveChannel = supabaseClient.channel(TOPIC, {
        config: {
          private: false,
          presence: { key: activeInstallId }
        }
      });
      liveChannel.on('presence', { event: 'sync' }, function () {});
      liveChannel.subscribe(async function (status) {
        if (status === 'SUBSCRIBED') {
          channelConnected = true;
          await trackAppPresence(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelConnected = false;
        }
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') lastActivityAt = Date.now();
        trackAppPresence(true);
      });
      window.addEventListener('focus', function () {
        if (document.visibilityState === 'visible') {
          lastActivityAt = Date.now();
          trackAppPresence(true);
        }
      });
      window.addEventListener('pagehide', function () {
        try {
          if (liveChannel && channelConnected) Promise.resolve(liveChannel.untrack()).catch(function () {});
        } catch (_) {}
      });
      ['pointerdown', 'keydown', 'touchstart', 'wheel', 'input', 'change', 'click'].forEach(function (eventName) {
        document.addEventListener(eventName, function () {
          if (document.visibilityState !== 'visible') return;
          lastActivityAt = Date.now();
          trackAppPresence(false);
        }, { passive: true, capture: true });
      });
    } catch (_) {
      channelConnected = false;
    }
  }

  async function startAdminPresence() {
    if (adminStarting || liveChannel) return;
    adminStarting = true;
    try {
      if (!supabaseClient) supabaseClient = await makeSupabaseClient();
      adminPresencePayload = makeAdminPresencePayload();
      liveChannel = supabaseClient.channel(TOPIC, {
        config: {
          private: false,
          presence: { key: adminPresencePayload.installationId }
        }
      });
      liveChannel.on('presence', { event: 'sync' }, recomputeAdminPresence);
      liveChannel.subscribe(async function (status) {
        if (status === 'SUBSCRIBED') {
          channelConnected = true;
          try { await liveChannel.track(adminPresencePayloadNow()); } catch (_) {}
          recomputeAdminPresence();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelConnected = false;
          disconnectAdminSnapshot();
        }
      });
      adminPulse = window.setInterval(recomputeAdminPresence, ADMIN_RECALCULATE_MS);
    } catch (_) {
      channelConnected = false;
      disconnectAdminSnapshot();
    } finally {
      adminStarting = false;
    }
  }

  async function stopAdminPresence() {
    if (!isAdminPage || !liveChannel) return;
    var oldChannel = liveChannel;
    liveChannel = null;
    channelConnected = false;
    if (adminPulse) window.clearInterval(adminPulse);
    adminPulse = null;
    disconnectAdminSnapshot();
    try {
      if (supabaseClient) await supabaseClient.removeChannel(oldChannel);
    } catch (_) {}
  }

  if (isAdminPage) {
    window.VERIX_LIVE_PRESENCE = {
      connected: false,
      onlineInstallations: null,
      activeInstallations: null,
      observedAt: null,
      source: 'supabase-realtime',
      status: 'connecting'
    };
    var observeAdminVisibility = function () {
      if (!adminRoot) return;
      if (!adminRoot.hidden) startAdminPresence();
      else if (liveChannel && !adminStarting) stopAdminPresence();
    };
    if (window.MutationObserver) {
      adminObserver = new MutationObserver(observeAdminVisibility);
      adminObserver.observe(adminRoot, { attributes: true, attributeFilter: ['hidden'] });
    }
    observeAdminVisibility();
  } else {
    startAppPresence();
  }
})();