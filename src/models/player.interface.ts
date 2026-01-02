export interface IPlayerDTO {
  id: number;
  name: string;
  elo: number;
  defence: number;
}

export interface IPlayer extends IPlayerDTO {
  matches: number;
  matchesAsDefender: number;
  matchesAsAttacker: number;
  wins: number;
  matchesDelta: number[];
  goalsFor: number;
  goalsAgainst: number;
  bestElo: number;
  rank: number;
  teammatesDelta?: Map<number, number>;
  teammatesMatchCount?: Map<number, number>;
  opponentsMatchCount?: Map<number, number>;
}
