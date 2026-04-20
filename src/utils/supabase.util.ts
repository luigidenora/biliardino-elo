import { createClient } from '@supabase/supabase-js';
import { ITeam } from '@/models/match.interface';

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
  await supabase.auth.signOut();
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
