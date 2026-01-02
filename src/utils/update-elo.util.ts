import { IMatch } from '@/models/match.interface';
import { updateMatch } from '@/services/elo.service';
import { updatePlayer } from '@/services/player.service';

export function computeMatch(match: IMatch): void {
  updateMatch(match);

  const teamA = match.teamA;
  const teamB = match.teamB;
  const [deltaA, deltaB] = match.deltaELO;
  const [scoreA, scoreB] = match.score;

  updatePlayer(teamA.defence, teamA.attack, teamB.defence, teamB.attack, deltaA, true, scoreA, scoreB);
  updatePlayer(teamA.attack, teamA.defence, teamB.defence, teamB.attack, deltaA, false, scoreA, scoreB);
  updatePlayer(teamB.defence, teamB.attack, teamA.defence, teamA.attack, deltaB, true, scoreB, scoreA);
  updatePlayer(teamB.attack, teamB.defence, teamA.defence, teamA.attack, deltaB, false, scoreB, scoreA);
}
