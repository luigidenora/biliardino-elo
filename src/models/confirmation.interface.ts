/**
 * Rappresenta una conferma di partecipazione salvata in Redis
 */
export interface IConfirmation {
  playerId: number;
  confirmedAt: string;
  subscription?: unknown;
}

/**
 * Risposta dell'API lobby-state (sezione conferme)
 */
export interface IConfirmationsResponse {
  count: number;
  confirmations: IConfirmation[];
}
