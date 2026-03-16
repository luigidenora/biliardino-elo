import { getPlayerById } from '@/services/player.service';
import gsap from 'gsap';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { html, rawHtml } from '../utils/html-template.util';
import cardTemplate from './match-history-card.component.html?raw';
import historyTemplate from './match-history.component.html?raw';

import type { IMatch } from '@/models/match.interface';
import type { IPlayer } from '@/models/player.interface';

const CLASS_COLORS: Record<number, string> = {
  0: '#FFD700',
  1: '#4A90D9',
  2: '#27AE60',
  3: '#C0C0C0',
  4: '#8B7D6B'
};

const MATCH_AVATAR_SIZE = 112;
const MATCH_AVATAR_STACK_OFFSET = 88;

export interface MatchHistoryOptions {
  matches: IMatch[];
  limit?: number;
  selectedPlayerId?: number;
  title?: string;
  showHeader?: boolean;
  expandable?: boolean;
}

interface RenderMatchCardState {
  expanded: boolean;
  expandable: boolean;
}

interface MatchBuckets {
  today: IMatch[];
  older: IMatch[];
}

interface MatchCardData {
  id: string;
  leftDef: IPlayer | undefined;
  leftAtt: IPlayer | undefined;
  rightDef: IPlayer | undefined;
  rightAtt: IPlayer | undefined;
  leftScore: number;
  rightScore: number;
  leftElo: number;
  rightElo: number;
  leftDelta: number;
  leftPct: number;
  rightPct: number;
  leftWon: boolean;
}

export function renderMatchHistory(options: MatchHistoryOptions): string {
  const {
    matches: rawMatches,
    limit = 30,
    selectedPlayerId = 0,
    title = 'CRONOLOGIA PARTITE',
    showHeader = true,
    expandable = true
  } = options;

  const matches = rawMatches
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);

  if (matches.length === 0) return '';

  const buckets = splitTodayAndOlder(matches);
  const defaultExpandedId = buckets.today[0] ? getMatchId(buckets.today[0]) : '';
  const todayCards = buckets.today
    .map(m => renderMatchCard(m, selectedPlayerId, {
      expanded: expandable && getMatchId(m) === defaultExpandedId,
      expandable
    }))
    .join('');
  const olderCards = buckets.older
    .map(m => renderMatchCard(m, selectedPlayerId, {
      expanded: false,
      expandable
    }))
    .join('');

  let body = '';

  if (buckets.today.length > 0) {
    body += `
      ${renderSectionHeader('OGGI', buckets.today.length, true)}
      <div class="flex flex-col gap-3">
        ${todayCards}
      </div>
    `;
  }

  if (buckets.older.length > 0) {
    body += `
      ${renderSectionHeader('PRECEDENTI', buckets.older.length, false)}
      <div class="flex flex-col gap-3">
        ${olderCards}
      </div>
    `;
  }

  const header = showHeader
    ? `
      <div class="flex items-center gap-2">
        <i data-lucide="history" style="width:16px;height:16px;color:white"></i>
        <span class="font-display text-white" style="font-size:18px;letter-spacing:2.16px">
          ${title}
        </span>
        <span class="rounded px-1.5 py-0.5 font-ui"
              style="font-size:9px;letter-spacing:0.54px;color:rgba(255,255,255,0.38);background:rgba(255,255,255,0.05)">
          ${matches.length} MATCH
        </span>
      </div>
    `
    : '';

  return html(historyTemplate, {
    header: rawHtml(header),
    body: rawHtml(body)
  });
}

