import { IMatch, IMatchDTO, IRunningMatchDTO } from '@/models/match.interface';
import { IPlayer, IPlayerDTO } from '@/models/player.interface';

export const updatePlayersHash = async (): Promise<void> => {};
export const updateMatchesHash = async (): Promise<void> => {};
export const fetchPlayers = async (): Promise<IPlayer[]> => [];
export const fetchMatches = async (): Promise<IMatch[]> => [];
export const saveMatch = async (_match: IMatchDTO, _merge?: boolean): Promise<void> => {};
export const fetchMatchById = async (_id: number): Promise<IMatchDTO | null> => null;
export const parseMatchDTO = (_match: IMatchDTO): IMatch => null as any;
export const saveRunningMatch = async (_match: IRunningMatchDTO): Promise<void> => {};
export const fetchRunningMatch = async (): Promise<IRunningMatchDTO | null> => null;
export const clearRunningMatch = async (): Promise<void> => {};
export const savePlayer = async (_player: IPlayerDTO): Promise<void> => {};
export const deletePlayer = async (_id: number): Promise<void> => {};
