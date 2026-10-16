'use strict';

/*
 * VÉRIX installability worker.
 * Network-only: no cache of HTML, scripts, styles, telemetry, vehicle lookups,
 * or responses from official authorities. The current update model stays authoritative.
 */
self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
