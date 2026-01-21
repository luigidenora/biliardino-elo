import { initNotification } from "./notifications";

window.addEventListener("DOMContentLoaded", async () => {
  registerServiceWorker();
  initNotification();
});

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(`/sw.js`)
      .then((reg) => console.log("Service worker registrato", reg.scope))
      .catch((err) => console.error("Service worker fallito:", err));
  }
}