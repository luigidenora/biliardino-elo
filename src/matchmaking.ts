import { initDevToolbar } from './dev-toolbar';
import './pwa';
import { withAuthentication } from './utils/auth.util';
import { MatchmakingView } from './views/matchmaking.view';

async function init(): Promise<void> {
  await MatchmakingView.init();
  initDevToolbar();
}

withAuthentication(init);
