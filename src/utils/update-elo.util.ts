import { IMatch } from '@/models/match.interface';
import { updateMatch } from '@/services/elo.service';
import { computeRanks, updatePlayer, updatePlayerRecords } from '@/services/player.service';

export function computeMatch(match: IMatch, computeStats: boolean): void {
  updateMatch(match);

  updatePlayer(match.teamA.defence, match.teamA.attack, match.teamB, 0, match);
  updatePlayer(match.teamA.attack, match.teamA.defence, match.teamB, 1, match);
  updatePlayer(match.teamB.defence, match.teamB.attack, match.teamA, 0, match);
  updatePlayer(match.teamB.attack, match.teamB.defence, match.teamA, 1, match);

  if (computeStats) {
    updatePlayerRecords(match.teamA.defence, 0);
    updatePlayerRecords(match.teamA.attack, 1);
    updatePlayerRecords(match.teamB.defence, 0);
    updatePlayerRecords(match.teamB.attack, 1);

    computeRanks();
  }
}
