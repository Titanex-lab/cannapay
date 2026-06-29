'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let refreshing = false;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[PWA] Service worker registered:', reg.scope);

      // If a new SW is waiting, tell it to activate immediately
      if (reg.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
      }

      // When a new SW is found (installing), force it to take over
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] New service worker available — activating...');
            newWorker.postMessage('SKIP_WAITING');
          }
        });
      });
    });

    // When the new SW takes over, reload the page to get fresh assets
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[PWA] New controller activated — reloading page');
      window.location.reload();
    });
  }, []);

  return null;
}
