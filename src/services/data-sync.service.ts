import { supabase } from '@/utils/supabase.util';
import { CACHE_HASH_PLAYERS_KEY, CACHE_HASH_MATCHES_KEY } from './repository.supabase';

type CacheControlRow = { hashPlayers: number | null; hashMatches: number | null };

let onPlayersChanged: (() => Promise<void>) | null = null;
let onMatchesChanged: (() => Promise<void>) | null = null;

export function initDataSync(callbacks: {
  onPlayersChanged: () => Promise<void>;
  onMatchesChanged: () => Promise<void>;
}): void {
  onPlayersChanged = callbacks.onPlayersChanged;
  onMatchesChanged = callbacks.onMatchesChanged;

  supabase
    .channel('cache-control-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cache-control' },
      (payload) => {
        const row = payload.new as CacheControlRow;
        const localHashPlayers = Number(localStorage.getItem(CACHE_HASH_PLAYERS_KEY) ?? 'NaN');
        const localHashMatches = Number(localStorage.getItem(CACHE_HASH_MATCHES_KEY) ?? 'NaN');

        if (typeof row.hashPlayers === 'number' && row.hashPlayers !== localHashPlayers) {
          console.log('[data-sync] Players hash changed:', row.hashPlayers, '(was', localHashPlayers, ')');
          onPlayersChanged?.();
        }
        if (typeof row.hashMatches === 'number' && row.hashMatches !== localHashMatches) {
          console.log('[data-sync] Matches hash changed:', row.hashMatches, '(was', localHashMatches, ')');
          onMatchesChanged?.();
        }
      }
    )
    .subscribe((status) => {
      console.log('[data-sync] Realtime subscription status:', status);
    });
}
