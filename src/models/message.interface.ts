export interface IMessage {
  id: string;
  playerId: number;
  playerName: string;
  fishType: 'Squalo' | 'Barracuda' | 'Tonno' | 'Spigola' | 'Sogliola';
  text: string;
  sentAt: number;
  timestamp: string;
}

export interface IMessagesResponse {
  messages: IMessage[];
  count: number;
}
