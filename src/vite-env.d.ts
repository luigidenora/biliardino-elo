/// <reference types="vite/client" />

/**
 * Costante compile-time iniettata dal plugin devModePlugin.
 * `true` solo quando VITE_DEV_MODE=true è impostato.
 * In produzione viene sostituita con `false` e tutto il codice dev viene eliminato.
 */
declare const __DEV_MODE__: boolean;

/**
 * Provider DB compile-time iniettato dal plugin dbProviderPlugin.
 * Valori: 'firebase' | 'supabase' | 'mock'
 * Rollup elimina dal bundle le implementazioni non usate (dead-code elimination).
 */
declare const __DB_PROVIDER__: 'firebase' | 'supabase' | 'mock';

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_VAPID_PUBLIC_KEY: string;
  readonly VITE_API_BASE_URL: string;

  /** DB provider: 'firebase' (default) | 'supabase' | 'mock' */
  readonly VITE_DB?: 'firebase' | 'supabase' | 'mock';

  /** Supabase — usati solo se VITE_DB=supabase */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
