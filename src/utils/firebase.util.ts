import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';

/**
 * Firebase project configuration used by the web application.
 *
 * Values are provided by Firebase and identify the project as well
 * as enable access to Firestore and other Firebase services.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

/**
 * Root Firebase application instance initialized with the project configuration.
 * In dev mode (__DEV_MODE__) è null — Firebase non viene inizializzato.
 */
let app: FirebaseApp | null = null;
if (!__DEV_MODE__) {
  app = initializeApp(firebaseConfig);
}

/**
 * Firestore database instance bound to the initialized Firebase app.
 * Used by the repository code to read and write collections.
 */
export const db: Firestore | null = (!__DEV_MODE__ && app)
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    })
  : null;

/**
 * Firebase Authentication instance for the current app.
 * Used to authenticate predefined users via email (username) and password.
 */
export const AUTH: Auth | null = (!__DEV_MODE__ && app) ? getAuth(app) : null;

/**
 * Firestore collection name used to persist and retrieve match documents.
 */
export const MATCHES_COLLECTION = 'matchesShark';

/**
 * Firestore collection name used to persist and retrieve player documents.
 */
export const PLAYERS_COLLECTION = 'playersShark';

/**
 * Firestore collection name used to persist the currently generated matchmaking proposal.
 */
export const RUNNING_MATCH_COLLECTION = 'runningMatch';

/**
 * Signs in a predefined user using email and password authentication.
 *
 * @param email - The user's email address.
 * @param password - The user's password.
 * @returns A Promise that resolves with the authenticated Firebase user credentials.
 * @throws FirebaseError if authentication fails (invalid credentials, user not found, etc.).
 */
export async function login(email: string, password: string): Promise<any> {
  if (__DEV_MODE__) {
    console.log('[MOCK] Login attempt with email:', email);
    return Promise.resolve({
      user: { uid: 'mock-user-id', email, displayName: 'Mock User' }
    });
  }

  if (!AUTH) {
    throw new Error('Firebase Auth is not initialized');
  }

  return signInWithEmailAndPassword(AUTH, email, password);
}
