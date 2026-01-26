import { initNotification } from './notifications';

const baseUrl = import.meta.env.BASE_URL || '/';

/**
 * Detects when a new service worker is ready and notifies the user about the update.
 * Uses the updatefound event to detect installation and statechange to wait for activation.
 */
async function detectSWUpdate(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;

    registration.addEventListener('updatefound', () => {
      const newSW = registration.installing;
      if (!newSW) return;

      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          // New service worker is installed and waiting for activation
          // This means there's an update available
          notifyUserAboutUpdate();
        }
      });
    });
  } catch (error) {
    console.error('[PWA] Error detecting SW updates:', error);
  }
}

/**
 * Listens for controller changes and updates the UI when a new service worker takes over.
 */
function detectSWActivation(): void {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.info('[PWA] Service worker controller changed - new version is now active');
    // If a live reload is desired, you can reload the page here
    // window.location.reload();
  });
}

/**
 * Notifies the user that an update is available.
 * Uses the DOM to show an update notification.
 */
function notifyUserAboutUpdate(): void {
  // Check if notification already exists to avoid duplicates
  if (document.getElementById('pwa-update-notification')) {
    return;
  }

  const notification = document.createElement('div');
  notification.id = 'pwa-update-notification';
  notification.innerHTML = `
    <div style="position: fixed; bottom: 20px; right: 20px; background: #4CAF50; color: white; padding: 16px; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); z-index: 9999; font-family: system-ui, -apple-system, sans-serif;">
      <p style="margin: 0 0 12px 0; font-weight: 500;">Update available!</p>
      <button id="pwa-update-btn" style="background: white; color: #4CAF50; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 500; margin-right: 8px;">Update</button>
      <button id="pwa-dismiss-btn" style="background: transparent; color: white; border: 1px solid white; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Later</button>
    </div>
  `;

  document.body.appendChild(notification);

  document.getElementById('pwa-update-btn')?.addEventListener('click', () => {
    // Skip waiting tells the service worker to activate immediately
    const registration = navigator.serviceWorker.controller;
    if (registration) {
      navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
    }
    notification.remove();
    // Reload after a short delay to allow the new SW to activate
    setTimeout(() => window.location.reload(), 100);
  });

  document.getElementById('pwa-dismiss-btn')?.addEventListener('click', () => {
    notification.remove();
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl })
    .then((registration) => {
      console.info('Service worker registered, initializing notifications...');

      // Check for updates periodically (every hour)
      setInterval(() => {
        registration.update().catch(err => {
          console.warn('[PWA] Error checking for SW updates:', err);
        });
      }, 60 * 60 * 1000);

      // Initial update check
      registration.update().catch(err => {
        console.warn('[PWA] Error checking for SW updates:', err);
      });

      // Detect when a new SW is ready
      detectSWUpdate();

      // Detect when the SW controller changes
      detectSWActivation();

      initNotification();
    })
    .catch((error) => {
      console.warn(`Error registering service worker:\n${error}.`);
    });
}
