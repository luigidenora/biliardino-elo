import { IMatch, IMatchDTO, IRunningMatchDTO } from '@/models/match.interface';
import { IPlayer, IPlayerDTO } from '@/models/player.interface';

export interface IRepository {
  updatePlayersHash(): Promise<void>;
  updateMatchesHash(): Promise<void>;
  getPlayersHash(): Promise<number>;
  getMatchesHash(): Promise<number>;
  fetchPlayers(): Promise<IPlayer[]>;
  fetchMatches(): Promise<IMatch[]>;
  saveMatch(match: IMatchDTO, merge?: boolean): Promise<void>;
  fetchMatchById(id: number): Promise<IMatchDTO | null>;
  parseMatchDTO(match: IMatchDTO): IMatch;
  saveRunningMatch(match: IRunningMatchDTO): Promise<void>;
  fetchRunningMatch(): Promise<IRunningMatchDTO | null>;
  clearRunningMatch(): Promise<void>;
  savePlayer(player: IPlayerDTO): Promise<void>;
  deletePlayer(id: number): Promise<void>;
}
