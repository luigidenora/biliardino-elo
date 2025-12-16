import { browserSessionPersistence, onAuthStateChanged, setPersistence } from 'firebase/auth';
import { MatchService } from './services/match.service';
import { PlayerService } from './services/player.service';
import { RepositoryService } from './services/repository.service';
import { AUTH, login } from './utils/firebase.util';
import { updateElo } from './utils/update-elo.util';
import { MatchmakingView } from './views/matchmaking.view';

async function init(): Promise<void> {
  // Load data
  MatchService.loadMatches(await RepositoryService.loadMatches());
  PlayerService.loadPlayers(await RepositoryService.loadPlayers());

  // Update ELO for all matches
  MatchService.getAllMatches().forEach(m => updateElo(m));

  // Initialize the matchmaking view
  MatchmakingView.init();
}

async function showLoginDialog(): Promise<void> {
  const dialog = document.getElementById('loginDialog') as HTMLDialogElement;
  const form = document.getElementById('loginForm') as HTMLFormElement;

  dialog.showModal();

  return new Promise((resolve, reject) => {
    const onCancel = (): void => reject(new Error('Login cancelled'));

    form.onsubmit = async (e) => {
      e.preventDefault();

      const email = (document.getElementById('loginEmail') as HTMLInputElement).value;
      const password = (document.getElementById('loginPassword') as HTMLInputElement).value;

      try {
        await setPersistence(AUTH, browserSessionPersistence);
        await login(email, password);
        dialog.close();
        resolve();
      } catch {
        alert('Invalid username or password');
      }
    };

    dialog.addEventListener('cancel', onCancel, { once: true });
  });
}

let started = false;

onAuthStateChanged(AUTH, async (user) => {
  if (started) return;

  if (!user || started) {
    await showLoginDialog();
    return;
  }

  started = true;
  await init();
});
