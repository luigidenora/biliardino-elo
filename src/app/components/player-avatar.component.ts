/**
 * PlayerAvatar — Circular avatar with initials and optional online status dot.
 * Ported from Figma: PlayerAvatar.tsx
 */

import { bindHtml, rawHtml } from '../utils/html-template.util';
import template from './player-avatar.component.html?raw';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeMap: Record<AvatarSize, { container: string; text: string; dot: string }> = {
  xs: { container: 'w-7 h-7', text: 'text-[10px]', dot: 'w-2 h-2' },
  sm: { container: 'w-9 h-9', text: 'text-xs', dot: 'w-2.5 h-2.5' },
  md: { container: 'w-11 h-11', text: 'text-sm', dot: 'w-3 h-3' },
  lg: { container: 'w-16 h-16', text: 'text-lg', dot: 'w-3.5 h-3.5' },
  xl: { container: 'w-24 h-24', text: 'text-2xl', dot: 'w-4 h-4' }
};

interface AvatarOptions {
  initials: string;
  color: string;
  size?: AvatarSize;
  online?: boolean;
}

/**
 * Returns an HTML string for a player avatar.
 */
export function renderPlayerAvatar({ initials, color, size = 'md', online }: AvatarOptions): string {
  const s = sizeMap[size];

  const statusDot = online !== undefined
    ? `<span
        class="absolute bottom-0 right-0 ${s.dot} rounded-full border-2 border-[#1A3D2F]"
        style="background: ${online ? '#4ADE80' : '#6B7280'}"
      ></span>`
    : '';

  return bindHtml(template)`${{
    containerClass: s.container,
    textClass: s.text,
    color,
    initials,
    statusDot: rawHtml(statusDot)
  }}`;
}

/**
 * Helper to compute initials from a player name.
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
