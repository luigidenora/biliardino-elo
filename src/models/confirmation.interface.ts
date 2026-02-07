/**
 * Rappresenta una conferma di partecipazione salvata in Redis
 */
export interface IConfirmation {
  playerId: number;
  matchTime: string;
  confirmedAt: string;
  subscription?: unknown;
}

/**
 * Risposta dell'API get-confirmations
 */
export interface IConfirmationsResponse {
  count: number;
  confirmations: IConfirmation[];
}
