import type { IRunningMatchDTO } from '@/models/match.interface';
import { ITeam } from '@/models/match.interface';
import { createClient } from '@supabase/supabase-js';

export type LobbyEnv = 'production' | 'preview';

export const LOBBY_ENV: LobbyEnv
  = import.meta.env.VITE_VERCEL_ENV === 'production' ? 'production' : 'preview';

export type Database = {
  public: {
    Tables: {
      playersShark: {
        Row: { id: string; name: string; role: -1 | 0 | 1 };
        Insert: { id: string; name: string; role: -1 | 0 | 1 };
        Update: { name?: string; role?: -1 | 0 | 1 };
      };
      matchesShark: {
        Row: {
          id: number;
          teamA: ITeam;
          teamB: ITeam;
          score: [number, number];
          createdAt: number;
          firestore_id: string;
        };
        Insert: {
          id: number;
          teamA: ITeam;
          teamB: ITeam;
          score: [number, number];
          createdAt: number;
          firestore_id?: string;
        };
        Update: {
          teamA?: ITeam;
          teamB?: ITeam;
          score?: [number, number];
          createdAt?: number;
        };
      };
      'cache-control': {
        Row: { firestore_id: string; hashPlayers: number | null; hashMatches: number | null };
        Insert: { firestore_id: string; hashPlayers?: number | null; hashMatches?: number | null };
        Update: { hashPlayers?: number | null; hashMatches?: number | null };
      };
      lobbies: {
        Row: {
          lobby_id: string;
          created_at: string;
          created_by_email: string | null;
          status: 'waiting' | 'closed';
          expires_at: string | null;
          duration_seconds: number | null;
          match: IRunningMatchDTO | null;
          environment: LobbyEnv;
        };
        Insert: {
          lobby_id?: string;
          created_at?: string;
          created_by_email?: string | null;
          status?: 'waiting' | 'closed';
          expires_at?: string | null;
          duration_seconds?: number | null;
          match?: IRunningMatchDTO | null;
          environment?: LobbyEnv;
        };
        Update: { status?: 'waiting' | 'closed'; expires_at?: string | null; match?: IRunningMatchDTO | null };
      };
      lobby_confirmations: {
        Row: { player_id: number; lobby_id: string; confirmed_at: string; fish_name: string | null };
        Insert: { player_id: number; lobby_id: string; confirmed_at?: string; fish_name?: string | null };
        Update: { fish_name?: string | null };
      };
      lobby_messages: {
        Row: {
          id: string;
          lobby_id: string;
          player_id: number;
          player_name: string;
          fish_type: string;
          text: string;
          sent_at: number;
          created_at: string;
        };
        Insert: {
          lobby_id: string;
          player_id: number;
          player_name: string;
          fish_type?: string;
          text: string;
          sent_at: number;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
    };
  };
};

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function login(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}

export function onAuthStateChange(callback: (isLoggedIn: boolean) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(!!session?.user);
  });
  return () => subscription.unsubscribe();
}

export async function isLoggedIn(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session?.user;
}
