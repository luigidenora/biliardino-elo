/**
 * Particle System — Usage Examples
 *
 * Copy and paste these examples into your components to use the particle effects.
 */

import { createParticles, EmojiOption } from '@/app/particles/particles-manager';

// ─────────────────────────────────────────────────────────────────
// Example 1: Simple victory celebration
// ─────────────────────────────────────────────────────────────────

function celebrateVictory(x: number, y: number): void {
  const victoryEmojis: EmojiOption[] = [
    { emoji: '🎯', canFlip: false },
    { emoji: '✨', canFlip: false },
    { emoji: '🔥', canFlip: false },
    { emoji: '🏆', canFlip: false }
  ];

  createParticles(x, y, victoryEmojis);
}

// ─────────────────────────────────────────────────────────────────
// Example 2: Player eliminated / knockout
// ─────────────────────────────────────────────────────────────────

function celebrateKnockout(x: number, y: number): void {
  const knockoutEmojis: EmojiOption[] = [
    { emoji: '💥', canFlip: false },
    { emoji: '⚡', canFlip: false },
    { emoji: '🌟', canFlip: false }
  ];

  createParticles(x, y, knockoutEmojis, 800); // 800ms duration
}

// ─────────────────────────────────────────────────────────────────
// Example 3: Skill shot / Perfect strike
// ─────────────────────────────────────────────────────────────────

function celebratePerfectStrike(x: number, y: number): void {
  const perfectEmojis: EmojiOption[] = [
    { emoji: '💎', canFlip: false },
    { emoji: '⭐', canFlip: false },
    { emoji: '✨', canFlip: false }
  ];

  // With downward gravity for falling confetti effect
  createParticles(x, y, perfectEmojis, 600, 0, 1);
}

// ─────────────────────────────────────────────────────────────────
// Example 4: Multi-point hit / Combo
// ─────────────────────────────────────────────────────────────────

function celebrateCombo(x: number, y: number, multiplier: number): void {
  const comboEmojis: EmojiOption[] = [
    { emoji: '🎪', canFlip: false },
    { emoji: '🎊', canFlip: false },
    { emoji: '🎉', canFlip: false }
  ];

  // More duration = more bursts for bigger combo
  const duration = Math.min(multiplier * 150, 1500);
  createParticles(x, y, comboEmojis, duration);
}

// ─────────────────────────────────────────────────────────────────
// Example 5: Using in event listeners
// ─────────────────────────────────────────────────────────────────

export function setupParticleEffects(): void {
  // Button click example
  const victoryBtn = document.getElementById('victory-button');
  victoryBtn?.addEventListener('click', () => {
    const rect = victoryBtn.getBoundingClientRect();
    celebrateVictory(rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  // Click anywhere on screen
  document.addEventListener('click', (e) => {
    // Uncomment to test with any click
    createParticles(e.clientX, e.clientY, [{ emoji: '✨', canFlip: false }]);
  });
}

// ─────────────────────────────────────────────────────────────────
// Example 6: Context (in browser console)
// ─────────────────────────────────────────────────────────────────

/*
To test in browser console:

import { createParticles } from '@/app/particles/particles-manager';

// Test at center of screen
const x = window.innerWidth / 2;
const y = window.innerHeight / 2;

// Victory
createParticles(x, y, [
  { emoji: '🎯', canFlip: false },
  { emoji: '✨', canFlip: false }
]);

// With duration (continuous bursts)
createParticles(x, y, [
  { emoji: '🔥', canFlip: false }
], 1000);

// With custom gravity (falling effect)
createParticles(x, y, [
  { emoji: '❄️', canFlip: false },
  { emoji: '⛄', canFlip: false }
], 0, 0, 2);

// Multi emoji
createParticles(x, y, [
  { emoji: '🎊', canFlip: false },
  { emoji: '🎉', canFlip: false },
  { emoji: '✨', canFlip: false },
  { emoji: '🌟', canFlip: false }
]);
*/
