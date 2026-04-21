import { refreshIcons } from './app/icons';

declare const __SW_VERSION__: string;

const baseUrl = import.meta.env.BASE_URL || '/';

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('pwa-version');
  if (el) el.textContent = __SW_VERSION__;
  initOfflineBanner();
});

function initOfflineBanner(): void {
  const show = (): void => {
    document.body.classList.add('is-offline');
    refreshIcons();
  };
  const hide = (): void => {
    document.body.classList.remove('is-offline');
  };

  window.addEventListener('offline', show);
  window.addEventListener('online', hide);
  if (!navigator.onLine) show();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl })
    .then(async () => {
      await navigator.serviceWorker.ready;
      updateSWVersionInFooter();
      window.dispatchEvent(new CustomEvent('pwa:sw-ready'));
    })
    .catch((error) => {
      console.warn(`Error registering service worker:\n${error}.`);
      window.dispatchEvent(new CustomEvent('pwa:sw-error'));
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    updateSWVersionInFooter();
    window.dispatchEvent(new CustomEvent('pwa:sw-ready'));
  });
} else {
  window.dispatchEvent(new CustomEvent('pwa:sw-unsupported'));
}

/**
 * Requests the current SW version and updates the footer.
 */
async function updateSWVersionInFooter(): Promise<void> {
  try {
    const versionElement = document.getElementById('pwa-version');
    if (!versionElement) return;

    const registration = await navigator.serviceWorker.ready;
    const controller = navigator.serviceWorker.controller || registration.active;
    if (!controller) {
      versionElement.textContent = 'offline';
      return;
    }

    // Create a message channel to communicate with the SW
    const channel = new MessageChannel();

    // Listen for the version response
    channel.port1.onmessage = (event) => {
      if (event.data.type === 'SW_VERSION') {
        versionElement.textContent = event.data.version;
      }
    };

    // Send request to SW with the port for response
    controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  } catch (error) {
    console.error('[PWA] Error updating SW version:', error);
    const versionElement = document.getElementById('pwa-version');
    if (versionElement) {
      versionElement.textContent = 'error';
    }
  }
}
