import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { PlayerService } from './player.service';

export class EloService {
  public static readonly StartK = 60;
  public static readonly FinalK = 20;
  public static readonly MatchesK = 16; // 1 partita a settimana

  public static calculateEloChange(match: IMatch): { deltaA: number; deltaB: number; eloA: number; eloB: number; expA: number; expB: number; kA: number; kB: number } | null {
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

    const scoreA = goalsA > goalsB ? 1 : goalsA === goalsB ? 0.5 : 0;
    const scoreB = 1 - scoreA;

    const margin = EloService.marginMultiplier(Math.max(goalsA, goalsB), Math.min(goalsA, goalsB));

    const kA = EloService.getTeamK(teamAP1, teamAP2);

    const kB = EloService.getTeamK(teamBP1, teamBP2);

    const deltaA = kA * margin * (scoreA - expA);

    const deltaB = kB * margin * (scoreB - expB);

    return { deltaA, deltaB, eloA, eloB, expA, expB, kA, kB };
  }

  private static getPlayerK(matches: number): number {
    const firstMatchMultiplier = Math.max(0, (1 - (matches / EloService.MatchesK)) * (EloService.StartK - EloService.FinalK));
    return EloService.FinalK + firstMatchMultiplier;
  }

  private static getTeamK(p1: IPlayer, p2: IPlayer): number {
    return (EloService.getPlayerK(p1.matches) + EloService.getPlayerK(p2.matches)) / 2;
  }

  public static expectedScore(eloA: number, eloB: number): number {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  }

  private static marginMultiplier(goalsFor: number, goalsAgainst: number): number {
    const diff = goalsFor - goalsAgainst;
    return Math.sqrt(diff / 2 + 1) * (1 + diff / 8) / 1.3778379803155376;
    // return Math.sqrt(diff / 2 + 1) * (1 + diff / 11) / (Math.sqrt(1.5) * (1 + 1 / 11)); // se si vince a 11
    // return Math.log(3) + (Math.log(13) - Math.log(13 - diff)) * 3; // se si vince a 11
  }
}