export function renderMatchCard(
  match: IMatch,
  selectedPlayerId = 0,
  state: RenderMatchCardState = { expanded: false, expandable: true }
): string {
  const data = getMatchCardData(match, selectedPlayerId);

  const borderGradient = data.leftWon
    ? 'linear-gradient(to bottom, rgba(255,255,255,0.7), rgba(255,255,255,0.15))'
    : 'linear-gradient(to bottom, #e53e3e, rgba(229,62,62,0.2))';

  const leftScoreColor = data.leftWon
    ? 'rgba(255,255,255,0.92)'
    : 'rgba(255,255,255,0.22)';
  const rightScoreColor = data.leftWon
    ? 'rgba(229,62,62,0.3)'
    : '#ff6b6b';

  const absDelta = Math.abs(data.leftDelta);
  const deltaIsPositive = data.leftDelta >= 0;
  const deltaColor = deltaIsPositive ? '#22c55e' : '#ef4444';
  const deltaBg = deltaIsPositive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';
  const deltaBorder = deltaIsPositive ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
  const deltaIcon = deltaIsPositive ? 'trending-up' : 'trending-down';
  const deltaLabel = `${deltaIsPositive ? '+' : '-'}${absDelta} ELO`;

  const winBarGrad = 'background:linear-gradient(to right,rgba(255,255,255,0.15),rgba(255,255,255,0.7))';
  const loseBarGrad = 'background:linear-gradient(to left,rgba(229,62,62,0.2),rgba(229,62,62,0.85))';

  const detailsDisplay = state.expanded ? 'block' : 'none';
  const chevronClass = state.expanded ? 'rotate-180' : '';
  const chevronHtml = state.expandable
    ? `<i data-lucide="chevron-down" class="${chevronClass}" style="width:14px;height:14px;color:rgba(255,255,255,0.4)"></i>`
    : '';
  const centerRowHtml = `
    <div class="flex-1 flex items-center overflow-visible">
      ${renderTeamAvatars(data.leftDef, data.leftAtt, { side: 'left' })}
    </div>

    <div class="shrink-0 flex items-center gap-1 rounded-[10px]"
         style="padding:1px 11px;height:46px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.06)">
      <span class="font-display" style="font-size:32px;line-height:32px;color:${leftScoreColor}">${data.leftScore}</span>
      <span class="font-ui" style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.1)">─</span>
      <span class="font-display" style="font-size:32px;line-height:32px;color:${rightScoreColor}">${data.rightScore}</span>
    </div>

    <div class="flex-1 flex items-center justify-end overflow-visible">
      ${renderTeamAvatars(data.rightDef, data.rightAtt, { side: 'right' })}
    </div>
  `;

  const detailsHtml = buildMatchCardDetails(data);

  return html(cardTemplate, {
    matchId: data.id,
    expandedAttr: state.expanded ? 'true' : 'false',
    ariaExpanded: state.expanded ? 'true' : 'false',
    borderGradient,
    avgElo: Math.round((data.leftElo + data.rightElo) / 2),
    deltaBg,
    deltaBorder,
    deltaColor,
    deltaIcon,
    deltaLabel,
    centerRow: rawHtml(centerRowHtml),
    chevron: rawHtml(chevronHtml),
    leftPct: data.leftPct,
    rightPct: data.rightPct,
    leftBarStyle: data.leftWon ? winBarGrad : loseBarGrad,
    rightBarStyle: data.leftWon ? loseBarGrad : winBarGrad,
    detailsDisplay,
    details: rawHtml(detailsHtml)
  });
}

function buildMatchCardDetails(data: MatchCardData): string {
  return `
    <div class="rounded-[10px] flex items-center justify-center gap-3"
         style="height:31px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.05)">
      <div class="flex items-center gap-1.5">
        <div class="rounded-sm" style="width:6px;height:6px;background:rgba(255,255,255,0.7)"></div>
        <span class="font-ui" style="font-size:8px;letter-spacing:0.56px;color:rgba(255,215,0,0.45)">ELO MEDIO BIANCHI</span>
        <span class="font-display" style="font-size:17px;color:rgba(255,255,255,0.9)">${data.leftElo}</span>
      </div>
      <span class="font-ui" style="font-size:12px;color:rgba(255,255,255,0.12)">|</span>
      <div class="flex items-center gap-1.5">
        <span class="font-display" style="font-size:17px;color:rgba(229,62,62,0.35)">${data.rightElo}</span>
        <span class="font-ui" style="font-size:8px;letter-spacing:0.56px;color:rgba(255,215,0,0.45)">ELO MEDIO ROSSI</span>
        <div class="rounded-sm" style="width:6px;height:6px;background:#e53e3e"></div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4 mt-3">
      <div class="flex items-center justify-evenly rounded-xl" style="background:rgba(0,0,0,0.15);padding:6px">
        ${renderDetailPlayer(data.leftDef)}
        ${renderDetailPlayer(data.leftAtt)}
      </div>
      <div class="flex items-center justify-evenly rounded-xl" style="background:rgba(0,0,0,0.15);padding:6px">
        ${renderDetailPlayer(data.rightDef)}
        ${renderDetailPlayer(data.rightAtt)}
      </div>
    </div>
  `;
}

export function attachMatchHistoryInteractions(root: HTMLElement): () => void {
  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;

    const playerLink = target?.closest('[data-player-link]') as HTMLElement | null;
    if (playerLink) return;

    const toggle = target?.closest('[data-match-toggle]') as HTMLElement | null;
    if (!toggle) return;

    const card = toggle.closest('[data-match-card]') as HTMLElement | null;
    if (!card) return;

    const container = card.closest('[data-match-history]') as HTMLElement | null;
    const alreadyExpanded = card.dataset.expanded === 'true';

    if (container) {
      const cards = container.querySelectorAll<HTMLElement>('[data-match-card]');
      cards.forEach((otherCard) => {
        setCardExpanded(otherCard, false);
      });
    }

    setCardExpanded(card, !alreadyExpanded);
  };

  root.addEventListener('click', onClick);

  return () => {
    root.removeEventListener('click', onClick);
  };
}

