import { isPlayerAdmin } from '@/config/admin.config';
import { onAuthStateChanged } from 'firebase/auth';
import { AUTH } from './firebase.util';

/**
 * Prompts the user to log in via the UserDropdown event bus.
 *
 * Dispatches 'user-dropdown:open-login' to expand the admin login form
 * inside the unified user dropdown. Resolves when 'user-dropdown:login-success'
 * fires, rejects when 'user-dropdown:login-cancel' fires.
 *
 * @returns A promise that resolves once the user has successfully logged in.
 * @throws An error if the user cancels.
 */
async function promptLogin(): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onSuccess = (): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener('user-dropdown:login-success', onSuccess);
      window.removeEventListener('user-dropdown:login-cancel', onCancel);
      resolve();
    };

    const onCancel = (): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener('user-dropdown:login-success', onSuccess);
      window.removeEventListener('user-dropdown:login-cancel', onCancel);
      reject(new Error('Login cancelled'));
    };

    window.addEventListener('user-dropdown:login-success', onSuccess);
    window.addEventListener('user-dropdown:login-cancel', onCancel);

    window.dispatchEvent(new CustomEvent('user-dropdown:open-login'));
  });
}

/**
 * Ensures that the given action is executed once the user is authenticated.
 *
 * If the user is not authenticated when this function is called, a login
 * prompt is shown. The action is executed exactly once after authentication
 * is confirmed.
 *
 * @param action - A function to execute after the user is authenticated. May be synchronous or return a Promise.
 * @param requireAdmin - If true, verify user is in admin list via API
 */
export function withAuthentication(
  action: () => void | Promise<void>,
  requireAdmin: boolean = false
): void {
  // In dev mode (__DEV_MODE__) salta completamente l'autenticazione Firebase.
  // In produzione questo blocco viene eliminato da Rollup (dead-code elimination).
  if (__DEV_MODE__) {
    console.log('[DEV] Skipping authentication, executing action directly');
    void action();
    return;
  }

  let started = false;

  onAuthStateChanged(AUTH, async (user) => {
    if (started) return;

    if (!user || started) {
      await promptLogin();
      return;
    }

    started = true;

    // Verifica admin se richiesto (check locale, sicurezza reale via JWT sulle API admin)
    if (requireAdmin) {
      const playerId = localStorage.getItem('biliardino_player_id');

      if (!playerId || !isPlayerAdmin(Number(playerId))) {
        showAdminDenied(!playerId
          ? 'Utente non riconosciuto. Effettua il login come giocatore prima.'
          : 'Accesso negato. Solo gli admin possono accedere a questa pagina.');
        return;
      }
    }

    await action();
  });
}

function showAdminDenied(message: string): void {
  const container = document.getElementById('app-content') ?? document.querySelector('.container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🚫</div>
        <h2 style="color: var(--color-loss, #d32f2f); margin-bottom: 1rem;">Accesso Negato</h2>
        <p style="color: rgba(255,255,255,0.5); margin-bottom: 2rem; font-size: 1.1rem;">${message}</p>
        <a href="/" style="
          display: inline-block;
          padding: 0.75rem 2rem;
          background: linear-gradient(135deg, #FFD700, #F0A500);
          color: #0F2A20;
          text-decoration: none;
          border-radius: 12px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(255, 215, 0, 0.4)';" onmouseout="this.style.transform=''; this.style.boxShadow='0 4px 12px rgba(255, 215, 0, 0.3)';">← Torna alla Home</a>
      </div>
    `;
  }

  // Redirect automatico dopo 5 secondi
  setTimeout(() => {
    window.location.assign('/');
  }, 5000);
}
