import { computeMatch } from '@/utils/update-elo.util';
import { IMatch, IMatchDTO, ITeam } from '../models/match.interface';
import { computeRanks, updateAllPlayerRecords } from './player.service';
import { fetchMatches, parseMatchDTO } from './repository.service';

let matches: IMatch[] = [];

try {
  await loadAllMatches();
  computeMatches();
} catch (e) { console.error('[match.service] Failed to load matches from Firebase:', e); }

export async function loadAllMatches(): Promise<void> {
  matches = await fetchMatches();
  matches.sort((a, b) => a.createdAt - b.createdAt);
}

export function getAllMatches(): IMatch[] {
  return matches;
}

export function addMatch(teamA: ITeam, teamB: ITeam, score: [number, number]): IMatchDTO {
  const lastId = Math.max(...matches.map(m => m.id));
  const id = Number.isFinite(lastId) ? lastId + 1 : 1;
  const matchDTO = { id, teamA, teamB, score, createdAt: Date.now() } satisfies IMatchDTO;
  const match = parseMatchDTO(matchDTO);

  matches.push(match);

  computeMatch(match, true);

  return matchDTO;
}

export function editMatch(id: number, teamA: ITeam, teamB: ITeam, score: [number, number]): IMatchDTO {
  const match = matches.find(m => m.id === id);

  if (!match) {
    throw new Error('Match to edit not found.');
  }

  match.teamA = teamA;
  match.teamB = teamB;
  match.score = score;

  return { id, teamA, teamB, score, createdAt: match.createdAt };
}

function computeMatches(): void {
  console.time('computeMatches');
  for (const match of matches) {
    computeMatch(match, false);
  }

  updateAllPlayerRecords();
  computeRanks();
  console.timeEnd('computeMatches');
}