export function renderMatchPlayerAvatar(player: IPlayer | undefined): string {
  if (!player) return `<div style="width:${MATCH_AVATAR_SIZE}px;height:${MATCH_AVATAR_SIZE}px"></div>`;

  const color = CLASS_COLORS[player.class] ?? '#8B7D6B';
  return renderPlayerAvatar({
    initials: getInitials(player.name),
    color,
    size: 'sm',
    playerId: player.id,
    playerClass: player.class
  });
}

interface TeamAvatarOptions { side: 'left' | 'right' }

function renderTeamAvatars(
  p1: IPlayer | undefined,
  p2: IPlayer | undefined,
  options: TeamAvatarOptions
): string {
  const originClass = options.side === 'left' ? 'origin-left' : 'origin-right';

  return `
    <div class="relative shrink-0 ${originClass} scale-[0.82] sm:scale-100 transition-transform duration-300"
         data-avatar-stack
         data-side="${options.side}">
      <div class="absolute transition-all duration-300 ease-out"
           data-avatar-slot="back"
         style="left:${MATCH_AVATAR_STACK_OFFSET}px;top:0px">
        ${renderProfileAvatarLink(p2)}
      </div>
      <div class="absolute transition-all duration-300 ease-out"
           data-avatar-slot="front"
           style="left:0px;top:0px">
        ${renderProfileAvatarLink(p1)}
      </div>
    </div>
  `;
}

function getMatchCardData(match: IMatch, selectedPlayerId: number): MatchCardData {
  const defA = getPlayerById(match.teamA.defence);
  const attA = getPlayerById(match.teamA.attack);
  const defB = getPlayerById(match.teamB.defence);
  const attB = getPlayerById(match.teamB.attack);
  const aWon = match.score[0] > match.score[1];

  const selectedInA = selectedPlayerId
    && (match.teamA.defence === selectedPlayerId || match.teamA.attack === selectedPlayerId);
  const selectedInB = selectedPlayerId
    && (match.teamB.defence === selectedPlayerId || match.teamB.attack === selectedPlayerId);
  const showAOnLeft = selectedInA ? true : selectedInB ? false : aWon;

  if (showAOnLeft) {
    return {
      id: getMatchId(match),
      leftDef: defA,
      leftAtt: attA,
      rightDef: defB,
      rightAtt: attB,
      leftScore: match.score[0],
      rightScore: match.score[1],
      leftElo: Math.round(match.teamELO[0]),
      rightElo: Math.round(match.teamELO[1]),
      leftDelta: Math.round(match.deltaELO[0]),
      leftPct: Math.round(match.expectedScore[0] * 100),
      rightPct: Math.round(match.expectedScore[1] * 100),
      leftWon: aWon
    };
  }

  return {
    id: getMatchId(match),
    leftDef: defB,
    leftAtt: attB,
    rightDef: defA,
    rightAtt: attA,
    leftScore: match.score[1],
    rightScore: match.score[0],
    leftElo: Math.round(match.teamELO[1]),
    rightElo: Math.round(match.teamELO[0]),
    leftDelta: Math.round(match.deltaELO[1]),
    leftPct: Math.round(match.expectedScore[1] * 100),
    rightPct: Math.round(match.expectedScore[0] * 100),
    leftWon: !aWon
  };
}

function renderDetailPlayer(player: IPlayer | undefined): string {
  if (!player) return '<div style="width:110px"></div>';

  return `
    <a href="/profile/${player.id}" data-player-link="${player.id}" class="flex flex-col items-center gap-1 min-w-0"
       style="width:110px;transition:transform 220ms ease"
       onmouseenter="this.style.transform='translateY(-2px)'"
       onmouseleave="this.style.transform='translateY(0)'">
      <div data-avatar-target="${player.id}" style="width:${MATCH_AVATAR_SIZE}px;height:${MATCH_AVATAR_SIZE}px"></div>
      <div class="font-ui truncate text-center" style="font-size:12px;color:rgba(255,255,255,0.85);max-width:100%">${player.name}</div>
      <div class="font-display" style="font-size:16px;color:rgba(255,215,0,0.9)">${Math.round(player.elo)}</div>
    </a>
  `;
}

function splitTodayAndOlder(matches: IMatch[]): MatchBuckets {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayMatches: IMatch[] = [];
  const olderMatches: IMatch[] = [];

  for (const match of matches) {
    const date = new Date(match.createdAt);
    date.setHours(0, 0, 0, 0);
    if (date.getTime() === today.getTime()) {
      todayMatches.push(match);
    } else {
      olderMatches.push(match);
    }
  }

  return { today: todayMatches, older: olderMatches };
}

