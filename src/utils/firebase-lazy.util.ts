import { Firestore } from 'firebase/firestore';

/**
 * Lazy-loaded Firebase utilities
 * These are only imported when Firebase is actually being used (production mode)
 */

let _db: Firestore | null = null;
let _MATCHES_COLLECTION: string;
let _PLAYERS_COLLECTION: string;
let _RUNNING_MATCH_COLLECTION: string;

/**
 * Initialize and get Firestore instance
 * Should only be called in production mode
 */
export async function getDb(): Promise<Firestore> {
  if (!_db) {
    const { db, MATCHES_COLLECTION, PLAYERS_COLLECTION, RUNNING_MATCH_COLLECTION } = await import('@/utils/firebase.util');
    if (!db) throw new Error('Firebase not initialized');
    _db = db;
    _MATCHES_COLLECTION = MATCHES_COLLECTION;
    _PLAYERS_COLLECTION = PLAYERS_COLLECTION;
    _RUNNING_MATCH_COLLECTION = RUNNING_MATCH_COLLECTION;
  }
  return _db;
}

export async function getCollections() {
  await getDb(); // Ensure initialized
  return {
    MATCHES_COLLECTION: _MATCHES_COLLECTION,
    PLAYERS_COLLECTION: _PLAYERS_COLLECTION,
    RUNNING_MATCH_COLLECTION: _RUNNING_MATCH_COLLECTION
  };
}
