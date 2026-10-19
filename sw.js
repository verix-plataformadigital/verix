'use strict';

/*
 * VÉRIX freshness worker.
 * No Cache Storage is used. It only forces fresh network requests for page
 * navigations and the deployment manifest. Other requests (including external
 * insurance/IMT services and telemetry) keep their original browser behavior.
 */
self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';
  const isReleaseManifest = url.pathname.endsWith('/version.json');
  const isAdminManifest = url.pathname.endsWith('/admin.webmanifest');
  if (!isNavigation && !isReleaseManifest && !isAdminManifest) return;

  event.respondWith(fetch(request, { cache: 'no-store' }));
});
