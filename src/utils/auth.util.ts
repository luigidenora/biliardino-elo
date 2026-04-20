import { isPlayerAdmin } from '@/config/admin.config';
import { isLoggedIn } from './supabase.util';

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

export async function withAuthentication(
  action: () => void | Promise<void>,
  requireAdmin: boolean = false
): Promise<boolean> {
  try {
    if (!(await isLoggedIn())) {
      await promptLogin();
    }

    if (requireAdmin) {
      const playerId = localStorage.getItem('biliardino_player_id');
      if (!playerId || !isPlayerAdmin(Number(playerId))) {
        showAdminDenied(!playerId
          ? 'Utente non riconosciuto. Effettua il login come giocatore prima.'
          : 'Accesso negato. Solo gli admin possono accedere a questa pagina.');
        return false;
      }
    }

    await action();
    return true;
  } catch {
    return false;
  }
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
          color: var(--color-bg-deep);
          text-decoration: none;
          border-radius: 12px;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(255, 215, 0, 0.4)';" onmouseout="this.style.transform=''; this.style.boxShadow='0 4px 12px rgba(255, 215, 0, 0.3)';">← Torna alla Home</a>
      </div>
    `;
  }

  setTimeout(() => { window.location.assign('/'); }, 5000);
}
