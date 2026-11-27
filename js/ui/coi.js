/*
 * Open Chess Engine - coi.js
 * SPDX-License-Identifier: MIT
 *
 * Multi-threaded search needs SharedArrayBuffer, which browsers only allow on "cross-origin isolated" pages
 * (headers COOP/COEP). Static hosts such as GitHub Pages cannot send those headers, so this script registers a tiny
 * service worker (coi-sw.js) that adds them, then reloads the page once. It does nothing on file:// or when the
 * page is already isolated; in that case live analysis simply uses one thread.
 */
(function () {
  'use strict';
  if (globalThis.crossOriginIsolated !== false || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  let tried = false;
  try { tried = sessionStorage.getItem('oce-coi') === '1'; } catch (e) { /* ignore */ }
  if (tried) return; // reloaded once already - do not loop if the headers did not take effect
  const reloadOnce = () => {
    try { sessionStorage.setItem('oce-coi', '1'); } catch (e) { /* ignore */ }
    location.reload();
  };
  navigator.serviceWorker.register('coi-sw.js').then((reg) => {
    if (reg.active && !navigator.serviceWorker.controller) { reloadOnce(); return; }
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'activated') reloadOnce(); });
    });
  }).catch(() => { /* unsupported: stay single-threaded */ });
})();
