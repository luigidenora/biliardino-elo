import { initNotification } from './notifications';

const baseUrl = import.meta.env.BASE_URL || '/';

navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl })
  .then((registration) => {

    updateSWVersionInFooter();

    initNotification();
  })
  .catch((error) => {
    console.warn(`Error registering service worker:\n${error}.`);
  });




/**
 * Requests the current SW version and updates the footer.
 */
async function updateSWVersionInFooter(): Promise<void> {
  try {
    const versionElement = document.getElementById('pwa-version');
    if (!versionElement) return;

    const controller = navigator.serviceWorker.controller;
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
