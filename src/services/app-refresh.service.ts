import { appState } from '@/app/state';
import { LobbyService } from './lobby.service';
import { loadAllMatches } from './match.service';
import { loadPlayers } from './player.service';

export interface AppRefreshEventPayload {
  path: string;
  source: string;
  error?: string;
}

type RefreshHandler = () => Promise<void> | void;

let activeRefreshHandler: RefreshHandler | null = null;
let refreshInFlight: Promise<void> | null = null;

export function registerAppRefreshHandler(handler: RefreshHandler): () => void {
  activeRefreshHandler = handler;

  return () => {
    if (activeRefreshHandler === handler) {
      activeRefreshHandler = null;
    }
  };
}

export async function refreshCoreData(): Promise<void> {
  await loadPlayers();
  await loadAllMatches();
}

export async function refreshCurrentView(source = 'pull-to-refresh'): Promise<void> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const path = router.getCurrentPath();
  const payload: AppRefreshEventPayload = { path, source };

  refreshInFlight = (async () => {
    appState.emit('app-refresh:start', payload);

    try {
      if (activeRefreshHandler) {
        await activeRefreshHandler();
      } else {
        await fallbackRefresh(path);
      }

      appState.emit('app-refresh:success', payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appState.emit('app-refresh:error', { ...payload, error: message });
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function fallbackRefresh(path: string): Promise<void> {
  // Lobby and matchmaking have their own refresh logic
  if (path === '/lobby' || path === '/matchmaking') {
    await LobbyService.refresh();
    return;
  }

  // For other pages without a registered handler, simply reload the page.
  // The service worker will serve cached assets quickly.
  // Before reloading, load fresh data so it's available when the page reloads.
  if (path === '/' || path === '/stats' || path.startsWith('/profile/')) {
    await refreshCoreData();
    window.location.reload();
  }
}
