/**
 * Haptics System — Usage Examples
 *
 * Copy and paste these examples into your components to use haptic feedback.
 */

import { cancelHaptics, triggerError, triggerImpact, triggerSuccess } from '@/utils/haptics.util';

// ─────────────────────────────────────────────────────────────────
// Example 1: Simple impact feedback (most common)
// ─────────────────────────────────────────────────────────────────

function onButtonClick(): void {
  // Light vibration for subtle feedback
  triggerImpact('light');
}

function onKickAnimation(): void {
  // Strong vibration for high-impact events
  triggerImpact('strong');
}

function onPlayerConfirmation(): void {
  // Medium vibration for confirmation actions
  triggerImpact('medium');
}

// ─────────────────────────────────────────────────────────────────
// Example 2: Success pattern (double-tap)
// ─────────────────────────────────────────────────────────────────

async function triggerSuccessPattern(): Promise<void> {
  triggerSuccess(); // Double-tap: 40ms → 50ms pause → 40ms
}

// ─────────────────────────────────────────────────────────────────
// Example 3: Error pattern (rapid taps)
// ─────────────────────────────────────────────────────────────────

async function triggerErrorPattern(): Promise<void> {
  triggerError(); // Five rapid taps: 30ms → 20ms pause (x4)
}

// ─────────────────────────────────────────────────────────────────
// Example 4: Cancel ongoing vibration
// ─────────────────────────────────────────────────────────────────

function stopVibration(): void {
  cancelHaptics(); // Cancel any ongoing vibration
}

// ─────────────────────────────────────────────────────────────────
// Example 5: Integration in game events
// ─────────────────────────────────────────────────────────────────

export function setupHapticFeedback(): void {
  // Kick button feedback
  const kickBtn = document.getElementById('broadcast-btn');
  kickBtn?.addEventListener('click', () => {
    triggerImpact('strong'); // Strong impact on kick
  });

  // Confirm button feedback
  const confirmBtn = document.getElementById('confirm-btn');
  confirmBtn?.addEventListener('click', () => {
    triggerImpact('medium'); // Medium impact on confirmation
  });
}

// ─────────────────────────────────────────────────────────────────
// Example 6: Context (in browser console for testing)
// ─────────────────────────────────────────────────────────────────

/*
To test in browser console:

import { triggerImpact, triggerSuccess, triggerError } from '@/utils/haptics.util';

// Test impact patterns
triggerImpact('light');   // Light tap
triggerImpact('medium');  // Medium impact
triggerImpact('strong');  // Strong impact

// Test patterns
triggerSuccess();  // Double-tap pattern
triggerError();    // Error pattern (rapid taps)

// Test with delay
setTimeout(() => triggerImpact('strong'), 1000);
*/

// ─────────────────────────────────────────────────────────────────
// Pattern Reference
// ─────────────────────────────────────────────────────────────────

/*
Intensity Levels:
  - light:   20ms  → Subtle confirmation (button presses, selections)
  - medium:  40ms  → Standard feedback (confirmations, state changes)
  - strong:  80ms  → Impactful events (kicks, wins, major actions)

Pattern Functions:
  - triggerImpact(intensity)  → Single pulse with specified intensity
  - triggerSuccess()          → Double-tap pattern (success celebration)
  - triggerError()            → Five rapid taps (error/warning)
  - cancelHaptics()           → Stop any ongoing vibration

Browser Compatibility:
  - Automatically detects device support
  - Falls back to Vibration API if web-haptics unavailable
  - Silently ignores on unsupported devices (desktop browsers)
  - No errors thrown on failure
*/
