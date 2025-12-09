import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { PlayerService } from './player.service';

export class EloService {
  public static getDelta(match: IMatch): { deltaA: number; deltaB: number } | null {
    const teamAP1 = PlayerService.getPlayerById(match.teamA.defence);
    const teamAP2 = PlayerService.getPlayerById(match.teamA.attack);

    const teamBP1 = PlayerService.getPlayerById(match.teamB.defence);
    const teamBP2 = PlayerService.getPlayerById(match.teamB.attack);

    if (!teamAP1 || !teamAP2 || !teamBP1 || !teamBP2) {
      return null;
    }

    const goalsA = match.score[0];
    const goalsB = match.score[1];

    const eloA = (teamAP1.elo + teamAP2.elo) / 2;
    const eloB = (teamBP1.elo + teamBP2.elo) / 2;

    const expA = EloService.expectedScore(eloA, eloB);
    const expB = 1 - expA;

    const scoreA = goalsA > goalsB ? 1 : 0;
    const scoreB = 1 - scoreA;

    const margin = EloService.marginMultiplier(Math.max(goalsA, goalsB), Math.min(goalsA, goalsB));

    const kA = EloService.getTeamK(teamAP1, teamAP2);

    const kB = EloService.getTeamK(teamBP1, teamBP2);

    const deltaA = kA * margin * (scoreA - expA);

    const deltaB = kB * margin * (scoreB - expB);

    return { deltaA, deltaB };
  }

  private static getPlayerK(matches: number): number {
    return matches < 10 ? 30 : 15;
  }

  private static getTeamK(p1: IPlayer, p2: IPlayer): number {
    return (EloService.getPlayerK(p1.matches) + EloService.getPlayerK(p2.matches)) / 2;
  }

  private static expectedScore(eloA: number, eloB: number): number {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  }

  private static marginMultiplier(goalsFor: number, goalsAgainst: number): number {
    const diff = goalsFor - goalsAgainst;
    return Math.log(diff + 1);
  }
}