function renderSectionHeader(label: string, count: number, isToday: boolean): string {
  const dotBg = isToday ? '#ffd700' : 'rgba(255,215,0,0.2)';
  const dotShadow = isToday ? '0 0 6px rgba(255,215,0,0.4)' : 'none';
  const labelColor = isToday ? '#ffd700' : 'rgba(255,215,0,0.35)';
  const gradFrom = isToday ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)';
  const partite = count === 1 ? '1 PARTITA' : `${count} PARTITE`;

  return `
    <div class="flex items-center gap-2 px-1">
      <div class="shrink-0 rounded-sm" style="width:6px;height:6px;background:${dotBg};box-shadow:${dotShadow}"></div>
      <span class="font-ui shrink-0" style="font-size:9px;font-weight:600;letter-spacing:1.08px;color:${labelColor}">
        ${label}
      </span>
      <span class="font-ui shrink-0" style="font-size:8px;letter-spacing:0.48px;color:rgba(255,255,255,0.15)">
        ${partite}
      </span>
      <div class="flex-1 min-w-0" style="height:1px;background:linear-gradient(to right,${gradFrom},transparent)"></div>
    </div>
  `;
}

function getMatchId(match: IMatch): string {
  return `${match.createdAt}-${match.teamA.defence}-${match.teamA.attack}-${match.teamB.defence}-${match.teamB.attack}`;
}

function setCardExpanded(card: HTMLElement, expanded: boolean): void {
  card.dataset.expanded = expanded ? 'true' : 'false';

  animateMatchDetails(card, expanded);

  const toggle = card.querySelector<HTMLElement>('[data-match-toggle]');
  if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');

  const chevron = card.querySelector<HTMLElement>('[data-lucide="chevron-down"]');
  if (chevron) {
    chevron.classList.toggle('rotate-180', expanded);
    gsap.to(chevron, {
      rotate: expanded ? 180 : 0,
      duration: 0.28,
      ease: 'power2.out',
      overwrite: true
    });
  }

  requestAnimationFrame(() => {
    animateFloatingAvatars(card, expanded);
  });
}

function renderProfileAvatarLink(player: IPlayer | undefined): string {
  if (!player) return `<div style="width:${MATCH_AVATAR_SIZE}px;height:${MATCH_AVATAR_SIZE}px"></div>`;

  return `
    <a href="/profile/${player.id}" data-player-link="${player.id}" data-floating-avatar="${player.id}" class="block relative"
       style="width:${MATCH_AVATAR_SIZE}px;height:${MATCH_AVATAR_SIZE}px;transition:transform 220ms ease"
       onmouseenter="this.style.transform='translateY(-2px)'"
       onmouseleave="this.style.transform='translateY(0)'">
      ${renderMatchPlayerAvatar(player)}
    </a>
  `;
}

function animateMatchDetails(card: HTMLElement, expanded: boolean): void {
  const details = card.querySelector<HTMLElement>('[data-match-details]');
  if (!details) return;

  gsap.killTweensOf(details);

  if (expanded) {
    details.style.display = 'block';
    gsap.set(details, { height: 'auto' });
    const targetHeight = details.offsetHeight;

    gsap.fromTo(
      details,
      { height: 0, opacity: 0, overflow: 'hidden' },
      {
        height: targetHeight,
        opacity: 1,
        duration: 0.34,
        ease: 'power2.out',
        overwrite: true,
        onComplete: () => {
          details.style.height = 'auto';
          details.style.overflow = 'visible';
        }
      }
    );
    return;
  }

  const startHeight = details.offsetHeight;
  if (startHeight === 0) {
    details.style.display = 'none';
    return;
  }

  gsap.fromTo(
    details,
    { height: startHeight, opacity: 1, overflow: 'hidden' },
    {
      height: 0,
      opacity: 0,
      duration: 0.26,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => {
        details.style.display = 'none';
        details.style.height = '';
        details.style.opacity = '';
        details.style.overflow = '';
      }
    }
  );
}

function animateFloatingAvatars(card: HTMLElement, expanded: boolean): void {
  const avatars = card.querySelectorAll<HTMLElement>('[data-floating-avatar]');
  avatars.forEach((avatar) => {
    const playerId = avatar.dataset.floatingAvatar;
    if (!playerId) return;

    if (!expanded) {
      gsap.to(avatar, {
        x: 0,
        y: 0,
        duration: 0.35,
        ease: 'power2.inOut',
        overwrite: true
      });
      return;
    }

    const target = card.querySelector<HTMLElement>(`[data-avatar-target="${playerId}"]`);
    if (!target) return;

    const sourceRect = avatar.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const deltaX = targetRect.left - sourceRect.left;
    const deltaY = targetRect.top - sourceRect.top;

    gsap.to(avatar, {
      x: deltaX,
      y: deltaY,
      duration: 0.45,
      ease: 'power2.out',
      overwrite: true
    });
  });
}
