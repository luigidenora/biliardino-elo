import { getPlayerById } from '@/services/player.service';
import gsap from 'gsap';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { Component } from '../components/component.base';
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

const CLOSED_AVATAR_SIZE = 43;
const OPEN_AVATAR_SIZE = 76;
const AVATAR_STACK_OFFSET = 40;

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

// ── Stateless render functions ─────────────────────────────────

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
  const todayCards = buckets.today
    .map(m => renderMatchCard(m, selectedPlayerId, { expanded: false, expandable }))
    .join('');
  const olderCards = buckets.older
    .map(m => renderMatchCard(m, selectedPlayerId, { expanded: false, expandable }))
    .join('');

  let body = '';

  if (buckets.today.length > 0) {
    body += `
      ${renderSectionHeader('OGGI', true)}
      <div class="flex flex-col gap-3">
        ${todayCards}
      </div>
    `;
  }

  if (buckets.older.length > 0) {
    body += `
      ${renderSectionHeader('PRECEDENTI', false)}
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
    expandableAttr: state.expandable ? 'true' : 'false',
    cardCursor: state.expandable ? 'pointer' : 'default',
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

export function renderMatchPlayerAvatar(player: IPlayer | undefined): string {
  if (!player) return `<div style="width:${CLOSED_AVATAR_SIZE}px;height:${CLOSED_AVATAR_SIZE}px"></div>`;

  const color = CLASS_COLORS[player.class] ?? '#8B7D6B';
  return renderPlayerAvatar({
    initials: getInitials(player.name),
    color,
    size: 'sm',
    playerId: player.id,
    playerClass: player.class
  });
}

// ── Private render helpers ─────────────────────────────────────

function buildMatchCardDetails(data: MatchCardData): string {
  return `
    <div class="rounded-[10px] flex items-center justify-center gap-3 m-3"
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
    <div class="grid grid-cols-2 gap-4 m-4">
      <div class="flex items-center justify-evenly rounded-xl" style="background:rgba(0,0,0,0.15);padding:6px">
        ${renderDetailPlayer(data.leftDef, 0)}
        ${renderDetailPlayer(data.leftAtt, 1)}
      </div>
      <div class="flex items-center justify-evenly rounded-xl" style="background:rgba(0,0,0,0.15);padding:6px">
        ${renderDetailPlayer(data.rightDef, 2)}
        ${renderDetailPlayer(data.rightAtt, 3)}
      </div>
    </div>
  `;
}

interface TeamAvatarOptions { side: 'left' | 'right' }

function renderTeamAvatars(
  p1: IPlayer | undefined,
  p2: IPlayer | undefined,
  options: TeamAvatarOptions
): string {
  const originClass = options.side === 'left' ? 'origin-left' : 'origin-right';
  const stackW = AVATAR_STACK_OFFSET + CLOSED_AVATAR_SIZE;
  const stackH = CLOSED_AVATAR_SIZE;

  return `
    <div class="relative shrink-0 ${originClass} scale-[0.82] sm:scale-100 transition-transform duration-300"
         data-avatar-stack
         data-side="${options.side}"
         style="width:${stackW}px;height:${stackH}px">
      <div class="absolute transition-all duration-300 ease-out"
           data-avatar-slot="back"
         style="left:${AVATAR_STACK_OFFSET}px;top:0px">
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

function renderProfileAvatarLink(player: IPlayer | undefined): string {
  if (!player) return `<div style="width:${CLOSED_AVATAR_SIZE}px;height:${CLOSED_AVATAR_SIZE}px"></div>`;

  return `
    <a href="/profile/${player.id}" data-player-link="${player.id}" data-floating-avatar="${player.id}" class="block relative"
       style="width:${CLOSED_AVATAR_SIZE}px;height:${CLOSED_AVATAR_SIZE}px;transition:translate 220ms ease"
       onmouseenter="this.style.translate='0 -2px'"
       onmouseleave="this.style.translate='0 0'">
      ${renderMatchPlayerAvatar(player)}
    </a>
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

function renderDetailPlayer(player: IPlayer | undefined, index: number): string {
  if (!player) return '<div style="width:110px"></div>';

  const color = CLASS_COLORS[player.class] ?? '#8B7D6B';
  const avatarHtml = renderPlayerAvatar({
    initials: getInitials(player.name),
    color,
    size: 'lg',
    playerId: player.id,
    playerClass: player.class
  });

  return `
    <a href="/profile/${player.id}" data-player-link="${player.id}" class="flex flex-col items-center gap-1 min-w-0"
       style="width:110px;transition:translate 220ms ease"
       onmouseenter="this.style.translate='0 -2px'"
       onmouseleave="this.style.translate='0 0'">
      <div data-detail-avatar="${player.id}" data-avatar-index="${index}"
           style="width:${OPEN_AVATAR_SIZE}px;height:${OPEN_AVATAR_SIZE}px;transform:scale(0);opacity:0">
        ${avatarHtml}
      </div>
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

function renderSectionHeader(label: string, isToday: boolean): string {
  const dotBg = isToday ? '#ffd700' : 'rgba(255,215,0,0.2)';
  const dotShadow = isToday ? '0 0 6px rgba(255,215,0,0.4)' : 'none';
  const labelColor = isToday ? '#ffd700' : 'rgb(255,215,0)';
  const gradFrom = isToday ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)';

  return `
    <div class="flex items-center gap-2 px-1">
      <div class="shrink-0 rounded-sm" style="width:6px;height:6px;background:${dotBg};box-shadow:${dotShadow}"></div>
      <span class="font-ui shrink-0" style="font-size:12px;font-weight:600;letter-spacing:1.08px;color:${labelColor}">
        ${label}
      </span>
      <div class="flex-1 min-w-0" style="height:1px;background:linear-gradient(to right,${gradFrom},transparent)"></div>
    </div>
  `;
}

function getMatchId(match: IMatch): string {
  return `${match.createdAt}-${match.teamA.defence}-${match.teamA.attack}-${match.teamB.defence}-${match.teamB.attack}`;
}

// ── Interactive Component ──────────────────────────────────────

interface MatchHistoryAnimatedCard extends HTMLElement {
  _matchHistoryTimeline?: gsap.core.Timeline;
}

/**
 * Standalone stateful component that manages click interactions and GSAP
 * animations for a rendered match history section.
 *
 * Usage:
 *   const html = renderMatchHistory(options);          // stateless render
 *   const component = new MatchHistoryComponent();
 *   component.mount(rootElement);                       // attach interactivity
 *   // ...
 *   component.destroy();                                // full cleanup
 */
export class MatchHistoryComponent {
  private el: HTMLElement | null = null;
  private clickHandler: ((e: Event) => void) | null = null;
  private activeTimelines = new Set<gsap.core.Timeline>();

  mount(root: HTMLElement): void {
    this.el = root;

    this.clickHandler = (event: Event): void => {
      const target = event.target as HTMLElement | null;

      // Let navigation links pass through — don't intercept avatar/player clicks
      if (target?.closest('a[href]')) return;

      const card = target?.closest('[data-match-card]') as HTMLElement | null;
      if (!card) return;
      if (card.dataset.expandable !== 'true') return;

      event.preventDefault();

      const container = card.closest('[data-match-history]') as HTMLElement | null;
      const alreadyExpanded = card.dataset.expanded === 'true';

      if (container) {
        container.querySelectorAll<HTMLElement>('[data-match-card]').forEach((otherCard) => {
          if (otherCard !== card) this.collapseCard(otherCard);
        });
      }

      this.setCardExpanded(card, !alreadyExpanded);
    };

    root.addEventListener('click', this.clickHandler);
  }

  destroy(): void {
    // Kill all tracked GSAP timelines
    for (const tl of this.activeTimelines) tl.kill();
    this.activeTimelines.clear();

    // Also sweep any timelines still referenced on card elements
    if (this.el) {
      this.el.querySelectorAll<HTMLElement>('[data-match-card]').forEach((card) => {
        const c = card as MatchHistoryAnimatedCard;
        if (c._matchHistoryTimeline) {
          c._matchHistoryTimeline.kill();
          c._matchHistoryTimeline = undefined;
        }
      });
    }

    if (this.el && this.clickHandler) {
      this.el.removeEventListener('click', this.clickHandler);
    }

    this.el = null;
    this.clickHandler = null;
  }

  private collapseCard(card: HTMLElement): void {
    if (card.dataset.expanded !== 'true') return;
    this.setCardExpanded(card, false);
  }

  private setCardExpanded(card: HTMLElement, expanded: boolean): void {
    card.dataset.expanded = expanded ? 'true' : 'false';

    const toggle = card.querySelector<HTMLElement>('[data-match-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');

    const chevron = card.querySelector<HTMLElement>('[data-lucide="chevron-down"]');
    if (chevron) {
      chevron.classList.toggle('rotate-180', expanded);
      gsap.to(chevron, {
        rotate: expanded ? 180 : 0,
        duration: expanded ? 0.34 : 0.28,
        ease: 'power3.out',
        overwrite: true
      });
    }

    this.animateCardTransition(card, expanded);
  }

  private animateCardTransition(card: HTMLElement, expanded: boolean): void {
    const details = card.querySelector<HTMLElement>('[data-match-details]');
    const topAvatars = Array.from(card.querySelectorAll<HTMLElement>('[data-floating-avatar]'));
    const detailAvatars = Array.from(card.querySelectorAll<HTMLElement>('[data-detail-avatar]'))
      .sort((a, b) => Number(a.dataset.avatarIndex) - Number(b.dataset.avatarIndex));
    const animatedCard = card as MatchHistoryAnimatedCard;

    // Kill and deregister any running timeline for this card
    if (animatedCard._matchHistoryTimeline) {
      this.activeTimelines.delete(animatedCard._matchHistoryTimeline);
      animatedCard._matchHistoryTimeline.kill();
      animatedCard._matchHistoryTimeline = undefined;
    }
    gsap.killTweensOf([details, ...topAvatars, ...detailAvatars].filter(Boolean));

    if (!details) return;

    if (expanded) {
      details.style.display = 'block';
      gsap.set(details, { height: 'auto' });

      gsap.set(details, { height: 0, opacity: 0, y: -8, overflow: 'hidden' });
      gsap.set(detailAvatars, { scale: 0.88, opacity: 0, y: 8 });

      const timeline = gsap.timeline({
        defaults: { overwrite: true },
        onComplete: () => {
          details.style.height = 'auto';
          details.style.overflow = 'visible';
          details.style.transform = '';
          animatedCard._matchHistoryTimeline = undefined;
          this.activeTimelines.delete(timeline);
        }
      });

      timeline
        .to(topAvatars, {
          scale: 0,
          opacity: 0,
          duration: 0.22,
          ease: 'power2.inOut',
          stagger: 0.025
        }, 0)
        .to(details, {
          height: 'auto',
          opacity: 1,
          y: 0,
          duration: 0.28,
          ease: 'power3.out'
        }, 0.03)
        .to(detailAvatars, {
          scale: 1,
          opacity: 1,
          y: 0,
          duration: 0.28,
          ease: 'power3.out',
          stagger: 0.03
        }, 0.1);

      animatedCard._matchHistoryTimeline = timeline;
      this.activeTimelines.add(timeline);
      return;
    }

    const startHeight = details.offsetHeight;
    if (startHeight === 0) {
      details.style.display = 'none';
      gsap.set(topAvatars, { scale: 1, opacity: 1 });
      gsap.set(detailAvatars, { scale: 0.88, opacity: 0, y: 8 });
      return;
    }

    gsap.set(details, { height: startHeight, opacity: 1, y: 0, overflow: 'hidden' });

    const timeline = gsap.timeline({
      defaults: { overwrite: true },
      onComplete: () => {
        details.style.display = 'none';
        details.style.height = '';
        details.style.opacity = '';
        details.style.overflow = '';
        details.style.transform = '';
        gsap.set(detailAvatars, { scale: 0.88, opacity: 0, y: 8 });
        animatedCard._matchHistoryTimeline = undefined;
        this.activeTimelines.delete(timeline);
      }
    });

    timeline
      .to(detailAvatars, {
        scale: 0.9,
        opacity: 0,
        y: 4,
        duration: 0.16,
        ease: 'power1.out',
        stagger: { each: 0.02, from: 'end' }
      }, 0)
      .to(details, {
        height: 0,
        opacity: 0,
        duration: 0.32,
        ease: 'power3.inOut'
      }, 0.03)
      .to(topAvatars, {
        scale: 1,
        opacity: 1,
        duration: 0.22,
        ease: 'power3.out',
        stagger: 0.025
      }, 0.1);

    animatedCard._matchHistoryTimeline = timeline;
    this.activeTimelines.add(timeline);
  }
}

/** @deprecated Use MatchHistoryComponent class for explicit lifecycle control */
export function attachMatchHistoryInteractions(root: HTMLElement): () => void {
  const component = new MatchHistoryComponent();
  component.mount(root);
  return () => component.destroy();
}
