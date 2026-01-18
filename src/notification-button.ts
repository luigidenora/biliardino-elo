import { areNotificationsActive, getRegisteredPlayerName } from './utils/notification-status.util';

/**
 * Crea e gestisce il pulsante delle notifiche nell'header
 */
export function initNotificationButton(): void {
  const button = createNotificationButton();
  document.body.appendChild(button);
  updateButtonState();
}

/**
 * Crea l'elemento HTML del pulsante
 */
function createNotificationButton(): HTMLElement {
  const button = document.createElement('a');
  button.id = 'notification-user-button';
  button.className = 'notification-user-button';
  button.href = './notifications-test.html';
  button.setAttribute('aria-label', 'Impostazioni Notifiche');

  const icon = document.createElement('span');
  icon.className = 'notification-user-icon';
  icon.textContent = '🔔';

  const textWrapper = document.createElement('span');
  textWrapper.className = 'notification-text-wrapper';

  const mainLabel = document.createElement('span');
  mainLabel.className = 'notification-main-label';
  mainLabel.textContent = 'Notifiche';

  const subLabel = document.createElement('span');
  subLabel.className = 'notification-sub-label';
  subLabel.textContent = '';

  textWrapper.appendChild(mainLabel);
  textWrapper.appendChild(subLabel);
  button.appendChild(icon);
  button.appendChild(textWrapper);

  return button;
}

/**
 * Aggiorna lo stato del pulsante in base alle notifiche
 */
async function updateButtonState(): Promise<void> {
  const button = document.getElementById('notification-user-button');
  if (!button) return;

  const icon = button.querySelector('.notification-user-icon') as HTMLElement;
  const mainLabel = button.querySelector('.notification-main-label') as HTMLElement;
  const subLabel = button.querySelector('.notification-sub-label') as HTMLElement;
  if (!icon || !mainLabel || !subLabel) return;

  const isActive = areNotificationsActive();
  const playerName = getRegisteredPlayerName();

  // Mantieni sempre "Notifiche" come testo principale
  mainLabel.textContent = 'Notifiche';

  if (isActive && playerName) {
    // Notifiche attive con utente
    icon.textContent = '✅';
    subLabel.textContent = playerName.split(' ')[0]; // Mostra nome sotto
    button.classList.add('active');
    button.classList.remove('inactive');
  } else if (playerName) {
    // Utente selezionato ma notifiche non attive
    icon.textContent = '⚠️';
    subLabel.textContent = playerName.split(' ')[0];
    button.classList.add('inactive');
    button.classList.remove('active');
  } else {
    // Nessun utente selezionato
    icon.textContent = '🔔';
    subLabel.textContent = 'Non attive';
    button.classList.add('inactive');
    button.classList.remove('active');
  }
}

// Inizializza quando il DOM è pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotificationButton);
} else {
  initNotificationButton();
}
