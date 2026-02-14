import { onAuthStateChanged } from 'firebase/auth';
import { API_BASE_URL } from '../config/env.config';
import { AUTH } from '../utils/firebase.util';
import { getNextMatchTime } from '../utils/next-match-time.util';

/**
 * Classe standalone per gestire il sistema di notifiche broadcast admin.
 * Aggiunge un pulsante floating in basso a destra e gestisce login/logout admin.
 * Il pulsante appare solo dopo il login Firebase.
 */
export class BroadcastAdminView {
  private static readonly ADMIN_TOKEN_KEY = 'biliardino_admin_token';
  private static floatingButton: HTMLButtonElement | null = null;
  private static adminLoginDialog: HTMLDialogElement | null = null;
  private static broadcastDialog: HTMLDialogElement | null = null;

  /**
   * Inizializza il sistema di broadcast admin
   */
  public static init(): void {
    // In dev mode (__DEV_MODE__) crea subito il FAB senza attendere auth Firebase.
    // In produzione questo blocco viene eliminato da Rollup.
    if (__DEV_MODE__) {
      BroadcastAdminView.createUI();
      return;
    }

    // In produzione aspetta l'autenticazione Firebase
    if (!AUTH) {
      console.error('Firebase AUTH instance is not initialized. Broadcast admin UI will not be created.');
      return;
    }

    onAuthStateChanged(AUTH, (user) => {
      if (user && !BroadcastAdminView.floatingButton) {
        BroadcastAdminView.createUI();
      }
    });
  }

  /**
   * Crea tutta l'UI (FAB + dialogs)
   */
  private static createUI(): void {
    BroadcastAdminView.createFloatingButton();
    BroadcastAdminView.createAdminLoginDialog();
    BroadcastAdminView.createBroadcastDialog();
    BroadcastAdminView.updateFloatingButtonUI();
  }

  /**
   * Crea il pulsante floating in basso a destra
   */
  private static createFloatingButton(): void {
    const button = document.createElement('button');
    button.id = 'broadcast-admin-fab';
    button.className = 'broadcast-admin-fab';
    button.title = 'Notifiche Broadcast Admin';
    button.innerHTML = '📢';
    button.type = 'button';

    button.addEventListener('click', () => {
      if (BroadcastAdminView.isAdminLoggedIn()) {
        BroadcastAdminView.showBroadcastDialog();
      } else {
        BroadcastAdminView.showAdminLoginDialog();
      }
    });

    // Long press per logout
    let pressTimer: number | null = null;
    button.addEventListener('mousedown', () => {
      if (BroadcastAdminView.isAdminLoggedIn()) {
        pressTimer = window.setTimeout(() => {
          BroadcastAdminView.handleAdminLogout();
        }, 2000);
      }
    });

    button.addEventListener('mouseup', () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });

