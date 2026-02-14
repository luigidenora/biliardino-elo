import { initDevToolbar } from './dev-toolbar';
import './pwa';
import { withAuthentication } from './utils/auth.util';
import { BroadcastAdminView } from './views/broadcast-admin.view';
import { MatchmakingView } from './views/matchmaking.view';

async function init(): Promise<void> {
  await MatchmakingView.init();
  BroadcastAdminView.init();
  initDevToolbar();
}

withAuthentication(init);
