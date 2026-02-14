import './pwa';
import { withAuthentication } from './utils/auth.util';
import { BroadcastAdminView } from './views/broadcast-admin.view';
import { MatchmakingView } from './views/matchmaking.view';

async function init(): Promise<void> {
  await MatchmakingView.init();
  BroadcastAdminView.init();

  // Dev toolbar: importato dinamicamente solo in dev mode.
  // In produzione questo blocco viene eliminato da Rollup.
  if (__DEV_MODE__) {
    const { initDevToolbar } = await import('./dev-toolbar');
    initDevToolbar();
  }
}

function withAdminAuthentication(initFn: () => Promise<void>): void {
  withAuthentication(initFn, true);
}

withAdminAuthentication(init);
