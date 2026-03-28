import { appState } from '@/app/state';
import { loadAllMatches } from './match.service';
import { loadPlayers } from './player.service';

export interface AppRefreshEventPayload {
  path: string;
  source: string;
  error?: string;
}

type RefreshHandler = () => Promise<void> | void;

let refreshInFlight: Promise<void> | null = null;

/**
 * Registers a custom refresh handler.
 * Note: This is kept for backward compatibility but is no longer used.
 * Pull-to-refresh always reloads the window.
 */
export function registerAppRefreshHandler(_handler: RefreshHandler): () => void {
  // No-op: we always reload the window now
  return () => {
    // No-op cleanup
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

  const path = window.location.pathname || '/';
  const payload: AppRefreshEventPayload = { path, source };

  refreshInFlight = (async () => {
    appState.emit('app-refresh:start', payload);

    try {
      // Always reload the window for pull-to-refresh
      window.location.reload();
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
