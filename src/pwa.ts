import { initNotification } from './notifications';

const baseUrl = import.meta.env.BASE_URL || '/';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).then(() => {
    console.info('Service worker registered, initializing notifications...');
    initNotification();
  }).catch((error) => {
    console.warn(`Error registering service worker:\n${error}.`);
  });
}
