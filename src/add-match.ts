import './pwa';
import { withAuthentication } from './utils/auth.util';
import { AddMatchView } from './views/add-match.view';

async function init(): Promise<void> {
  AddMatchView.init();
}

withAuthentication(init);