    button.addEventListener('mouseleave', () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });

    document.body.appendChild(button);
    BroadcastAdminView.floatingButton = button;
  }

  /**
   * Crea il dialog per il login admin
   */
  private static createAdminLoginDialog(): void {
    const dialog = document.createElement('dialog');
    dialog.id = 'adminLoginDialog';
    dialog.className = 'login-dialog';

    dialog.innerHTML = `
      <form method="dialog" id="adminLoginForm" class="login-form">
        <h3>Login Admin - Notifiche Broadcast</h3>

        <label>
          JWT Token
          <input type="password" id="adminToken" required placeholder="Inserisci il token JWT admin" />
        </label>

        <menu>
          <button id="cancelAdminLoginBtn" value="cancel" type="button">Annulla</button>
          <button id="confirmAdminLoginBtn" value="default">Accedi</button>
        </menu>
      </form>
    `;

    const form = dialog.querySelector('#adminLoginForm') as HTMLFormElement;
    const cancelBtn = dialog.querySelector('#cancelAdminLoginBtn') as HTMLButtonElement;

    form.addEventListener('submit', (e: SubmitEvent) => {
      e.preventDefault();
      const tokenInput = dialog.querySelector('#adminToken') as HTMLInputElement;
      const token = tokenInput.value.trim();

      if (token) {
        localStorage.setItem(BroadcastAdminView.ADMIN_TOKEN_KEY, token);
        BroadcastAdminView.updateFloatingButtonUI();
        dialog.close();
        form.reset();
        console.log('✅ Admin login effettuato');

        // Mostra messaggio di conferma
        alert('✅ Login admin effettuato! Mantieni premuto il pulsante per 2 secondi per fare logout.');
      } else {
        alert('Inserisci un token valido');
      }
    });

    cancelBtn.addEventListener('click', () => {
      dialog.close();
      form.reset();
    });

    document.body.appendChild(dialog);
    BroadcastAdminView.adminLoginDialog = dialog;
  }

  /**
   * Crea il dialog per inviare broadcast
   */
  private static createBroadcastDialog(): void {
    const dialog = document.createElement('dialog');
    dialog.id = 'sendBroadcastDialog';
    dialog.className = 'login-dialog';

    dialog.innerHTML = `
      <form method="dialog" id="sendBroadcastForm" class="login-form">
        <h3>Invia Notifica Broadcast</h3>

        <label>
          Orario Match (HH:MM)
          <input type="text" id="broadcastMatchTime" required placeholder="es: 14:30" />
        </label>

        <label>
          Titolo (opzionale)
          <input type="text" id="broadcastTitle" placeholder="Titolo personalizzato" />
        </label>

        <label>
          Messaggio (opzionale)
          <textarea id="broadcastBody" placeholder="Messaggio personalizzato" rows="3"></textarea>
        </label>

        <menu>
          <button id="cancelBroadcastBtn" value="cancel" type="button">Annulla</button>
          <button id="confirmBroadcastBtn" value="default">Invia</button>
        </menu>
      </form>
    `;

    const form = dialog.querySelector('#sendBroadcastForm') as HTMLFormElement;
    const cancelBtn = dialog.querySelector('#cancelBroadcastBtn') as HTMLButtonElement;

    form.addEventListener('submit', async (e: SubmitEvent) => {
      e.preventDefault();

      const matchTimeInput = dialog.querySelector('#broadcastMatchTime') as HTMLInputElement;
      const titleInput = dialog.querySelector('#broadcastTitle') as HTMLInputElement;
      const bodyInput = dialog.querySelector('#broadcastBody') as HTMLTextAreaElement;

      const matchTime = matchTimeInput.value.trim();
      const title = titleInput.value.trim();
      const body = bodyInput.value.trim();

      if (!matchTime) {
        alert('Inserisci un orario valido (es: 14:30)');
        return;
      }

      try {
        await BroadcastAdminView.sendBroadcast(matchTime, title || undefined, body || undefined);
        dialog.close();
        form.reset();
      } catch (error) {
        console.error('Errore invio broadcast:', error);
        alert('Errore durante l\'invio del broadcast. Verifica il token e riprova.');
      }
    });

    cancelBtn.addEventListener('click', () => {
      dialog.close();
      form.reset();
    });

    document.body.appendChild(dialog);
    BroadcastAdminView.broadcastDialog = dialog;
  }

  /**
   * Verifica se l'utente è loggato come admin
   */
  private static isAdminLoggedIn(): boolean {
    const token = localStorage.getItem(BroadcastAdminView.ADMIN_TOKEN_KEY);
    return !!token && token.trim() !== '';
  }

  /**
   * Aggiorna l'UI del pulsante floating in base allo stato di login
   */
  private static updateFloatingButtonUI(): void {
    if (!BroadcastAdminView.floatingButton) return;

    const isLoggedIn = BroadcastAdminView.isAdminLoggedIn();

    if (isLoggedIn) {
      BroadcastAdminView.floatingButton.classList.add('logged-in');
      BroadcastAdminView.floatingButton.title = 'Invia Broadcast (tieni premuto per logout)';
    } else {
      BroadcastAdminView.floatingButton.classList.remove('logged-in');
      BroadcastAdminView.floatingButton.title = 'Login Admin';
    }
  }

  /**
   * Mostra il dialog per il login admin
   */
  private static showAdminLoginDialog(): void {
    if (!BroadcastAdminView.adminLoginDialog) return;
    BroadcastAdminView.adminLoginDialog.showModal();
  }

  /**
   * Mostra il dialog per inviare il broadcast
   */
  private static showBroadcastDialog(): void {
    if (!BroadcastAdminView.broadcastDialog) return;

    // Pre-compila l'orario con il prossimo match time
    const matchTimeInput = BroadcastAdminView.broadcastDialog.querySelector('#broadcastMatchTime') as HTMLInputElement;
    if (matchTimeInput) {
      matchTimeInput.value = getNextMatchTime();
    }

    BroadcastAdminView.broadcastDialog.showModal();
  }

  /**
   * Gestisce il logout admin
   */
  private static handleAdminLogout(): void {
    const confirm = window.confirm('Vuoi effettuare il logout admin?');
    if (confirm) {
      localStorage.removeItem(BroadcastAdminView.ADMIN_TOKEN_KEY);
      BroadcastAdminView.updateFloatingButtonUI();
      console.log('🚪 Admin logout effettuato');
      alert('Logout effettuato con successo');
    }
  }

  /**
   * Invia una notifica broadcast tramite API
   */
  private static async sendBroadcast(matchTime: string, title?: string, body?: string): Promise<void> {
    const token = localStorage.getItem(BroadcastAdminView.ADMIN_TOKEN_KEY);

    if (!token) {
      throw new Error('Token admin non trovato. Effettua il login prima di inviare notifiche.');
    }

    const payload: {
      matchTime: string;
      title?: string;
      body?: string;
    } = {
      matchTime
    };

    if (title) payload.title = title;
    if (body) payload.body = body;

    const response = await fetch(`${API_BASE_URL}/send-broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log(`📢 Broadcast inviato: ${result.sent}/${result.total} notifiche`);
    alert(`✅ Broadcast inviato con successo!\n\nInviati: ${result.sent}\nFalliti: ${result.failed}\nTotale: ${result.total}`);
  }
}
