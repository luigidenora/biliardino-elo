import { IMatch } from '@/models/match.interface';
import { updateMatch } from '@/services/elo.service';
import { computeRanks, getPlayerById, getPlayerRanges, updatePlayer, updatePlayerRecords } from '@/services/player.service';

export function computeMatch(match: IMatch, computeStats: boolean): void {
  if (!updateMatch(match)) return;

  if (match.score[0] !== 8 && match.score[1] !== 8) return;
  if (!getPlayerById(match.teamA.defence) || !getPlayerById(match.teamA.attack) || !getPlayerById(match.teamB.defence) || !getPlayerById(match.teamB.attack)) return;

  updatePlayer(match.teamA.defence, match.teamA.attack, match.teamB, 0, match);
  updatePlayer(match.teamA.attack, match.teamA.defence, match.teamB, 1, match);
  updatePlayer(match.teamB.defence, match.teamB.attack, match.teamA, 0, match);
  updatePlayer(match.teamB.attack, match.teamB.defence, match.teamA, 1, match);

  if (computeStats) {
    const ranges = getPlayerRanges();

    updatePlayerRecords(match.teamA.defence, 0, ranges);
    updatePlayerRecords(match.teamA.attack, 1, ranges);
    updatePlayerRecords(match.teamB.defence, 0, ranges);
    updatePlayerRecords(match.teamB.attack, 1, ranges);

    computeRanks('rank');
  }
}
