import { initNotification } from "./notifications";

const baseUrl = import.meta.env.BASE_URL || '/';

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).catch(() => {
      // No-op: PWA registration failure should not break the app.
    });
  });
  initNotification()
}