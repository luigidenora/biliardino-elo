/**
 * Fish 8-bit sprites and utilities
 */

export const FISH_SPRITES = {
  Squalo: `
    <svg viewBox="0 0 32 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="8" width="2" height="2" fill="#1a3a52"/>
      <rect x="4" y="6" width="2" height="2" fill="#1a3a52"/>
      <rect x="6" y="4" width="2" height="2" fill="#1a3a52"/>
      <rect x="8" y="4" width="2" height="2" fill="#1a3a52"/>
      <rect x="10" y="4" width="2" height="2" fill="#1a3a52"/>
      <rect x="12" y="4" width="2" height="2" fill="#1a3a52"/>
      <rect x="14" y="6" width="2" height="2" fill="#1a3a52"/>
      <rect x="16" y="8" width="2" height="2" fill="#1a3a52"/>
      <rect x="18" y="8" width="2" height="2" fill="#1a3a52"/>
      <rect x="20" y="8" width="2" height="2" fill="#1a3a52"/>
      <rect x="6" y="10" width="2" height="2" fill="#0066cc"/>
      <rect x="8" y="10" width="2" height="2" fill="#0066cc"/>
      <rect x="10" y="10" width="2" height="2" fill="#0066cc"/>
      <rect x="12" y="10" width="2" height="2" fill="#0066cc"/>
      <rect x="14" y="10" width="2" height="2" fill="#0066cc"/>
      <rect x="16" y="10" width="2" height="2" fill="#0066cc"/>
      <rect x="4" y="12" width="2" height="2" fill="#0066cc"/>
      <rect x="6" y="12" width="2" height="2" fill="#0066cc"/>
      <rect x="8" y="12" width="2" height="2" fill="#0066cc"/>
      <rect x="10" y="12" width="2" height="2" fill="#0066cc"/>
      <rect x="12" y="12" width="2" height="2" fill="#0066cc"/>
      <rect x="14" y="12" width="2" height="2" fill="#0066cc"/>
      <rect x="22" y="10" width="2" height="2" fill="#1a3a52"/>
      <rect x="24" y="10" width="2" height="2" fill="#1a3a52"/>
      <rect x="26" y="8" width="2" height="2" fill="#1a3a52"/>
      <rect x="28" y="10" width="2" height="2" fill="#1a3a52"/>
      <rect x="6" y="14" width="2" height="2" fill="#0066cc"/>
      <rect x="8" y="14" width="2" height="2" fill="#0066cc"/>
      <rect x="10" y="14" width="2" height="2" fill="#0066cc"/>
      <rect x="12" y="14" width="2" height="2" fill="#0066cc"/>
      <rect x="14" y="14" width="2" height="2" fill="#0066cc"/>
      <rect x="2" y="6" width="2" height="2" fill="#1a3a52"/>
      <rect x="0" y="8" width="0" height="0" fill="#ffd700"/>
    </svg>
  `,

  Barracuda: `
    <svg viewBox="0 0 32 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="10" width="2" height="2" fill="#2a5a3a"/>
      <rect x="4" y="8" width="2" height="2" fill="#2a5a3a"/>
      <rect x="6" y="6" width="2" height="2" fill="#2a5a3a"/>
      <rect x="8" y="4" width="2" height="2" fill="#2a5a3a"/>
      <rect x="10" y="4" width="2" height="2" fill="#2a5a3a"/>
      <rect x="12" y="4" width="2" height="2" fill="#2a5a3a"/>
      <rect x="14" y="6" width="2" height="2" fill="#2a5a3a"/>
      <rect x="16" y="8" width="2" height="2" fill="#2a5a3a"/>
      <rect x="18" y="8" width="2" height="2" fill="#2a5a3a"/>
      <rect x="20" y="8" width="2" height="2" fill="#2a5a3a"/>
      <rect x="22" y="10" width="2" height="2" fill="#00bb33"/>
      <rect x="24" y="10" width="2" height="2" fill="#00bb33"/>
      <rect x="26" y="8" width="2" height="2" fill="#2a5a3a"/>
      <rect x="28" y="10" width="2" height="2" fill="#2a5a3a"/>
      <rect x="6" y="10" width="2" height="2" fill="#00bb33"/>
      <rect x="8" y="10" width="2" height="2" fill="#00bb33"/>
      <rect x="10" y="10" width="2" height="2" fill="#00bb33"/>
      <rect x="12" y="10" width="2" height="2" fill="#00bb33"/>
      <rect x="14" y="10" width="2" height="2" fill="#00bb33"/>
      <rect x="16" y="10" width="2" height="2" fill="#00bb33"/>
      <rect x="4" y="12" width="2" height="2" fill="#00bb33"/>
      <rect x="6" y="12" width="2" height="2" fill="#00bb33"/>
      <rect x="8" y="12" width="2" height="2" fill="#00bb33"/>
      <rect x="10" y="12" width="2" height="2" fill="#00bb33"/>
      <rect x="12" y="12" width="2" height="2" fill="#00bb33"/>
      <rect x="14" y="12" width="2" height="2" fill="#00bb33"/>
      <rect x="6" y="14" width="2" height="2" fill="#00bb33"/>
      <rect x="8" y="14" width="2" height="2" fill="#00bb33"/>
      <rect x="10" y="14" width="2" height="2" fill="#00bb33"/>
      <rect x="12" y="14" width="2" height="2" fill="#00bb33"/>
      <rect x="14" y="14" width="2" height="2" fill="#00bb33"/>
      <circle cx="4" cy="9" r="1" fill="#000"/>
    </svg>
  `,

  Tonno: `
    <svg viewBox="0 0 32 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="6" width="2" height="2" fill="#8b1a1a"/>
      <rect x="6" y="4" width="2" height="2" fill="#8b1a1a"/>
      <rect x="8" y="4" width="2" height="2" fill="#8b1a1a"/>
      <rect x="10" y="4" width="2" height="2" fill="#8b1a1a"/>
      <rect x="12" y="4" width="2" height="2" fill="#8b1a1a"/>
      <rect x="14" y="6" width="2" height="2" fill="#8b1a1a"/>
      <rect x="16" y="8" width="2" height="2" fill="#8b1a1a"/>
      <rect x="18" y="8" width="2" height="2" fill="#dd2222"/>
      <rect x="20" y="8" width="2" height="2" fill="#dd2222"/>
      <rect x="22" y="10" width="2" height="2" fill="#8b1a1a"/>
      <rect x="24" y="10" width="2" height="2" fill="#8b1a1a"/>
      <rect x="26" y="8" width="2" height="2" fill="#8b1a1a"/>
      <rect x="28" y="10" width="2" height="2" fill="#8b1a1a"/>
      <rect x="6" y="10" width="2" height="2" fill="#dd2222"/>
      <rect x="8" y="10" width="2" height="2" fill="#dd2222"/>
      <rect x="10" y="10" width="2" height="2" fill="#dd2222"/>
      <rect x="12" y="10" width="2" height="2" fill="#dd2222"/>
      <rect x="14" y="10" width="2" height="2" fill="#dd2222"/>
      <rect x="16" y="10" width="2" height="2" fill="#dd2222"/>
      <rect x="4" y="12" width="2" height="2" fill="#dd2222"/>
      <rect x="6" y="12" width="2" height="2" fill="#dd2222"/>
      <rect x="8" y="12" width="2" height="2" fill="#dd2222"/>
      <rect x="10" y="12" width="2" height="2" fill="#dd2222"/>
      <rect x="12" y="12" width="2" height="2" fill="#dd2222"/>
      <rect x="14" y="12" width="2" height="2" fill="#dd2222"/>
      <rect x="6" y="14" width="2" height="2" fill="#dd2222"/>
      <rect x="8" y="14" width="2" height="2" fill="#dd2222"/>
      <rect x="10" y="14" width="2" height="2" fill="#dd2222"/>
      <rect x="12" y="14" width="2" height="2" fill="#dd2222"/>
      <rect x="14" y="14" width="2" height="2" fill="#dd2222"/>
      <circle cx="5" cy="9" r="1" fill="#fff"/>
    </svg>
  `,

  Spigola: `
    <svg viewBox="0 0 32 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="10" width="2" height="2" fill="#556b2f"/>
      <rect x="4" y="8" width="2" height="2" fill="#556b2f"/>
      <rect x="6" y="6" width="2" height="2" fill="#556b2f"/>
      <rect x="8" y="4" width="2" height="2" fill="#556b2f"/>
      <rect x="10" y="4" width="2" height="2" fill="#556b2f"/>
      <rect x="12" y="4" width="2" height="2" fill="#556b2f"/>
      <rect x="14" y="6" width="2" height="2" fill="#556b2f"/>
      <rect x="16" y="8" width="2" height="2" fill="#556b2f"/>
      <rect x="18" y="8" width="2" height="2" fill="#6b8e23"/>
      <rect x="20" y="8" width="2" height="2" fill="#6b8e23"/>
      <rect x="22" y="10" width="2" height="2" fill="#556b2f"/>
      <rect x="24" y="10" width="2" height="2" fill="#556b2f"/>
      <rect x="26" y="8" width="2" height="2" fill="#556b2f"/>
      <rect x="28" y="10" width="2" height="2" fill="#556b2f"/>
      <rect x="6" y="10" width="2" height="2" fill="#6b8e23"/>
      <rect x="8" y="10" width="2" height="2" fill="#6b8e23"/>
      <rect x="10" y="10" width="2" height="2" fill="#6b8e23"/>
      <rect x="12" y="10" width="2" height="2" fill="#6b8e23"/>
      <rect x="14" y="10" width="2" height="2" fill="#6b8e23"/>
      <rect x="16" y="10" width="2" height="2" fill="#6b8e23"/>
      <rect x="4" y="12" width="2" height="2" fill="#6b8e23"/>
      <rect x="6" y="12" width="2" height="2" fill="#6b8e23"/>
      <rect x="8" y="12" width="2" height="2" fill="#6b8e23"/>
      <rect x="10" y="12" width="2" height="2" fill="#6b8e23"/>
      <rect x="12" y="12" width="2" height="2" fill="#6b8e23"/>
      <rect x="14" y="12" width="2" height="2" fill="#6b8e23"/>
      <rect x="6" y="14" width="2" height="2" fill="#6b8e23"/>
      <rect x="8" y="14" width="2" height="2" fill="#6b8e23"/>
      <rect x="10" y="14" width="2" height="2" fill="#6b8e23"/>
      <rect x="12" y="14" width="2" height="2" fill="#6b8e23"/>
      <rect x="14" y="14" width="2" height="2" fill="#6b8e23"/>
      <circle cx="4" cy="9" r="1" fill="#000"/>
    </svg>
  `,

  Sogliola: `
    <svg viewBox="0 0 32 24" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="14" cy="10" rx="10" ry="6" fill="#8b7355"/>
      <rect x="6" y="8" width="2" height="2" fill="#a0826d"/>
      <rect x="8" y="6" width="2" height="2" fill="#a0826d"/>
      <rect x="10" y="4" width="2" height="2" fill="#a0826d"/>
      <rect x="12" y="4" width="2" height="2" fill="#a0826d"/>
      <rect x="14" y="4" width="2" height="2" fill="#a0826d"/>
      <rect x="16" y="6" width="2" height="2" fill="#a0826d"/>
      <rect x="18" y="8" width="2" height="2" fill="#a0826d"/>
      <circle cx="8" cy="9" r="1" fill="#000"/>
      <rect x="24" y="8" width="2" height="2" fill="#8b7355"/>
      <rect x="26" y="8" width="2" height="2" fill="#8b7355"/>
      <rect x="28" y="10" width="2" height="2" fill="#8b7355"/>
      <rect x="6" y="12" width="2" height="2" fill="#a0826d"/>
      <rect x="8" y="12" width="2" height="2" fill="#a0826d"/>
      <rect x="10" y="14" width="2" height="2" fill="#a0826d"/>
      <rect x="12" y="16" width="2" height="2" fill="#a0826d"/>
      <rect x="14" y="16" width="2" height="2" fill="#a0826d"/>
      <rect x="16" y="14" width="2" height="2" fill="#a0826d"/>
      <rect x="18" y="12" width="2" height="2" fill="#a0826d"/>
      <rect x="20" y="12" width="2" height="2" fill="#a0826d"/>
    </svg>
  `
};

export function getRandomFishType(): keyof typeof FISH_SPRITES {
  const types = Object.keys(FISH_SPRITES) as (keyof typeof FISH_SPRITES)[];
  return types[Math.floor(Math.random() * types.length)];
}

export function getFishColor(fishType: keyof typeof FISH_SPRITES): string {
  const colorMap: Record<keyof typeof FISH_SPRITES, string> = {
    Squalo: '#0066cc',
    Barracuda: '#00bb33',
    Tonno: '#dd2222',
    Spigola: '#6b8e23',
    Sogliola: '#8b7355'
  };
  return colorMap[fishType];
}
