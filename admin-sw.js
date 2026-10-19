'use strict';

/*
 * Dedicated freshness worker for the VÉRIX Admin installed app.
 * It has a deliberately narrow scope and does not cache operational pages,
 * ASF/IMT requests, or telemetry responses.
 */
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(fetch(request, { cache: 'no-store' }));
});
