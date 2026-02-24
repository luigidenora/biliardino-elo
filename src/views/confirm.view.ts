/**
 * ConfirmView: separazione della logica dalla pagina HTML.
 * Porting della logica originariamente inline in confirm.html
 */
export class ConfirmView {
  private static AppState = {
    LOADING: 'LOADING',
    LOBBY_FOUND: 'LOBBY_FOUND',
    NO_LOBBY: 'NO_LOBBY',
    CONFIRMED: 'CONFIRMED',
    ERROR: 'ERROR'
  } as const;

  private static currentState = ConfirmView.AppState.LOADING as string;
  private static fishMap = new Map<any, HTMLElement>();
  private static fishMovement = new Map<any, any>();
  private static pollingIntervalId: number | null = null;
  private static pollingTimeoutId: number | null = null;
  private static pollingStartTime = 0;
  private static pollingElapsedTime = 0;
  private static lastMessageTimestamp = 0;
  private static myPlayerId: string | null = null;

  // Config
  private static MIN_PLAYERS = 5;

  // Fish/assets
  private static FISH_TYPES = ['Squalo', 'Barracuda', 'Tonno', 'Spigola', 'Sogliola'];
  private static FISH_SPRITES_SVG: Record<string, string> = {
    Squalo: '🦈',
    Barracuda: '🐟',
    Tonno: '🐠',
    Spigola: '🐡',
    Sogliola: '🦑'
  };
  private static LABEL_COLORS = [
    '#1e90ff', '#e74c3c', '#8e44ad', '#e67e22', '#2ecc71', '#f39c12', '#16a085', '#c0392b', '#2980b9', '#d35400'
  ];

