/**
 * Haptics Utility — Wrapper around web-haptics for tactile feedback
 *
 * Provides vibration patterns for game events and user interactions.
 * Gracefully degrades on unsupported devices.
 *
 * Usage:
 *   import { triggerImpact } from '@/utils/haptics.util';
 *   triggerImpact('strong');
 */

// Import web-haptics if available
let haptics: any = null;

// Try to import web-haptics dynamically
try {
  // eslint-disable-next-line import/no-unresolved
  import('web-haptics').then((module) => {
    haptics = module.default || module;
  }).catch(() => {
    // Silently fail if web-haptics is not available
    haptics = null;
  });
} catch {
  haptics = null;
}

export type HapticIntensity = 'light' | 'medium' | 'strong';

/**
 * Check if the device supports haptics.
 * Falls back to Vibration API if web-haptics is unavailable.
 */
function isHapticsSupported(): boolean {
  return haptics !== null || (typeof navigator !== 'undefined' && 'vibrate' in navigator);
}

/**
 * Trigger an impact haptic pattern.
 *
 * @param intensity - Vibration intensity ('light', 'medium', 'strong')
 * Default: 'medium'
 *
 * Vibration patterns (milliseconds):
 * - light: 20ms
 * - medium: 40ms (default)
 * - strong: 80ms
 */
export function triggerImpact(intensity: HapticIntensity = 'medium'): void {
  if (!isHapticsSupported()) {
    return; // Silently ignore on unsupported devices
  }

  try {
    const duration = getImpactDuration(intensity);

    if (haptics && typeof haptics.vibrate === 'function') {
      // Use web-haptics if available
      haptics.vibrate(duration);
    } else if (navigator.vibrate) {
      // Fallback to Vibration API
      navigator.vibrate(duration);
    }
  } catch {
    // Silently fail on any error
  }
}

/**
 * Get vibration duration in milliseconds based on intensity.
 */
function getImpactDuration(intensity: HapticIntensity): number {
  switch (intensity) {
    case 'light':
      return 20;
    case 'medium':
      return 40;
    case 'strong':
      return 80;
    default:
      return 40;
  }
}

/**
 * Trigger a double-tap haptic pattern (success).
 *
 * Pattern: tap (40ms) → pause (50ms) → tap (40ms)
 */
export function triggerSuccess(): void {
  if (!isHapticsSupported()) {
    return;
  }

  try {
    if (haptics && typeof haptics.vibrate === 'function') {
      haptics.vibrate([40, 50, 40]);
    } else if (navigator.vibrate) {
      navigator.vibrate([40, 50, 40]);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Trigger an error haptic pattern (warning).
 *
 * Pattern: rapid taps (30ms each, 20ms pause)
 */
export function triggerError(): void {
  if (!isHapticsSupported()) {
    return;
  }

  try {
    if (haptics && typeof haptics.vibrate === 'function') {
      haptics.vibrate([30, 20, 30, 20, 30]);
    } else if (navigator.vibrate) {
      navigator.vibrate([30, 20, 30, 20, 30]);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Cancel any ongoing vibration.
 */
export function cancelHaptics(): void {
  try {
    if (haptics && typeof haptics.vibrate === 'function') {
      haptics.vibrate(0);
    } else if (navigator.vibrate) {
      navigator.vibrate(0);
    }
  } catch {
    // Silently fail
  }
}
