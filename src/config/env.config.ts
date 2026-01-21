/**
 * Environment configuration
 * Controls whether to use Firebase or mock data for development
 */
export const isDev = import.meta.env.DEV;
export const useMockData = true; // Usa sempre i mock data, anche in produzione

// Public environment variables (exposed to frontend)
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BOUHmi8SrZME9HKSAyqwKpTSiW1BATEoejeFqSzCUkxa718VNmx6ATtiUbi4YmCl-eAQC6kndhXCP-vZl9QHfpE';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