  public static async init(): Promise<void> {
    // Basic setup
    this.myPlayerId = localStorage.getItem('biliardino_player_id');

    // Ensure UI reflects initial loading state immediately
    this.setState(this.AppState.LOADING);

    // Expose helper for dev panel
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.__devSpawnFish = (id: any, name: string, idx: number) => this.spawnFish(id, name, idx);

    // Wire confirm button and retry
    const confirmBtn = document.getElementById('confirm-btn');
    const retryBtn = document.getElementById('retry-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmAttendance());
    if (retryBtn) retryBtn.addEventListener('click', () => {
      if (confirmBtn) {
        (confirmBtn as HTMLButtonElement).disabled = false;
        confirmBtn.textContent = '🌊 Ci sono!';
      }
      this.setState(this.AppState.LOBBY_FOUND);
    });

    // Start visuals
    this.spawnBubbles();
    this.spawnGodRays();

    // Wire chat form handlers (if present)
    this.setupChat();

    // Check lobby and start polling if exists
    const lobbyExists = await this.checkLobby();
    if (!lobbyExists) {
      this.setState(this.AppState.NO_LOBBY);
      this.showNoLobbyMessage();
      return;
    }

    this.setState(this.AppState.LOBBY_FOUND);
    this.startPolling();

    // Start fish movement loop
    this.updateFishMovement();

    window.addEventListener('beforeunload', () => this.stopPolling());
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
  }

  private static setState(newState: string): void {
    // Minimal state transition: set dataset (CSS controls visibility)
    this.currentState = newState;
    document.body.dataset.state = newState;

    const confirmBtn = document.getElementById('confirm-btn') as HTMLButtonElement | null;

    // Side-effects handled here (polling, fish behavior, button enabled/disabled)
    switch (newState) {
      case this.AppState.LOADING:
        this.stopPolling();
        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.textContent = '🌊 Ci sono!';
        }
        break;
      case this.AppState.LOBBY_FOUND:
        // ensure polling runs and button is enabled
        if (this.pollingIntervalId === null && this.pollingElapsedTime < 60_000) this.startPolling();
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = '🌊 Ci sono!';
        }
        this.reviveFish();
        break;
      case this.AppState.CONFIRMED:
        // keep polling optional, disable button
        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.textContent = '✅ Confermato';
        }
        this.reviveFish();
        break;
      case this.AppState.NO_LOBBY:
        this.stopPolling();
        this.populateAmpollaFish();
        break;
      case this.AppState.ERROR:
        this.stopPolling();
        this.killFish();
        if (confirmBtn) confirmBtn.disabled = false;
        break;
    }
  }

  private static populateAmpollaFish(): void {
    const ampollaFish = document.getElementById('ampolla-fish');
    if (ampollaFish) ampollaFish.textContent = '🦈';
  }

  private static rand(min: number, max: number) { return Math.random() * (max - min) + min; }

  private static spawnFish(playerId: any, name: string, index: number): void {
    if (!document.getElementById('aquarium')) return;
    if (this.fishMap.has(playerId)) return;

    const isMe = String(playerId) === String(this.myPlayerId);
    const fishType = isMe ? 'Squalo' : this.FISH_TYPES[index % this.FISH_TYPES.length];
    const labelColor = this.LABEL_COLORS[index % this.LABEL_COLORS.length];
    const svgSprite = this.FISH_SPRITES_SVG[fishType] || '🐟';

    const fish = document.createElement('div');
    fish.className = 'fish';
    fish.dataset.playerId = String(playerId);
    fish.dataset.fishType = fishType;
    fish.innerHTML = `
      <div class="fish-sprite">${svgSprite}</div>
      <span class="fish-label" style="background:${labelColor};--label-color:${labelColor}">${isMe ? '🙋 Tu' : name}</span>
    `;

    const aquarium = document.getElementById('aquarium')!;
    aquarium.appendChild(fish);
    this.fishMap.set(playerId, fish);

    // movement
    const screenWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const aquariumStartY = viewportHeight * 0.3;
    const marginHorizontal = 20;
    const marginVertical = 100;
    const fishSprite = fish.querySelector('.fish-sprite') as HTMLElement | null;

    this.fishMovement.set(playerId, {
      x: this.rand(marginHorizontal, screenWidth - marginHorizontal),
      y: this.rand(aquariumStartY + marginVertical, viewportHeight - marginVertical),
      vx: this.rand(-1, 1),
      vy: this.rand(-0.5, 0.5),
      speed: this.rand(0.5, 1.5),
      element: fish,
      sprite: fishSprite
    });
  }

  private static removeFish(playerId: any): void {
    const fish = this.fishMap.get(playerId);
    if (!fish) return;
    fish.style.transition = 'opacity 0.5s';
    fish.style.opacity = '0';
    setTimeout(() => {
      fish.remove();
      this.fishMap.delete(playerId);
      this.fishMovement.delete(playerId);
    }, 500);
  }

  private static updateFishMovement(): void {
    const viewportHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    const aquariumStartY = viewportHeight * 0.3;
    const marginHorizontal = 20;
    const marginVertical = 50;
    const minY = aquariumStartY + marginVertical;
    const maxY = viewportHeight - marginVertical;
    const minX = marginHorizontal;
    const maxX = screenWidth - marginHorizontal;

    this.fishMovement.forEach((movement, playerId) => {
      const { element } = movement;
      if (!element || !document.body.contains(element)) {
        this.fishMovement.delete(playerId);
        return;
      }

      movement.x += movement.vx * movement.speed;
      movement.y += movement.vy * movement.speed;

      if (movement.x <= minX || movement.x >= maxX) {
        movement.vx *= -1;
        movement.x = Math.max(minX, Math.min(maxX, movement.x));
      }
      if (movement.y <= minY || movement.y >= maxY) {
        movement.vy *= -1;
        movement.y = Math.max(minY, Math.min(maxY, movement.y));
      }

      if (Math.random() < 0.01) {
        movement.vx += this.rand(-0.3, 0.3);
        movement.vy += this.rand(-0.2, 0.2);
        const maxSpeed = 2;
        const currentSpeed = Math.sqrt(movement.vx ** 2 + movement.vy ** 2);
        if (currentSpeed > maxSpeed) {
          movement.vx = (movement.vx / currentSpeed) * maxSpeed;
          movement.vy = (movement.vy / currentSpeed) * maxSpeed;
        }
      }

      const angle = Math.atan2(movement.vy, movement.vx) * (180 / Math.PI) + 180;
      element.style.transform = `translate(${movement.x}px, ${movement.y}px)`;
      if (movement.sprite) movement.sprite.style.transform = `rotate(${angle}deg)`;
    });

    requestAnimationFrame(() => this.updateFishMovement());
  }

  private static killFish(): void {
    const aquarium = document.getElementById('aquarium');
    if (!aquarium) return;
    for (const fish of this.fishMap.values()) {
      const rect = fish.getBoundingClientRect();
      const parentRect = aquarium.getBoundingClientRect();
      const currentTop = ((rect.top - parentRect.top) / parentRect.height) * 100;
      const currentLeft = ((rect.left - parentRect.left) / parentRect.width) * 100;
      fish.style.top = currentTop + '%';
      fish.style.left = currentLeft + '%';
      fish.style.setProperty('--dead-float-dur', this.rand(2, 5).toFixed(1) + 's');
      fish.style.setProperty('--dead-rise-dur', this.rand(8, 18).toFixed(1) + 's');
      fish.style.setProperty('--dead-delay', this.rand(0, 2).toFixed(1) + 's');
      fish.style.setProperty('--dead-bob', this.rand(-6, -16).toFixed(0) + 'px');
      fish.style.setProperty('--dead-rot-a', this.rand(-6, -1).toFixed(0) + 'deg');
      fish.style.setProperty('--dead-rot-b', this.rand(1, 6).toFixed(0) + 'deg');
      fish.classList.add('dead');
      void fish.offsetHeight;
      fish.style.top = '5px';
    }
  }

  private static reviveFish(): void {
    for (const fish of this.fishMap.values()) {
      fish.classList.remove('dead');
      fish.style.marginTop = '';
      fish.style.top = '';
      fish.style.left = '';
    }
  }

  private static syncFish(confirmations: any[] = []): void {
    const activeIds = new Set(confirmations.map((c: any) => c.playerId));
    for (const id of Array.from(this.fishMap.keys())) {
      if (!activeIds.has(id)) this.removeFish(id);
    }
    const sorted = [...confirmations].sort((a, b) => new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime());
    sorted.forEach((conf: any, i: number) => {
      const isMe = String(conf.playerId) === String(this.myPlayerId);
      const fishName = conf.fishName || `Giocatore #${conf.playerId}`;
      const name = isMe ? '🙋 Tu' : fishName;
      this.spawnFish(conf.playerId, name, i);
    });
  }

  private static spawnBubbles(): void {
    const aquarium = document.getElementById('aquarium');
    if (!aquarium) return;
    const count = 18;
    for (let i = 0; i < count; i++) {
      const b = document.createElement('div');
      b.className = 'bubble';
      const size = this.rand(8, 26);
      b.style.cssText = `width: ${size}px; height: ${size}px; left: ${this.rand(3, 97)}%; --rise-dur: ${this.rand(7, 16)}s; --rise-delay: ${this.rand(0, 10)}s; --drift: ${this.rand(-30, 30)}px;`;
      aquarium.appendChild(b);
    }
  }

  private static spawnGodRays(): void {
    const container = document.getElementById('god-rays');
    if (!container) return;
    const rays = 4;
    for (let i = 0; i < rays; i++) {
      const r = document.createElement('div');
      r.className = 'god-ray';
      const baseAngle = -15;
      const angle = baseAngle + this.rand(-5, 5);
      r.style.cssText = `left: ${20 + i * 18 + this.rand(-5, 5)}%; --ray-w: ${this.rand(100, 220)}px; --ray-angle: ${angle}deg; --ray-dur: ${this.rand(7, 14)}s; --ray-opacity: ${this.rand(0.4, 0.7)};`;
      container.appendChild(r);
    }
  }

  private static async loadConfirmations(): Promise<void> {
    try {
      const [confirmRes, messagesRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_BASE_URL}/get-confirmations`),
        fetch(`${import.meta.env.VITE_API_BASE_URL}/get-messages`)
      ]);

      const confirmData = await confirmRes.json();
      const messagesData = await messagesRes.json();

      const count = confirmData.count || 0;
      const queueEl = document.getElementById('queue-count');
      if (queueEl) queueEl.textContent = String(count);

      const statusEl = document.getElementById('top-bar-status');
      if (statusEl) statusEl.textContent = count >= this.MIN_PLAYERS ? 'Si gioca! ⚽' : '';

      if (confirmData.confirmations && confirmData.confirmations.length > 0) {
        this.syncFish(confirmData.confirmations);
        const iHaveConfirmed = confirmData.confirmations.some((c: any) => String(c.playerId) === String(this.myPlayerId));
        if (iHaveConfirmed && this.currentState === this.AppState.LOBBY_FOUND) this.setState(this.AppState.CONFIRMED);
      } else {
        for (const id of Array.from(this.fishMap.keys())) this.removeFish(id);
      }

      if (messagesData.messages && messagesData.messages.length > 0) {
        for (const msg of messagesData.messages) {
          const fish = this.fishMap.get(msg.playerId);
          if (fish) this.showFishTooltip(fish, msg.text);
          this.lastMessageTimestamp = Math.max(this.lastMessageTimestamp, msg.sentAt || 0);
        }
      }
    } catch (err) {
      // swallow errors, keep UI responsive
      // eslint-disable-next-line no-console
      console.error('Errore caricamento conferme:', err);
    }
  }

  private static startPolling(): void {
    this.loadConfirmations();
    // this.pollingIntervalId = window.setInterval(() => this.loadConfirmations(), 10_000);
    const remainingTime = 60_000 - this.pollingElapsedTime;
    this.pollingStartTime = Date.now();
    this.pollingTimeoutId = window.setTimeout(() => {
      this.stopPolling();
    }, remainingTime);
  }

  private static stopPolling(): void {
    if (this.pollingIntervalId !== null) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
      if (this.pollingStartTime > 0) this.pollingElapsedTime += Date.now() - this.pollingStartTime;
    }
    if (this.pollingTimeoutId !== null) {
      clearTimeout(this.pollingTimeoutId);
      this.pollingTimeoutId = null;
    }
  }

  private static handleVisibilityChange(): void {
    if (document.hidden) {
      if (this.pollingIntervalId !== null) this.stopPolling();
    } else {
      if (this.pollingIntervalId === null && this.pollingElapsedTime < 60_000) this.startPolling();
    }
  }

  private static async checkLobby(): Promise<boolean> {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/check-lobby`);
      if (!res.ok) return true; // fail-open
      const data = await res.json();
      return !!data.exists;
    } catch (err) {
      return true; // fail-open
    }
  }

  private static showNoLobbyMessage(): void {
    const ampollaMessage = document.querySelector('.ampolla-message h2');
    const ampollaText = document.querySelector('.ampolla-message p');
    if (ampollaMessage && ampollaText) {
      ampollaMessage.textContent = 'Nessuna lobby attiva';
      ampollaText.textContent = 'Non ci sono lobby attive. Aspetta la notifica per giocare!';
    }
  }

  private static async confirmAttendance(): Promise<void> {
    const confirmBtn = document.getElementById('confirm-btn') as HTMLButtonElement | null;
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '⏳';
    }
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/confirm-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: this.myPlayerId, subscription: localStorage.getItem('biliardino_subscription') })
      });
      if (!res.ok) throw new Error('Errore nella conferma');
      this.setState(this.AppState.CONFIRMED);
    } catch (err: any) {
      const errorTitle = document.getElementById('error-title');
      if (errorTitle) errorTitle.textContent = '❌ ' + (err.message || 'Errore nella conferma');
      this.setState(this.AppState.ERROR);
    }
  }

  private static showFishTooltip(fish: HTMLElement, message: string): void {
    const oldTooltip = fish.querySelector('.fish-tooltip');
    if (oldTooltip) oldTooltip.remove();
    const tooltip = document.createElement('div');
    tooltip.className = 'fish-tooltip';
    const randomColor = Math.floor(Math.random() * 5) + 1;
    tooltip.setAttribute('data-color', String(randomColor));
    tooltip.textContent = '';
    fish.appendChild(tooltip);
    let index = 0;
    const interval = setInterval(() => {
      if (index < message.length) {
        tooltip.textContent += message[index++];
      } else {
        clearInterval(interval);
        setTimeout(() => {
          tooltip.style.animation = 'tooltip-disappear 0.18s ease-out forwards';
          setTimeout(() => tooltip.remove(), 180);
        }, 2500);
      }
    }, 25);
  }

  private static async sendMessage(): Promise<void> {
    const textarea = document.getElementById('message-textarea') as HTMLInputElement | null;
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) return;
    // Limit to max 50 characters for simplicity and accessibility
    const errorEl = document.getElementById('chat-error') as HTMLElement | null;
    if (text.length > 50) {
      textarea.style.borderColor = '#ff4444';
      textarea.setAttribute('aria-invalid', 'true');
      if (errorEl) {
        errorEl.textContent = 'Massimo 50 caratteri';
        errorEl.style.display = 'block';
      }
      setTimeout(() => {
        textarea.style.borderColor = '';
        textarea.removeAttribute('aria-invalid');
        if (errorEl) {
          errorEl.textContent = '';
          errorEl.style.display = 'none';
        }
      }, 1500);
      return;
    }
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: this.myPlayerId, playerName: 'Giocatore', fishType: this.FISH_TYPES[0], text, sentAt: Date.now(), timestamp: new Date().toISOString() })
      });
      if (!res.ok) throw new Error('Errore invio messaggio');
      const myFish = this.fishMap.get(Number(this.myPlayerId)) || this.fishMap.get(this.myPlayerId);
      if (myFish) this.showFishTooltip(myFish, text);
      textarea.value = '';
    } catch (err) {
      // ignore for now
    }
  }

  private static setupChat(): void {
    // Bind submit handler to the chat form used after confirmation (#confirmed-msg)
    const form = document.getElementById('confirmed-msg') as HTMLFormElement | null;
    if (!form) return;
    const input = form.querySelector('#message-textarea') as HTMLInputElement | null;
    // Ensure the input references the inline error for assistive tech
    if (input) input.setAttribute('aria-describedby', 'chat-error');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendMessage();
      if (input) input.blur();
    });
  }
}

export default ConfirmView;
