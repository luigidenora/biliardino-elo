type AvailabilityEvent = {
  playerId: number;
  confirmedAt?: string;
  [key: string]: any;
};

export class AvailabilitySubscriber {
  private ws: WebSocket | null = null;
  private listeners: Array<(ev: AvailabilityEvent) => void> = [];
  private topic = 'availability_events';
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = true;
  private reconnectTimer: number | null = null;

  connect(): void {
    const env = (import.meta as any).env || {};
    const url = env.VITE_UPSTASH_PUBSUB_URL || 'wss://pubsub.upstash.com/v1/websocket';
    const token = env.VITE_UPSTASH_PUBSUB_TOKEN;

    if (!token) {
      console.warn('AvailabilitySubscriber: VITE_UPSTASH_PUBSUB_TOKEN non configurato, disabilito subscribe');
      return;
    }

    const wsUrl = `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      console.warn('AvailabilitySubscriber: WebSocket init failed', e);
      return;
    }

    this.ws.addEventListener('open', () => {
      this.reconnectDelay = 1000; // reset backoff
      try {
        this.ws?.send(JSON.stringify({ type: 'subscribe', topic: this.topic }));
        console.log('AvailabilitySubscriber: subscribed to', this.topic);
      } catch (e) {
        console.warn('AvailabilitySubscriber: subscribe failed', e);
      }
    });

    this.ws.addEventListener('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.data as string);
        // Upstash Pub/Sub messages commonly have { type: 'message', topic, data }
        let payload: any = null;
        if (parsed && typeof parsed === 'object' && parsed.data) {
          try { payload = JSON.parse(parsed.data); } catch { payload = parsed.data; }
        } else {
          payload = parsed;
        }

        if (payload) {
          this.listeners.forEach(l => l(payload));
        }
      } catch (e) {
        console.warn('AvailabilitySubscriber: message parse error', e);
      }
    });

    this.ws.addEventListener('error', (e) => {
      console.warn('AvailabilitySubscriber: websocket error', e);
    });

    this.ws.addEventListener('close', () => {
      console.log('AvailabilitySubscriber: websocket closed');
      this.ws = null;
      if (this.shouldReconnect) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    console.log(`AvailabilitySubscriber: reconnect in ${delay}ms`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelay = Math.min(this.maxReconnectDelay, this.reconnectDelay * 2);
    }, delay) as unknown as number;
  }

  onMessage(cb: (ev: AvailabilityEvent) => void): void {
    this.listeners.push(cb);
  }

  close(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer as number);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch (e) {
      // ignore
    }
    this.ws = null;
    this.listeners = [];
  }
}

export default AvailabilitySubscriber;
