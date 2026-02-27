/**
 * SPA Entry Point — Bootstraps the application.
 *
 * Imports styles, initializes PWA, renders the Layout shell,
 * and starts the hash router.
 */

// ── Styles ─────────────────────────────────────────────────
import '../style.css'; // Tailwind base
import './styles/design-system.css';
import './styles/fonts.css';
import './styles/utilities.css';

// ── PWA ────────────────────────────────────────────────────
import '../pwa';

// ── App ────────────────────────────────────────────────────
import { LayoutComponent } from './components/layout.component';
import { userDropdown } from './components/user-dropdown.component';
import { router } from './router';
import { appState } from './state';

declare global {
  interface Window {
    __bootRevealTimer?: number;
  }
}

let splashDismissed = false;

function tryDismissBootOverlay(): void {
  if (splashDismissed) return;
  splashDismissed = true;
  dismissBootOverlay();
}

function dismissBootOverlay(): void {
  const bootEl = document.getElementById('app-boot');
  const appEl = document.getElementById('app');
  if (!bootEl) return;

  if (typeof window.__bootRevealTimer === 'number') {
    window.clearTimeout(window.__bootRevealTimer);
    window.__bootRevealTimer = undefined;
  }

  if (bootEl.classList.contains('is-exiting') || bootEl.classList.contains('is-hidden')) return;

  appEl?.setAttribute('aria-busy', 'false');

  if (!bootEl.classList.contains('is-visible')) {
    bootEl.classList.add('is-hidden');
    return;
  }

  bootEl.classList.add('is-exiting');
  bootEl.addEventListener('transitionend', () => {
    bootEl.classList.remove('is-visible', 'is-exiting');
    bootEl.classList.add('is-hidden');
  }, { once: true });
  // Fallback: force hide after 400ms even if transitionend doesn't fire
  window.setTimeout(() => {
    bootEl.classList.remove('is-visible', 'is-exiting');
    bootEl.classList.add('is-hidden');
  }, 400);
}

async function bootstrap(): Promise<void> {
  // 0. Normalize legacy hash-based URLs before first render
  if (window.location.hash.startsWith('#/')) {
    window.history.replaceState(null, '', window.location.hash.slice(1));
  }

  // 1. Hydrate auth state from localStorage
  appState.hydrateFromLocalStorage();

  // 2. Render the Layout shell
  const layout = new LayoutComponent();
  const appEl = document.getElementById('app');
  if (!appEl) throw new Error('Bootstrap: #app element not found');

  appEl.innerHTML = layout.render();
  layout.mount();

  // 3. Mount the unified user dropdown (panel + backdrop appended to body)
  userDropdown.mount();

  // 4. Start the router (reads current hash, renders first page)
  router.init();

  // 4b. Remove splash as soon as first route is ready (with tiny minimum display time)
  const onFirstRoute = (): void => {
    appState.off('route-change', onFirstRoute);
    tryDismissBootOverlay();
  };
  appState.on('route-change', onFirstRoute);

  // 4c. Safety: force-dismiss skeleton after 5s even if route-change never fires
  window.setTimeout(() => tryDismissBootOverlay(), 5000);

  // 5. Dev toolbar (conditionally loaded)
  if (__DEV_MODE__) {
    try {
      const { initDevToolbar } = await import('../dev-toolbar');
      initDevToolbar();
    } catch {
      // dev-toolbar might not exist, that's ok
    }
  }
}

bootstrap().catch((error) => {
  console.error('[Bootstrap] Fatal error:', error);
  dismissBootOverlay();

  const appContent = document.getElementById('app-content');
  if (appContent) {
    appContent.innerHTML = `
      <div class="text-center py-20">
        <p class="font-display text-4xl text-(--color-gold) mb-4">ERRORE AVVIO</p>
        <p class="font-body text-(--color-text-secondary)">Ricarica la pagina. Se il problema persiste, svuota la cache del Service Worker.</p>
      </div>
    `;
  }
});
