import { IMatch, IMatchDTO, IRunningMatchDTO } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { db, MATCHES_COLLECTION, PLAYERS_COLLECTION, RUNNING_MATCH_COLLECTION } from '@/utils/firebase.util';
import { collection, deleteDoc, doc, DocumentData, getDoc, getDocFromServer, getDocsFromCache, getDocsFromServer, QuerySnapshot, setDoc } from 'firebase/firestore';

const CURRENT_RUNNING_MATCH = 'current';
const CACHE_CONTROL_COLLECTION = 'cache-control';
const CACHE_CONTROL_DOC = 'id';
const CACHE_HASH_PLAYERS_KEY = 'firestore_cache_hash_players';
const CACHE_HASH_MATCHES_KEY = 'firestore_cache_hash_matches';

const { useCacheMatches, useCachePlayers } = await shouldUseCache();

async function fetchCacheHashes(): Promise<{ hashPlayers: number | null; hashMatches: number | null }> {
  try {
    const ref = doc(collection(db, CACHE_CONTROL_COLLECTION), CACHE_CONTROL_DOC);
    const snap = await getDoc(ref);

    if (!snap.exists()) return { hashPlayers: null, hashMatches: null };

    const data = snap.data();
    return {
      hashPlayers: data?.hashPlayers || null,
      hashMatches: data?.hashMatches || null
    };
  } catch (error) {
    console.error('Error fetching cache hashes:', error);
    return { hashPlayers: null, hashMatches: null };
  }
}

async function updateMatchesHash(): Promise<void> {
  try {
    const hashMatches = Math.random();
    const ref = doc(collection(db, CACHE_CONTROL_COLLECTION), CACHE_CONTROL_DOC);
    await setDoc(ref, { hashMatches }, { merge: true });
  } catch (error) {
    console.error('Error saving matches cache hash:', error);
  }
}

function getStoredHash(key: string): number | null {
  const stored = localStorage.getItem(CACHE_HASH_PLAYERS_KEY);
  return stored ? Number(stored) : null;
}

function setStoredHashPlayers(hash: number): void {
  localStorage.setItem(CACHE_HASH_PLAYERS_KEY, hash.toString());
}

function setStoredHashMatches(hash: number): void {
  localStorage.setItem(CACHE_HASH_MATCHES_KEY, hash.toString());
}

async function shouldUseCache(): Promise<{ useCachePlayers: boolean; useCacheMatches: boolean }> {
  const { hashMatches, hashPlayers } = await fetchCacheHashes();
  const storedHashPlayers = getStoredHash(CACHE_HASH_PLAYERS_KEY);
  const storedHashMatches = getStoredHash(CACHE_HASH_MATCHES_KEY);

  const useCachePlayers = hashPlayers != null && hashPlayers === storedHashPlayers;

  if (!useCachePlayers) {
    setStoredHashPlayers(hashPlayers!);
  }

  const useCacheMatches = hashMatches != null && hashMatches === storedHashMatches;

  if (!useCacheMatches) {
    setStoredHashMatches(hashMatches!);
  }

  return { useCachePlayers, useCacheMatches };
}

export async function fetchPlayers(): Promise<IPlayer[]> {
  const snap = await getDocsCacheServer(PLAYERS_COLLECTION, useCachePlayers);

  const players = snap.docs.map((d) => {
    const data = d.data() as IPlayer;

    return {
      id: Number.parseInt(d.id),
      name: data.name,
      elo: data.elo,
      startElo: data.elo,
      defence: data.defence / 100,
      matches: 0,
      bestElo: -1,
      goalsAgainst: 0,
      goalsFor: 0,
      matchesAsAttacker: 0,
      matchesAsDefender: 0,
      matchesDelta: [],
      wins: 0,
      rank: -1
    } satisfies IPlayer;
  });

  return players;
}

export async function fetchMatches(): Promise<IMatch[]> {
  const snap = await getDocsCacheServer(MATCHES_COLLECTION, useCacheMatches);
  const matches: IMatch[] = [];

  snap.docs.forEach((d) => {
    const data = d.data() as IMatch;
    const id = Number.parseInt(d.id);

    if (Number.isNaN(id)) return;

    matches.push({
      id,
      teamA: data.teamA,
      teamB: data.teamB,
      score: data.score,
      createdAt: data.createdAt,
      deltaELO: [-1, -1],
      expectedScore: [-1, -1],
      teamELO: [-1, -1],
      teamAELO: [-1, -1],
      teamBELO: [-1, -1]
    });
  });

  return matches;
}

export async function saveMatch(match: IMatchDTO): Promise<void> {
  const ref = doc(collection(db, MATCHES_COLLECTION), match.id.toString());
  await setDoc(ref, match, { merge: true });
  await updateMatchesHash();
}

export function parseMatchDTO(match: IMatchDTO): IMatch {
  return {
    id: match.id,
    teamA: match.teamA,
    teamB: match.teamB,
    score: match.score,
    createdAt: match.createdAt,
    deltaELO: [-1, -1],
    expectedScore: [-1, -1],
    teamELO: [-1, -1],
    teamAELO: [-1, -1],
    teamBELO: [-1, -1]
  };
}

export async function saveRunningMatch(match: IRunningMatchDTO): Promise<void> {
  const ref = doc(collection(db, RUNNING_MATCH_COLLECTION), CURRENT_RUNNING_MATCH);
  await setDoc(ref, match, { merge: true });
}

export async function fetchRunningMatch(): Promise<IRunningMatchDTO | null> {
  const snap = await getDocFromServer(doc(collection(db, RUNNING_MATCH_COLLECTION), CURRENT_RUNNING_MATCH));

  if (!snap?.exists()) return null;

  return snap.data() as IRunningMatchDTO;
}

export async function clearRunningMatch(): Promise<void> {
  const ref = doc(collection(db, RUNNING_MATCH_COLLECTION), CURRENT_RUNNING_MATCH);
  await deleteDoc(ref);
}

async function getDocsCacheServer(collectionName: string, useCache: boolean): Promise<QuerySnapshot<DocumentData, DocumentData>> {
  if (useCache) {
    console.log('cached fetch for collection:', collectionName);
    return await getDocsFromCache(collection(db, collectionName));
  }

  console.log('server fetch for collection:', collectionName);
  return await getDocsFromServer(collection(db, collectionName));
}
