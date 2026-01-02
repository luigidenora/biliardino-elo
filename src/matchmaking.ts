import './pwa';
import { withAuthentication } from './utils/auth.util';
import { MatchmakingView } from './views/matchmaking.view';

async function init(): Promise<void> {
  MatchmakingView.init();
}

withAuthentication(init);
