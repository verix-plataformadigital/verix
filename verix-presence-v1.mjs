import { createClient } from '@supabase/supabase-js';

(function () {
  'use strict';

  var SUPABASE_URL = 'https://onilkakbgpklxvxuxmks.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Rr9MItsNEhKPE-aSO3jI-Q_HYUXj-yU';
  var TOPIC = 'verix-live-presence-v1';
  var ACTIVE_WINDOW_MS = 120000;
  var TRACK_MIN_INTERVAL_MS = 30000;
  var URGENT_TRACK_MIN_INTERVAL_MS = 2500;
  var ADMIN = /(?:^|\/)admin_v2\.html$/i.test(String(window.location.pathname || ''));

  var snapshot = {
    status: ADMIN ? 'locked' : 'connecting',
    ready: false,
    onlineInstallations: null,
    activeInstallations: null,
    onlineTabs: null,
    activeTabs: null,
    observedAt: null,
    error: null
  };
  var listeners = [];
  var client = null;
  var channel = null;
  var subscribed = false;
  var started = false;
  var starting = false;
  var activeRefreshTimer = null;
  var reconnectTimer = null;
  var pendingTrackTimer = null;
  var reconnectDelayMs = 0;
  var lastTrackAt = 0;
  var lastUrgentTrackAt = 0;
  var lastActivityAt = 0;
  var visible = document.visibilityState !== 'hidden';
  var installationKey = null;
  var tabConnectionKey = null;

  function copySnapshot() {
    return Object.assign({}, snapshot);
  }

  function emit(next) {
    snapshot = Object.assign({}, snapshot, next || {});
    var current = copySnapshot();
    listeners.slice().forEach(function (fn) {
      try { fn(current); } catch (_) {}
    });
    try {
      window.dispatchEvent(new CustomEvent('verix-live-presence', { detail: current }));
    } catch (_) {}
  }

  window.VERIX_LIVE_PRESENCE = Object.freeze({
    snapshot: copySnapshot,
    subscribe: function (listener) {
      if (typeof listener !== 'function') return function () {};
      listeners.push(listener);
      try { listener(copySnapshot()); } catch (_) {}
      return function () {
        listeners = listeners.filter(function (fn) { return fn !== listener; });
      };
    }
  });

  function uuid() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (_) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' +
      Math.random().toString(36).slice(2);
  }

  function persistentInstallationId() {
    try {
      var value = window.localStorage.getItem('VERIX_T2_INSTALL_ID');
      if (value) return String(value).slice(0, 120);
      value = 'i-' + uuid();
      window.localStorage.setItem('VERIX_T2_INSTALL_ID', value);
      return value;
    } catch (_) {
      return 'ephemeral-' + uuid();
    }
  }

  async function hashInstallationId(value) {
    try {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        var digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return Array.from(new Uint8Array(digest)).slice(0, 16).map(function (n) {
          return n.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (_) {}
    // The opaque local identifier is a fallback only for browsers without Web Crypto.
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || uuid();
  }

  function isAdminUnlocked() {
    var app = document.getElementById('app');
    return !!app && !app.hidden;
  }

  function currentPayload() {
    return {
      kind: 'verix-presence-v1',
      installationKey: installationKey,
      visible: visible,
      lastActivityAt: lastActivityAt || null,
      reportedAt: Date.now()
    };
  }

  async function track(forceNow) {
    if (ADMIN || !channel || !subscribed || !installationKey) return;
    var trackedChannel = channel;

    if (forceNow && pendingTrackTimer !== null) {
      window.clearTimeout(pendingTrackTimer);
      pendingTrackTimer = null;
    }
    var now = Date.now();
    var elapsed = now - lastTrackAt;
    if (!forceNow && lastTrackAt && elapsed < TRACK_MIN_INTERVAL_MS) {
      // Coalesce any number of activity/focus events into one update after the cooldown.
      if (pendingTrackTimer === null) {
        pendingTrackTimer = window.setTimeout(function () {
          pendingTrackTimer = null;
          track();
        }, Math.max(250, TRACK_MIN_INTERVAL_MS - elapsed + 100));
      }
      return;
    }

    lastTrackAt = now;
    try {
      var result = await trackedChannel.track(currentPayload());
      if (trackedChannel !== channel) return;
      if (result !== 'ok') {
        subscribed = false;
        started = false;
        emit({
          status: 'reconnecting',
          ready: false,
          onlineInstallations: null,
          activeInstallations: null,
          onlineTabs: null,
          activeTabs: null,
          observedAt: null,
          error: 'presence_track_' + String(result || 'unknown')
        });
        scheduleReconnect(32000);
      }
    } catch (error) {
      if (trackedChannel !== channel) return;
      subscribed = false;
      started = false;
      emit({
        status: 'reconnecting',
        ready: false,
        onlineInstallations: null,
        activeInstallations: null,
        onlineTabs: null,
        activeTabs: null,
        observedAt: null,
        error: String(error && error.message || error)
      });
      scheduleReconnect(32000);
    }
  }

  function extractMetas(entry) {
    if (Array.isArray(entry)) return entry;
    if (entry && Array.isArray(entry.metas)) return entry.metas;
    return entry ? [entry] : [];
  }

  function recalculatePresence() {
    if (ADMIN && !isAdminUnlocked()) return;
    if (!channel || !subscribed) return;

    var state;
    try { state = channel.presenceState() || {}; }
    catch (_) { return; }

    var installs = new Map();
    var tabs = 0;
    var activeTabs = 0;
    var now = Date.now();

    Object.keys(state).forEach(function (presenceKey) {
      extractMetas(state[presenceKey]).forEach(function (meta) {
        var value = meta && meta.payload ? meta.payload : meta;
        if (!value || value.kind !== 'verix-presence-v1' || !value.installationKey) return;

        tabs += 1;
        var key = String(value.installationKey);
        var existing = installs.get(key) || { active: false };
        var activityAt = Number(value.lastActivityAt || 0);
        var age = now - activityAt;
        var isActive = value.visible === true && activityAt > 0 && age >= -30000 && age <= ACTIVE_WINDOW_MS;
        if (isActive) {
          existing.active = true;
          activeTabs += 1;
        }
        installs.set(key, existing);
      });
    });

    var activeInstalls = 0;
    installs.forEach(function (entry) { if (entry.active) activeInstalls += 1; });

    emit({
      status: 'connected',
      ready: true,
      onlineInstallations: installs.size,
      activeInstallations: activeInstalls,
      onlineTabs: tabs,
      activeTabs: activeTabs,
      observedAt: new Date().toISOString(),
      error: null
    });
  }

  async function start() {
    if (starting || started) return;
    starting = true;
    emit({
      status: 'connecting',
      ready: false,
      onlineInstallations: null,
      activeInstallations: null,
      onlineTabs: null,
      activeTabs: null,
      observedAt: null,
      error: null
    });

    try {
      if (ADMIN && !isAdminUnlocked()) {
        starting = false;
        emit({
          status: 'locked', ready: false,
          onlineInstallations: null, activeInstallations: null,
          onlineTabs: null, activeTabs: null, observedAt: null
        });
        return;
      }

      if (!client) {
        client = createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          },
          realtime: {
            params: { eventsPerSecond: 10 }
          }
        });
      }

      if (!ADMIN) {
        installationKey = await hashInstallationId(persistentInstallationId());
        tabConnectionKey = installationKey + '-' + uuid();
      }

      channel = client.channel(TOPIC, {
        config: { presence: { key: ADMIN ? 'admin-monitor-' + uuid() : tabConnectionKey } }
      });

      if (ADMIN) {
        channel
          .on('presence', { event: 'sync' }, recalculatePresence)
          .on('presence', { event: 'join' }, recalculatePresence)
          .on('presence', { event: 'leave' }, recalculatePresence);
      }

      channel.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          started = true;
          starting = false;
          subscribed = true;
          emit({ status: 'connected', error: null });
          if (ADMIN) {
            recalculatePresence();
            if (activeRefreshTimer) clearInterval(activeRefreshTimer);
            activeRefreshTimer = setInterval(recalculatePresence, 15000);
          } else {
            track();
          }
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false;
          started = false;
          starting = false;
          emit({
            status: 'reconnecting',
            ready: false,
            onlineInstallations: null,
            activeInstallations: null,
            onlineTabs: null,
            activeTabs: null,
            observedAt: null,
            error: String(status)
          });
          scheduleReconnect();
        }
      });
    } catch (error) {
      starting = false;
      started = false;
      subscribed = false;
      emit({
        status: 'unavailable',
        ready: false,
        onlineInstallations: null,
        activeInstallations: null,
        onlineTabs: null,
        activeTabs: null,
        observedAt: null,
        error: String(error && error.message || error)
      });
    }
  }

  function scheduleReconnect(delayMs) {
    var requestedDelay = Math.max(0, Number(delayMs) || 4000);
    // If a rate-limit response arrives after CHANNEL_ERROR, keep the longer cooldown.
    if (reconnectTimer !== null) {
      if (requestedDelay <= reconnectDelayMs) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectDelayMs = requestedDelay;
    reconnectTimer = window.setTimeout(async function () {
      reconnectTimer = null;
      reconnectDelayMs = 0;
      if (document.visibilityState === 'hidden') return;
      if (ADMIN && !isAdminUnlocked()) return;
      if (starting || started) return;
      var previousChannel = channel;
      channel = null;
      subscribed = false;
      if (client && previousChannel) {
        try { await client.removeChannel(previousChannel); } catch (_) {}
      }
      start();
    }, requestedDelay);
  }

  async function stopAdminMonitor() {
    if (!ADMIN || !channel || !client) {
      if (ADMIN && !isAdminUnlocked()) {
        emit({
          status: 'locked', ready: false,
          onlineInstallations: null, activeInstallations: null,
          onlineTabs: null, activeTabs: null, observedAt: null, error: null
        });
      }
      return;
    }
    subscribed = false;
    started = false;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (activeRefreshTimer) {
      clearInterval(activeRefreshTimer);
      activeRefreshTimer = null;
    }
    var oldChannel = channel;
    channel = null;
    try { await client.removeChannel(oldChannel); } catch (_) {}
    emit({
      status: 'locked',
      ready: false,
      onlineInstallations: null,
      activeInstallations: null,
      onlineTabs: null,
      activeTabs: null,
      observedAt: null,
      error: null
    });
  }

  function monitorAdminAuth() {
    if (!ADMIN) return;
    var app = document.getElementById('app');
    if (!app) return;
    var check = function () {
      if (isAdminUnlocked()) start();
      else stopAdminMonitor();
    };
    var observer = new MutationObserver(check);
    observer.observe(app, { attributes: true, attributeFilter: ['hidden'] });
    check();
  }

  function noteActivity(event) {
    if (ADMIN || document.visibilityState === 'hidden') return;
    var now = Date.now();
    lastActivityAt = now;
    var urgent = event && (event.type === 'click' || event.type === 'submit');
    if (urgent) {
      // pointerdown may already have sent the payload for this exact gesture.
      if (lastTrackAt && now - lastTrackAt < 1200) return;
      if (!lastUrgentTrackAt || now - lastUrgentTrackAt >= URGENT_TRACK_MIN_INTERVAL_MS) {
        lastUrgentTrackAt = now;
        track(true);
        return;
      }
    }
    track();
  }

  document.addEventListener('visibilitychange', function () {
    visible = document.visibilityState !== 'hidden';
    if (ADMIN) return;
    if (visible && !started && !starting) start();
    else track();
  });

  ['pointerdown', 'keydown', 'input', 'change', 'submit', 'touchstart', 'wheel', 'focusin', 'click'].forEach(function (eventName) {
    document.addEventListener(eventName, noteActivity, { capture: true, passive: true });
  });

  window.addEventListener('pagehide', function () {
    subscribed = false;
    started = false;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectDelayMs = 0;
    }
    if (pendingTrackTimer !== null) {
      clearTimeout(pendingTrackTimer);
      pendingTrackTimer = null;
    }
    if (activeRefreshTimer) {
      clearInterval(activeRefreshTimer);
      activeRefreshTimer = null;
    }
    if (client && channel) {
      var oldChannel = channel;
      channel = null;
      try { client.removeChannel(oldChannel); } catch (_) {}
    }
  });
  window.addEventListener('pageshow', function () {
    if (ADMIN) {
      if (isAdminUnlocked() && !started && !starting) start();
      return;
    }
    if (!started && !starting) start();
    else if (visible) track();
  });

  if (ADMIN) {
    monitorAdminAuth();
  } else {
    start();
  }
})();