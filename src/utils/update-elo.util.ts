import { IMatch } from '@/models/match.interface';
import { EloService } from '@/services/elo.service';
import { PlayerService } from '@/services/player.service';

export function updateElo(match: IMatch, log = true): void {
  const { deltaA, deltaB, eloA, eloB, expA, expB } = EloService.calculateEloChange(match) ?? {};

  if (deltaA == null || deltaB == null) {
    return;
  }

  if (log) {
    console.log(Math.round(deltaA), Math.round(deltaB));
  }

  match.deltaELO = [deltaA!, deltaB!];
  match.teamELO = [eloA!, eloB!];
  match.expectedScore = [expA!, expB!];

  PlayerService.updateAfterMatch(match.teamA.defence, deltaA, true, match.score[0], match.score[1]);
  PlayerService.updateAfterMatch(match.teamA.attack, deltaA, false, match.score[0], match.score[1]);
  PlayerService.updateAfterMatch(match.teamB.defence, deltaB, true, match.score[1], match.score[0]);
  PlayerService.updateAfterMatch(match.teamB.attack, deltaB, false, match.score[1], match.score[0]);

  if (log) {
    const tap1 = PlayerService.getPlayerById(match.teamA.defence);
    const tap2 = PlayerService.getPlayerById(match.teamA.attack);
    const tbp1 = PlayerService.getPlayerById(match.teamB.defence);
    const tbp2 = PlayerService.getPlayerById(match.teamB.attack);

    console.log(tap1?.name, tap1?.elo, tap1?.matches);
    console.log(tap2?.name, tap2?.elo, tap2?.matches);
    console.log(tbp1?.name, tbp1?.elo, tbp1?.matches);
    console.log(tbp2?.name, tbp2?.elo, tbp2?.matches);
  }
}
