import { IMessage, IMessagesResponse } from '@/models/message.interface';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class MessageService {
  /**
   * Invia un messaggio durante il confirmation
   */
  static async sendMessage(
    playerId: number,
    playerName: string,
    fishType: string,
    text: string
  ): Promise<IMessage> {
    const res = await fetch(`${API_BASE_URL}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId,
        playerName,
        fishType,
        text,
        sentAt: Date.now(),
        timestamp: new Date().toISOString()
      })
    });

    if (!res.ok) {
      throw new Error(`Errore invio messaggio: ${res.statusText}`);
    }

    return res.json();
  }

  /**
   * Carica i messaggi per una partita
   */
  static async getMessages(since?: number): Promise<IMessagesResponse> {
    const url = new URL(`${API_BASE_URL}/lobby-state`);

    const res = await fetch(url.toString());

    if (!res.ok) {
      throw new Error(`Errore caricamento messaggi: ${res.statusText}`);
    }

    const data = await res.json();
    return { messages: data.messages, count: data.messageCount };
  }

  /**
   * Cancella i messaggi di una partita (solo per admin)
   */
  static async clearMessages(token: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${API_BASE_URL}/admin-cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      throw new Error(`Errore cancellazione messaggi: ${res.statusText}`);
    }

    return res.json();
  }
}
