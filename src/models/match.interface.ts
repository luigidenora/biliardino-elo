export interface IMatchDTO {
  id: number;
  teamA: ITeam;
  teamB: ITeam;
  score: [number, number];
  createdAt: number;
}

export interface IMatch extends IMatchDTO {
  expectedScore: [number, number];
  teamAELO: [number, number];
  teamBELO: [number, number];
  teamELO: [number, number];
  deltaELO: [number, number];
}

export interface ITeam {
  defence: number;
  attack: number;
}
