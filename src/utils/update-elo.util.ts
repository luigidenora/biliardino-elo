import { IMatch } from '@/models/match.interface';
import { updateMatch } from '@/services/elo.service';
import { updatePlayer } from '@/services/player.service';

export function computeMatch(match: IMatch): void {
  updateMatch(match);

  const teamA = match.teamA;
  const teamB = match.teamB;
  const [deltaA, deltaB] = match.deltaELO;
  const [scoreA, scoreB] = match.score;

  updatePlayer(teamA.defence, teamA.attack, teamB.defence, teamB.attack, deltaA, 0, scoreA, scoreB, match);
  updatePlayer(teamA.attack, teamA.defence, teamB.defence, teamB.attack, deltaA, 1, scoreA, scoreB, match);
  updatePlayer(teamB.defence, teamB.attack, teamA.defence, teamA.attack, deltaB, 0, scoreB, scoreA, match);
  updatePlayer(teamB.attack, teamB.defence, teamA.defence, teamA.attack, deltaB, 1, scoreB, scoreA, match);
}
