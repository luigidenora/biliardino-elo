/**
 * Dev Toolbar — pannello flottante visibile solo in development.
 *
 * Questo modulo viene importato SOLO quando __DEV_MODE__ è true (import dinamico).
 * In produzione non viene mai importato né incluso nel bundle.
 *
 * Permette di:
 * - Simulare conferme di giocatori mock (chiamando le API reali su Redis)
 * - Inviare broadcast di notifica (usa l'admin token)
 * - Pulire le conferme Redis per il prossimo match
 */
import { getAllPlayers } from '@/services/player.service';
import { getNextMatchTime } from '@/utils/next-match-time.util';

const API = import.meta.env.VITE_API_BASE_URL as string;
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

// ID dei mock player da usare per le simulazioni (corrispondono a repository.mock.ts: id 1-35)
let nextMockIndex = 0;

function getMatchTime(): string {
  return getNextMatchTime();
}

function getRandomMockPlayerId(): number {
  const players = getAllPlayers();
  if (players.length === 0) return 1;
  const player = players[nextMockIndex % players.length];
  nextMockIndex++;
  return player.id;
}

// ─── API helpers ────────────────────────────────────────────────────────────

async function simulateConfirmation(playerId: number, matchTime: string): Promise<{ ok: boolean; count: number }> {
  const res = await fetch(`${API}/confirm-availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, matchTime })
  });
  return res.json();
}

async function clearConfirmations(matchTime: string): Promise<any> {
  const token = ADMIN_TOKEN || localStorage.getItem('biliardino_admin_token') || '';
  const res = await fetch(`${API}/clear-confirmations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ matchTime })
  });
  return res.json();
}

async function sendBroadcast(matchTime: string): Promise<any> {
  const token = ADMIN_TOKEN || localStorage.getItem('biliardino_admin_token') || '';
  const res = await fetch(`${API}/send-broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ matchTime })
  });
  return res.json();
}

// ─── UI ─────────────────────────────────────────────────────────────────────

function createToolbar(): void {
  const toolbar = document.createElement('div');
  toolbar.id = 'dev-toolbar';
  toolbar.innerHTML = `
    <style>
      #dev-toolbar {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
      }
      #dev-toolbar .dev-fab {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #1a1a2e;
        color: #00d4ff;
        border: 2px solid #00d4ff;
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3);
        transition: all 0.2s ease;
        margin-left: auto;
      }
      #dev-toolbar .dev-fab:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 28px rgba(0, 212, 255, 0.5);
      }
      #dev-toolbar .dev-panel {
        display: none;
        background: #1a1a2e;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 8px;
        min-width: 260px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        color: #e0e0e0;
      }
      #dev-toolbar .dev-panel.open { display: block; }
      #dev-toolbar .dev-panel-title {
        font-weight: 700;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #00d4ff;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #dev-toolbar .dev-row {
        display: flex;
        gap: 6px;
        margin-bottom: 6px;
        align-items: center;
      }
      #dev-toolbar .dev-btn {
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid #444;
        background: #2a2a3e;
        color: #e0e0e0;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      #dev-toolbar .dev-btn:hover {
        background: #3a3a5e;
        border-color: #00d4ff;
        color: #fff;
      }
      #dev-toolbar .dev-btn:active {
        transform: scale(0.96);
      }
      #dev-toolbar .dev-btn.danger {
        border-color: #f44336;
        color: #f44336;
      }
      #dev-toolbar .dev-btn.danger:hover {
        background: rgba(244, 67, 54, 0.15);
      }
      #dev-toolbar .dev-btn.primary {
        background: #00d4ff;
        color: #1a1a2e;
        border-color: #00d4ff;
      }
      #dev-toolbar .dev-btn.primary:hover {
        background: #00b8d4;
      }
      #dev-toolbar .dev-log {
        font-size: 11px;
        color: #888;
        max-height: 100px;
        overflow-y: auto;
        margin-top: 6px;
        padding: 6px;
        background: #111;
        border-radius: 6px;
        font-family: 'SF Mono', 'Fira Code', monospace;
      }
      #dev-toolbar .dev-log-entry {
        margin-bottom: 2px;
      }
      #dev-toolbar .dev-log-entry.ok { color: #4caf50; }
      #dev-toolbar .dev-log-entry.err { color: #f44336; }
      #dev-toolbar .dev-matchtime {
        font-weight: 700;
        color: #00d4ff;
        font-size: 13px;
      }
    </style>

    <div class="dev-panel" id="dev-panel">
      <div class="dev-panel-title">🔧 Dev Toolbar</div>

      <div class="dev-row">
        <span style="color:#888">Match:</span>
        <span class="dev-matchtime" id="dev-matchtime">${getMatchTime()}</span>
      </div>

      <div class="dev-row">
        <button class="dev-btn primary" id="dev-add-1">+1 Conferma</button>
        <button class="dev-btn" id="dev-add-3">+3 Conferme</button>
        <button class="dev-btn" id="dev-add-5">+5 Conferme</button>
      </div>

      <div class="dev-row">
        <button class="dev-btn" id="dev-broadcast">📣 Broadcast</button>
        <button class="dev-btn danger" id="dev-clear">🗑 Clear</button>
      </div>

      <div class="dev-log" id="dev-log"></div>
    </div>

    <button class="dev-fab" id="dev-fab" title="Dev Toolbar">🔧</button>
  `;

  document.body.appendChild(toolbar);
  bindEvents();
}

function log(msg: string, type: 'ok' | 'err' | '' = ''): void {
  const logEl = document.getElementById('dev-log');
  if (!logEl) return;
  const entry = document.createElement('div');
  entry.className = `dev-log-entry ${type}`;
  const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `[${time}] ${msg}`;
  logEl.prepend(entry);

  // Keep max 20 entries
  while (logEl.children.length > 20) {
    logEl.lastChild?.remove();
  }
}

async function addConfirmations(count: number): Promise<void> {
  const matchTime = getMatchTime();
  const players = getAllPlayers();
  log(`Invio ${count} conferme per ${matchTime}...`);

  for (let i = 0; i < count; i++) {
    const playerId = getRandomMockPlayerId();
    const name = players.find(p => p.id === playerId)?.name ?? `#${playerId}`;
    try {
      const data = await simulateConfirmation(playerId, matchTime);
      log(`✓ ${name} confermato (tot: ${data.count})`, 'ok');
    } catch (e: any) {
      log(`✗ ${name}: ${e.message}`, 'err');
    }
  }
}

