/**
 * Environment configuration
 * Controls whether to use Firebase or mock data for development
 */
export const isDev = import.meta.env.DEV;
export const useMockData = true; // Usa sempre i mock data, anche in produzione

// Public environment variables (exposed to frontend)
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Base path for assets - automatically set by Vite based on config
export const BASE_PATH = import.meta.env.BASE_URL;
