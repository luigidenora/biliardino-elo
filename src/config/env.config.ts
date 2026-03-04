/**
 * Environment configuration
 * Variabili pubbliche esposte al frontend
 */
export const VAPID_PUBLIC_KEY: string | null = import.meta.env.VITE_VAPID_PUBLIC_KEY;
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '/api';

// Upstash Pub/Sub (real-time lobby events via WebSocket)
export const UPSTASH_PUBSUB_URL: string = import.meta.env.VITE_UPSTASH_PUBSUB_URL || 'wss://pubsub.upstash.com/v1/websocket';
export const UPSTASH_PUBSUB_TOKEN: string | undefined = import.meta.env.VITE_UPSTASH_PUBSUB_TOKEN;

// Base path for assets - automatically set by Vite based on config
export const BASE_PATH = import.meta.env.BASE_URL;
