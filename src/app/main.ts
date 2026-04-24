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
import '@/services/match.service';
import { initDataSync } from '@/services/data-sync.service';
import { reloadMatchesAndRecompute } from '@/services/match.service';
import { reloadPlayers } from '@/services/player.service';
import { LayoutComponent } from './components/layout.component';
import { pullToRefresh } from './components/pull-to-refresh.component';
import { userDropdown } from './components/user-dropdown.component';
import { initParticlesSystem } from './particles/particles-manager';
import { router } from './router';
import { appState } from './state';
import { trace } from './utils/trace';

declare global {
  interface Window {
    __bootRevealTimer?: number;
  }
}

function isInsidePWA(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function initPWAExperience(): void {
  if (!isInsidePWA()) return;

  // Add PWA class to body for PWA-specific styling
  document.body.classList.add('pwa');

  // Prevent default context menu for immersive experience
  document.addEventListener('contextmenu', (e) => {
    if (e.shiftKey) return; // Allow context menu with shift key

    const target = e.target as HTMLElement;
    // Allow context menu on interactive elements
    if (target.matches('a, img, video, audio, textarea:not([disabled]), input[type="text"]:not([disabled])')) {
      return;
    }

    // Allow context menu on selected text
    const selection = window.getSelection();
    if (selection?.toString().length ?? 0 > 0) return;

    e.preventDefault();
  });
}

function dismissBootOverlay(): void {
  const bootEl = document.getElementById('app-boot');
  if (!bootEl) return;
  else
    bootEl.remove();
}

async function bootstrap(): Promise<void> {
  trace('Bootstrap', 'start', { href: window.location.href });

  // 0a. Initialize PWA-specific experience
  initPWAExperience();
  trace('Bootstrap', 'PWA experience initialized');

  // 0. Normalize legacy hash-based URLs before first render
  if (window.location.hash.startsWith('#/')) {
    window.history.replaceState(null, '', window.location.hash.slice(1));
    trace('Bootstrap', 'normalized hash URL', { newPath: window.location.pathname });
  }

  // 1. Hydrate auth state from localStorage
  appState.hydrateFromLocalStorage();
  trace('Bootstrap', 'hydrateFromLocalStorage done', {
    playerId: appState.currentPlayerId,
    isAdmin: appState.isAdmin,
    isAuthenticated: appState.isAuthenticated
  });

  // 1b. Initialize particles system
  initParticlesSystem();
  trace('Bootstrap', 'particles initialized');

  // 2. Render the Layout shell
  const layout = new LayoutComponent();
  const appEl = document.getElementById('app');
  if (!appEl) throw new Error('Bootstrap: #app element not found');
  // const appEl = document.body;
  // if (!appEl) throw new Error('Bootstrap: <body> element not found');

  appEl.innerHTML = layout.render();
  trace('Bootstrap', 'layout rendered');
  layout.mount();
  trace('Bootstrap', 'layout mounted');

  // 3. Mount the unified user dropdown (panel + backdrop appended to body)
  userDropdown.mount();
  trace('Bootstrap', 'userDropdown mounted');

  pullToRefresh.mount();
  trace('Bootstrap', 'pullToRefresh mounted');

  // 3b. Initialize real-time data sync (Supabase Realtime)
  initDataSync({
    onPlayersChanged: reloadPlayers,
    onMatchesChanged: reloadMatchesAndRecompute
  });
  trace('Bootstrap', 'data sync (Realtime) initialized');

  // 4. Wait for players and matches to be loaded before routing
  trace('Bootstrap', 'waiting for data (players + matches)');
  trace('Bootstrap', 'data ready — starting router');

  // 5. Start the router (reads current hash, renders first page)
  trace('Bootstrap', 'calling router.init()');
  router.init();
  trace('Bootstrap', 'router.init() returned (async navigation in flight)');

  // 4b. Remove splash as soon as first route is ready (with tiny minimum display time)
  const onFirstRoute = (): void => {
    trace('Bootstrap', 'first route-change received → dismissing splash');
    appState.off('route-change', onFirstRoute);
    dismissBootOverlay();
  };
  appState.on('route-change', onFirstRoute);
  trace('Bootstrap', 'registered route-change listener for splash dismiss');

  // 4c. Safety: force-dismiss skeleton after 5s even if route-change never fires
  window.setTimeout(() => {
    trace('Bootstrap', '5s safety timeout fired → force-dismissing splash');
    dismissBootOverlay();
  }, 5000);
  trace('Bootstrap', 'bootstrap() finished synchronously — waiting for router');
}

bootstrap().catch((error) => {
  console.error('[Bootstrap] Fatal error:', error);
  trace('Bootstrap', 'FATAL ERROR in bootstrap()', { error: String(error) });
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
