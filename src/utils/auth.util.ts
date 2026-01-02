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
 */
export function withAuthentication(action: () => void | Promise<void>): void {
  let started = false;

  onAuthStateChanged(AUTH, async (user) => {
    if (started) return;

    if (!user || started) {
      await promptLogin();
      return;
    }

    started = true;
    await action();
  });
}
