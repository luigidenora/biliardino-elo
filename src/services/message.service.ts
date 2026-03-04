import { IMessage, IMessagesResponse } from '@/models/message.interface';
import { LobbyService } from './lobby.service';
import { API_BASE_URL } from '@/config/env.config';


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
   * Carica i messaggi dalla lobby corrente (via LobbyService).
   * Il LobbyService mantiene lo stato sincronizzato tramite WebSocket.
   */
  static async getMessages(): Promise<IMessagesResponse> {
    const state = LobbyService.getState();
    if (state) {
      return { messages: state.messages, count: state.messageCount };
    }
    // Se LobbyService non è ancora inizializzato, forza un refresh
    await LobbyService.refresh();
    const fresh = LobbyService.getState();
    return { messages: fresh?.messages ?? [], count: fresh?.messageCount ?? 0 };
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
