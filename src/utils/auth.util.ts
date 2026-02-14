import { API_BASE_URL } from '@/config/env.config';
import { browserSessionPersistence, onAuthStateChanged, setPersistence } from 'firebase/auth';
import { AUTH, login } from './firebase.util';

/**
 * Prompts the user to log in using a modal dialog and resolves only after
 * authentication succeeds.
 *
 * @returns A promise that resolves once the user has successfully logged in.
 * @throws An error if the user cancels the login dialog.
 */
async function promptLogin(): Promise<void> {
  const dialog = document.getElementById('loginDialog') as HTMLDialogElement;
  const form = document.getElementById('loginForm') as HTMLFormElement;
  const cancelBtn = document.getElementById('cancelLoginBtn') as HTMLButtonElement | null;

  if (!dialog || !form || !cancelBtn) {
    throw new Error('Login dialog elements not found');
  }

  dialog.showModal();

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      form.removeEventListener('submit', onSubmit);
      cancelBtn.removeEventListener('click', onCancelClick);
      dialog.removeEventListener('cancel', onDialogCancel);
      dialog.removeEventListener('close', onDialogClose);
    };

    const settleResolve = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const settleReject = (err: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onCancelClick = (): void => {
      dialog.close('cancel');
    };

    const onDialogCancel = (e: Event): void => {
      e.preventDefault();
      dialog.close('cancel');
    };

    const onDialogClose = (): void => {
      if (dialog.returnValue === 'cancel') {
        settleReject(new Error('Login cancelled'));
      }
    };

    const onSubmit = async (e: SubmitEvent): Promise<void> => {
      e.preventDefault();

      const email = (document.getElementById('loginEmail') as HTMLInputElement).value;
      const password = (document.getElementById('loginPassword') as HTMLInputElement).value;

      try {
        await setPersistence(AUTH, browserSessionPersistence);
        await login(email, password);
        dialog.close('ok');
        settleResolve();
      } catch {
        alert('Invalid username or password');
      }
    };

    cancelBtn.addEventListener('click', onCancelClick);
    dialog.addEventListener('cancel', onDialogCancel);
    dialog.addEventListener('close', onDialogClose);
    form.addEventListener('submit', onSubmit);
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

    // Verifica admin se richiesto
    if (requireAdmin) {
      const playerId = localStorage.getItem('biliardino_player_id');

      if (!playerId) {
        showAdminDenied('Utente non riconosciuto. Effettua il login come giocatore prima.');
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/check-admin?playerId=${playerId}`);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.isAdmin) {
          showAdminDenied('Accesso negato. Solo gli admin possono accedere a questa pagina.');
          return;
        }

        console.log('✅ Admin verificato:', playerId);
      } catch (error) {
        console.error('❌ Errore verifica admin:', error);
        showAdminDenied('Errore verifica permessi admin.');
        return;
      }
    }

    await action();
  });
}

function showAdminDenied(message: string): void {
  const container = document.querySelector('.container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🚫</div>
        <h2 style="color: #d32f2f; margin-bottom: 1rem;">Accesso Negato</h2>
        <p style="color: #6e6e73; margin-bottom: 2rem; font-size: 1.1rem;">${message}</p>
        <a href="./index.html" style="
          display: inline-block;
          padding: 0.75rem 2rem;
          background: linear-gradient(135deg, #062c7d 0%, #1a4aad 100%);
          color: white;
          text-decoration: none;
          border-radius: 12px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(6, 44, 125, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(6, 44, 125, 0.4)';" onmouseout="this.style.transform=''; this.style.boxShadow='0 4px 12px rgba(6, 44, 125, 0.3)';">← Torna alla Home</a>
      </div>
    `;
  }

  // Redirect automatico dopo 5 secondi
  setTimeout(() => {
    window.location.href = './index.html';
  }, 5000);
}
