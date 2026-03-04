/**
 * Environment configuration
 * Variabili pubbliche esposte al frontend
 */
export const VAPID_PUBLIC_KEY: string | null = import.meta.env.VITE_VAPID_PUBLIC_KEY;
// The frontend may be deployed separately from the API (GitHub Pages, previews, etc.).
//
// 1. In dev mode we just hit the local Vite server (`/api`).
// 2. When running on Vercel the platform exposes VERCEL_URL which reflects the
//    current deployment (production or preview).  We use that hostname and
//    append `/api` so the client always talks to the *matching* backend instead
//    of accidentally calling production from a preview build.
//
// No manual override is required because we host both frontend and functions
// in the same Vercel project.  Preview builds will therefore automatically
// target their own staging backend.
const generateBaseUrl = (): string => {
  const vercel = import.meta.env.VERCEL_URL;
  if (vercel) {
    // VERCEL_URL comes without protocol (e.g. "my-site-pj1.vercel.app").
    return `https://${vercel}/api`;
  }

  // Fallback for local dev or unknown environments
  return '/api';
};

export const API_BASE_URL: string = generateBaseUrl();

// Upstash Pub/Sub (real-time lobby events via WebSocket)
export const UPSTASH_PUBSUB_URL: string = import.meta.env.VITE_UPSTASH_PUBSUB_URL || 'wss://pubsub.upstash.com/v1/websocket';
export const UPSTASH_PUBSUB_TOKEN: string | undefined = import.meta.env.VITE_UPSTASH_PUBSUB_TOKEN;

// Base path for assets - automatically set by Vite based on config
export const BASE_PATH = import.meta.env.BASE_URL;