function bindEvents(): void {
  const fab = document.getElementById('dev-fab')!;
  const panel = document.getElementById('dev-panel')!;

  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    // Aggiorna match time quando si apre
    const mtEl = document.getElementById('dev-matchtime');
    if (mtEl) mtEl.textContent = getMatchTime();
  });

  document.getElementById('dev-add-1')!.addEventListener('click', () => addConfirmations(1));
  document.getElementById('dev-add-3')!.addEventListener('click', () => addConfirmations(3));
  document.getElementById('dev-add-5')!.addEventListener('click', () => addConfirmations(5));

  document.getElementById('dev-broadcast')!.addEventListener('click', async () => {
    const matchTime = getMatchTime();
    log(`Invio broadcast per ${matchTime}...`);
    try {
      const data = await sendBroadcast(matchTime);
      log(`📣 Broadcast: ${data.sent ?? 0} notifiche inviate`, 'ok');
    } catch (e: any) {
      log(`✗ Broadcast fallito: ${e.message}`, 'err');
    }
  });

  document.getElementById('dev-clear')!.addEventListener('click', async () => {
    const matchTime = getMatchTime();
    log(`Pulizia conferme ${matchTime}...`);
    try {
      const data = await clearConfirmations(matchTime);
      log(`🗑 ${data.deleted ?? 0} conferme eliminate`, 'ok');
      nextMockIndex = 0;
    } catch (e: any) {
      log(`✗ Clear fallito: ${e.message}`, 'err');
    }
  });
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function initDevToolbar(): void {
  if (!API) {
    console.warn('[DevToolbar] VITE_API_BASE_URL non configurato, toolbar disabilitato');
    return;
  }

  // Attendi il DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToolbar);
  } else {
    createToolbar();
  }

  console.log('[DevToolbar] Dev Toolbar attivo');
}
