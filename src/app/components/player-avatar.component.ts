/**
 * PlayerAvatar — Circular avatar with initials and optional online status dot.
 * Ported from Figma: PlayerAvatar.tsx
 */

import { getPlayerById } from '../../services/player.service';
import { bindHtml, rawHtml } from '../utils/html-template.util';
import template from './player-avatar.component.html?raw';

const BASE_PATH = import.meta.env.BASE_URL;
let avatarRenderSequence = 0;

export type AvatarSize = 'xs' | 'sm' | 'md' | 'base' | 'lg' | 'xl' | 'match';

const sizeMap: Record<AvatarSize, { container: string; text: string; dot: string; coreInsetClass: string }> = {
  xs: { container: 'w-[34px] h-[34px]', text: 'text-[10px]', dot: 'w-2 h-2', coreInsetClass: 'inset-[8%]' },
  sm: { container: 'w-[43px] h-[43px]', text: 'text-xs', dot: 'w-2.5 h-2.5', coreInsetClass: 'inset-[8%]' },
  md: { container: 'w-[52px] h-[52px]', text: 'text-sm', dot: 'w-3 h-3', coreInsetClass: 'inset-[8%]' },
  base: { container: 'w-[57px] h-[57px]', text: 'text-base', dot: 'w-3 h-3', coreInsetClass: 'inset-[8%]' },
  lg: { container: 'w-[76px] h-[76px]', text: 'text-lg', dot: 'w-3.5 h-3.5', coreInsetClass: 'inset-[8%]' },
  xl: { container: 'w-[114px] h-[114px]', text: 'text-2xl', dot: 'w-4 h-4', coreInsetClass: 'inset-[8%]' },
  match: { container: 'w-[112px] h-[112px]', text: 'text-[11px]', dot: 'w-3 h-3', coreInsetClass: 'inset-[8%]' }
};

const frameTransformMap: Record<number, { translateX: number; translateY: number; scale: number; origin: string }> = {
  0: { translateX: -1, translateY: 0.2, scale: 1.5, origin: '50% 50%' },
  1: { translateX: 0, translateY: -0.2, scale: 1.4, origin: '50% 50%' },
  2: { translateX: 0, translateY: -0.4, scale: 1.5, origin: '50% 50%' },
  3: { translateX: 0, translateY: 0, scale: 1.4, origin: '50% 50%' },
  4: { translateX: 0, translateY: -0.1, scale: 1.5, origin: '50% 50%' }
};

interface AvatarOptions {
  initials: string;
  color: string;
  size?: AvatarSize;
  online?: boolean;
  /** Player numeric ID — when provided the avatar image is shown with initials as fallback */
  playerId?: number;
  /** Player class/rank bucket (0-4). If omitted and playerId exists, it is auto-resolved from players map. */
  playerClass?: number;
}

/**
 * Returns an HTML string for a player avatar.
 * If `playerId` is provided, shows the player photo (public/avatars/{id}.webp)
 * with the initials circle as fallback when the image is missing.
 */
export function renderPlayerAvatar({ initials, color, size = 'md', online, playerId, playerClass = __DEV_MODE__ ? Math.random() * 5 | 0 : undefined }: AvatarOptions): string {
  const s = sizeMap[size];
  const resolvedClass = Number.isFinite(playerClass)
    ? playerClass
    : (playerId === undefined ? undefined : getPlayerById(playerId)?.class);
  const classFrameSrc = resolvedClass !== undefined && resolvedClass >= 0
    ? `${BASE_PATH}class/${resolvedClass}.png`
    : undefined;
  const filterId = `avatar-chroma-key-${++avatarRenderSequence}`;

  const statusDot = online === undefined
    ? ''
    : `<span
        class="absolute bottom-0 right-0 ${s.dot} rounded-full border-2 border-[#1A3D2F]"
        style="background: ${online ? '#4ADE80' : '#6B7280'}"
      ></span>`;

  const initialsSpan = `<span class="${s.text} text-white font-ui" style="letter-spacing: 0.05em">${initials}</span>`;
  const frameTransform = resolvedClass !== undefined && resolvedClass >= 0
    ? frameTransformMap[resolvedClass] ?? { translateX: 0, translateY: 0, scale: 1.01, origin: '50% 50%' }
    : undefined;

  const avatarContent = playerId === undefined
    ? initialsSpan
    : `<img src="${BASE_PATH}avatars/${playerId}.webp" alt="${initials}" class="absolute inset-0 w-full h-full object-contain rounded-full" loading="lazy" onerror="this.style.display='none'" />${initialsSpan}`;

  const frameDefs = classFrameSrc === undefined
    ? ''
    : `<svg class="absolute w-0 h-0 pointer-events-none" aria-hidden="true" focusable="false">
        <defs>
          <filter id="${filterId}" color-interpolation-filters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      1 -1 1 0 0.2" result="alphaRaw" />
            <feComponentTransfer in="alphaRaw" result="alphaMask">
              <feFuncA type="linear" slope="3" intercept="-0.7" />
            </feComponentTransfer>
            <feComposite in="SourceGraphic" in2="alphaMask" operator="in" />
          </filter>
        </defs>
      </svg>`;

  const frameOverlay = classFrameSrc === undefined
    ? ''
    : `<img src="${classFrameSrc}" alt="" class="absolute object-cover pointer-events-none"
         style="top:0;left:0;width:100%;height:100%;filter:url(#${filterId});transform-origin:${frameTransform?.origin ?? '50% 50%'};transform:translate(${frameTransform?.translateX ?? 0}%,${frameTransform?.translateY ?? 0}%) scale(${frameTransform?.scale ?? 1.07})"
         loading="lazy" />`;

  return bindHtml(template)`${{
    containerClass: s.container,
    avatarCoreInsetClass: s.coreInsetClass,
    color,
    frameDefs: rawHtml(frameDefs),
    avatarContent: rawHtml(avatarContent),
    frameOverlay: rawHtml(frameOverlay),
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
