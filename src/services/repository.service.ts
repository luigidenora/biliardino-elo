import { IMatch, IMatchDTO, IRunningMatchDTO } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { db, MATCHES_COLLECTION, PLAYERS_COLLECTION, RUNNING_MATCH_COLLECTION } from '@/utils/firebase.util';
import { collection, deleteDoc, doc, DocumentData, getDoc, getDocFromCache, getDocFromServer, getDocsFromCache, getDocsFromServer, QuerySnapshot, setDoc } from 'firebase/firestore';

const CURRENT_RUNNING_MATCH = 'current';
const CACHE_CONTROL_COLLECTION = 'cache-control';
const CACHE_CONTROL_DOC = 'id';
const CACHE_HASH_KEY = 'firestore_cache_hash';

const useCache = await shouldUseCache();

async function getCacheHash(): Promise<string | null> {
  try {
    const ref = doc(collection(db, CACHE_CONTROL_COLLECTION), CACHE_CONTROL_DOC);
    const snap = await getDoc(ref);

    if (!snap.exists()) return null;

    const data = snap.data();
    return data?.hash || null;
  } catch (error) {
    console.error('Error fetching cache hash:', error);
    return null;
  }
}

function getStoredHash(): string | null {
  return localStorage.getItem(CACHE_HASH_KEY);
}

function setStoredHash(hash: string): void {
  localStorage.setItem(CACHE_HASH_KEY, hash);
}

async function shouldUseCache(): Promise<boolean> {
  const serverHash = await getCacheHash();
  const storedHash = getStoredHash();

  if (!serverHash) return false;

  const useCache = serverHash === storedHash;

  if (!useCache) {
    setStoredHash(serverHash);
  }

  return useCache;
}

export async function fetchPlayers(): Promise<IPlayer[]> {
  const snap = await getDocsCacheServer(PLAYERS_COLLECTION);

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
  const snap = await getDocsCacheServer(MATCHES_COLLECTION);
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
  const snap = await getDocCacheServer(RUNNING_MATCH_COLLECTION, CURRENT_RUNNING_MATCH);

  if (!snap?.exists()) return null;

  return snap.data() as IRunningMatchDTO;
}

export async function clearRunningMatch(): Promise<void> {
  const ref = doc(collection(db, RUNNING_MATCH_COLLECTION), CURRENT_RUNNING_MATCH);
  await deleteDoc(ref);
}

async function getDocsCacheServer(collectionName: string): Promise<QuerySnapshot<DocumentData, DocumentData>> {
  if (useCache) {
    console.log('cached fetch for collection:', collectionName);
    return await getDocsFromCache(collection(db, collectionName));
  }

  console.log('server fetch for collection:', collectionName);
  return await getDocsFromServer(collection(db, collectionName));
}

async function getDocCacheServer(collectionName: string, docId: string): Promise<DocumentData | null> {
  if (useCache) {
    console.log('cached fetch for doc:', collectionName, docId);
    return await getDocFromCache(doc(collection(db, collectionName), docId));
  }

  console.log('server fetch for doc:', collectionName, docId);
  return await getDocFromServer(doc(collection(db, collectionName), docId));
}
