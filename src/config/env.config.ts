/**
 * Environment configuration
 * Variabili pubbliche esposte al frontend
 */
export const VAPID_PUBLIC_KEY: string | null = import.meta.env.VITE_VAPID_PUBLIC_KEY;
export const API_BASE_URL: string | null = import.meta.env.VITE_API_BASE_URL;

// Base path for assets - automatically set by Vite based on config
export const BASE_PATH = import.meta.env.BASE_URL;
