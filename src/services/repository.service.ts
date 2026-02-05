import { useMockData } from '@/config/env.config';

// Use mock repository in dev mode, real Firebase in production
import * as mockRepo from './repository.mock';

// Dynamically import Firebase only in production to avoid loading Firebase dependencies in dev
const firebaseRepo = useMockData ? null : await import('./repository.firebase.js');

// Re-export the appropriate implementation based on environment
const repo = useMockData ? mockRepo : firebaseRepo!;

export const updatePlayersHash = repo.updatePlayersHash;
export const updateMatchesHash = repo.updateMatchesHash;
export const fetchPlayers = repo.fetchPlayers;
export const fetchMatches = repo.fetchMatches;
export const saveMatch = repo.saveMatch;
export const parseMatchDTO = repo.parseMatchDTO;
export const saveRunningMatch = repo.saveRunningMatch;
export const fetchRunningMatch = repo.fetchRunningMatch;
export const clearRunningMatch = repo.clearRunningMatch;
export const savePlayer = repo.savePlayer;
export const deletePlayer = repo.deletePlayer;

// Log which repository we're using
console.log(`[Repository] Using ${useMockData ? 'MOCK' : 'FIREBASE'} data source`);
