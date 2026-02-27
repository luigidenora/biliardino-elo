/**
 * LobbyPage -- Real-time match lobby with team display, countdown timer,
 * chat panel, and fish aquarium.
 *
 * Route: /lobby
 * Dynamically imported by the router.
 *
 * Ports business logic from confirm.view.ts into the Component-based SPA
 * architecture (vanilla TS, no React).
 */

import { isPlayerAdmin } from '@/config/admin.config';
import { API_BASE_URL } from '@/config/env.config';
import { MessageService } from '@/services/message.service';
import { getPlayerById } from '@/services/player.service';
import { fetchRunningMatch } from '@/services/repository.service';
import { FISH_SPRITES } from '@/utils/fish-sprites.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { refreshIcons } from '../icons';
import { appState } from '../state';

import type { IRunningMatchDTO } from '@/models/match.interface';
import type { IMessage } from '@/models/message.interface';
import type { IPlayer } from '@/models/player.interface';

// ── Constants ────────────────────────────────────────────────────

const LOBBY_TTL_DEFAULT = 5400; // 90 min
const POLL_INTERVAL_MS = 3000;
const MSG_POLL_INTERVAL_MS = 4000;
const CHAT_MAX_LENGTH = 50;
const FISH_TYPES = ['Squalo', 'Barracuda', 'Tonno', 'Spigola', 'Sogliola'] as const;
const LABEL_COLORS = [
  '#1e90ff', '#e74c3c', '#8e44ad', '#e67e22', '#2ecc71',
  '#f39c12', '#16a085', '#c0392b', '#2980b9', '#d35400'
];

const CLASS_COLORS: Record<number, string> = {
  0: '#FFD700',
  1: '#4A90D9',
  2: '#27AE60',
  3: '#C0C0C0',
  4: '#8B7D6B'
};

function getClassColor(playerClass: number): string {
  return CLASS_COLORS[playerClass] ?? '#8B7D6B';
}

// ── Confirmation shape from the API ──────────────────────────────

interface IConfirmation {
  playerId: number;
  fishName?: string;
  confirmedAt: string;
}

// ── Fish movement descriptor ─────────────────────────────────────

interface FishMovement {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  element: HTMLElement;
  sprite: HTMLElement | null;
}

// ── Page Component ───────────────────────────────────────────────

class LobbyPage extends Component {
  // State
  private lobbyData: IRunningMatchDTO | null = null;
  private players: Map<number, IPlayer> = new Map();
  private messages: IMessage[] = [];
  private confirmed: Set<number> = new Set();
  private countdownTotal = LOBBY_TTL_DEFAULT;
  private countdownSeconds = LOBBY_TTL_DEFAULT;

  // Intervals / animation
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private msgPollInterval: ReturnType<typeof setInterval> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private animFrameId: number | null = null;
  private lastMessageTimestamp = 0;

  // Fish tracking
  private fishMap = new Map<number, HTMLElement>();
  private fishMovement = new Map<number, FishMovement>();

  // Current player
  private myPlayerId: number | null = null;

  // Admin broadcast
  private isAdmin = false;
  private isBroadcasting = false;

  // ── Render ───────────────────────────────────────────────────

  override async render(): Promise<string> {
    this.myPlayerId = Number(localStorage.getItem('biliardino_player_id')) || null;
    this.isAdmin = isPlayerAdmin(this.myPlayerId);

    // Attempt to load lobby data on render
    try {
      const res = await fetch(`${API_BASE_URL}/check-lobby`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists && data.match) {
          this.lobbyData = data.match as IRunningMatchDTO;
        }
        // Sync countdown from server TTL
        if (data.exists && typeof data.ttl === 'number' && data.ttl > 0) {
          this.countdownTotal = data.ttl;
          this.countdownSeconds = data.ttl;
        }
      }
    } catch {
      // fail-open -- render skeleton, polling will retry
    }

    // Resolve player objects for the teams
    if (this.lobbyData) {
      const ids = [
        this.lobbyData.teamA.defence,
        this.lobbyData.teamA.attack,
        this.lobbyData.teamB.defence,
        this.lobbyData.teamB.attack
      ];
      for (const id of ids) {
        const p = getPlayerById(id);
        if (p) this.players.set(id, p);
      }
    }

    return `
      <div class="space-y-5 md:space-y-6" id="lobby-page">

        ${this.renderHeader()}

        <div class="flex flex-col lg:grid lg:grid-cols-[1fr_320px] gap-4 md:gap-5">

          <div class="space-y-4">
            <div id="teams-section">
              ${this.renderTeams()}
            </div>
            ${this.renderAquarium()}
          </div>

          ${this.renderChat()}

        </div>

      </div>
    `;
  }

  // ── Mount / Destroy ──────────────────────────────────────────

  override mount(): void {
    refreshIcons();

    // Start countdown
    this.countdownInterval = setInterval(() => this.tickCountdown(), 1000);

    // Start lobby polling
    this.pollLobby();
    this.pollInterval = setInterval(() => this.pollLobby(), POLL_INTERVAL_MS);

    // Start message polling
    this.pollMessages();
    this.msgPollInterval = setInterval(() => this.pollMessages(), MSG_POLL_INTERVAL_MS);

    // Start fish animation
    this.startFishAnimation();

    // Spawn aquarium decorations
    this.spawnBubbles();
    this.spawnGodRays();

    // Bind events
    this.bindChatEvents();
    this.bindConfirmButton();
    this.bindBroadcastButton();

    // GSAP entrance animations
    gsap.from('#lobby-header', {
      opacity: 0,
      y: -20,
      duration: 0.4,
      ease: 'power2.out'
    });

    gsap.from('.team-card', {
      opacity: 0,
      y: 20,
      stagger: 0.1,
      duration: 0.4,
      ease: 'power2.out',
      delay: 0.1
    });

    gsap.from('#lobby-chat', {
      opacity: 0,
      x: 20,
      duration: 0.4,
      ease: 'power2.out',
      delay: 0.15
    });

    gsap.from('#lobby-aquarium', {
      opacity: 0,
      y: 20,
      duration: 0.5,
      ease: 'power2.out',
      delay: 0.2
    });
  }

  override destroy(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    if (this.msgPollInterval) { clearInterval(this.msgPollInterval); this.msgPollInterval = null; }
    if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
    if (this.animFrameId !== null) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
  }

  // ── Section renderers ────────────────────────────────────────

  private renderHeader(): string {
    const pct = this.countdownTotal > 0
      ? (this.countdownSeconds / this.countdownTotal) * 100
      : 0;
    const color = this.getCountdownColor();
    const circumference = 2 * Math.PI * 28;
    const offset = circumference * (1 - pct / 100);

    return `
      <div id="lobby-header" class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 md:gap-3 min-w-0">
          <i data-lucide="users" class="text-[var(--color-gold)] shrink-0"
             style="width:26px;height:26px"></i>
          <div class="min-w-0">
            <h1 class="text-white font-display"
                style="font-size:clamp(26px,6vw,42px); letter-spacing:0.12em; line-height:1">
              MATCH LOBBY
            </h1>
            <p class="font-ui truncate"
               style="font-size:11px; color:rgba(255,255,255,0.5); letter-spacing:0.1em">
              CONFERMA LA TUA PRESENZA
            </p>
          </div>
        </div>

        <!-- Countdown circle -->
        <div class="flex flex-col items-center gap-1 shrink-0">
          <div class="relative w-14 h-14 md:w-18 md:h-18" id="countdown-container">
            <svg viewBox="0 0 64 64" class="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.1)"
                      stroke-width="3" fill="none" />
              <circle id="countdown-circle" cx="32" cy="32" r="28"
                      stroke="${color}" stroke-width="3" fill="none"
                      stroke-dasharray="${circumference}"
                      stroke-dashoffset="${offset}"
                      stroke-linecap="round"
                      style="transition: stroke-dashoffset 1s linear, stroke 0.5s" />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span id="countdown-text" class="font-display"
                    style="font-size:14px; color:${color}; transition:color 0.5s">
                ${this.formatCountdown(this.countdownSeconds)}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderTeams(): string {
    if (!this.lobbyData) {
      if (this.isAdmin) {
        return this.renderAdminBroadcastCard();
      }
      return `
        <div class="team-card glass-card rounded-xl p-6 text-center">
          <i data-lucide="users" class="mx-auto mb-3"
             style="width:32px;height:32px;color:rgba(255,255,255,0.3)"></i>
          <p class="font-display text-xl text-[var(--color-gold)] mb-2"
             style="letter-spacing:0.12em">
            NESSUNA LOBBY ATTIVA
          </p>
          <p class="font-body text-sm" style="color:rgba(255,255,255,0.4)">
            Aspetta la notifica per giocare!
          </p>
        </div>
      `;
    }

    const { teamA, teamB } = this.lobbyData;

    return `
      <div class="rounded-xl overflow-hidden"
           style="background:rgba(15,42,32,0.85); border:1px solid rgba(255,255,255,0.1); backdrop-filter:blur(8px)">

        <!-- Match header -->
        <div class="px-4 md:px-5 py-3 flex items-center justify-between"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid rgba(255,215,0,0.2)">
          <span class="font-ui" style="font-size:12px; color:var(--color-gold); letter-spacing:0.1em">
            2v2 &middot; STANDARD MODE
          </span>
          <div class="flex items-center gap-1.5">
            <i data-lucide="clock" style="width:11px;height:11px;color:var(--color-gold)"></i>
            <span class="hidden sm:block font-ui"
                  style="font-size:11px; color:rgba(255,255,255,0.5)">
              SEASON MATCH
            </span>
          </div>
        </div>

        <!-- Teams layout -->
        <div class="flex flex-col md:grid md:grid-cols-[1fr_64px_1fr]">

          <!-- Team Red -->
          <div class="team-card p-4 md:p-5"
               style="border-bottom:1px solid rgba(229,62,62,0.15)">
            <div class="flex items-center gap-2 mb-3">
              <div class="w-3 h-3 rounded-full" style="background:var(--color-team-red, #E53E3E)"></div>
              <span class="font-display"
                    style="font-size:17px; color:var(--color-team-red, #E53E3E); letter-spacing:0.15em">
                TEAM ROSSO
              </span>
            </div>
            <div class="space-y-2">
              ${this.renderPlayerRow(teamA.defence, 'DIF', '#E53E3E')}
              ${this.renderPlayerRow(teamA.attack, 'ATT', '#E53E3E')}
            </div>
          </div>

          <!-- VS center -->
          <div class="flex md:flex-col items-center justify-center py-2 md:py-0"
               style="border-bottom:1px solid rgba(49,130,206,0.15)">
            <div class="font-display flex items-center justify-center"
                 style="font-size:24px; color:var(--color-gold); letter-spacing:0.1em">
              VS
            </div>
          </div>

          <!-- Team Blue -->
          <div class="team-card p-4 md:p-5">
            <div class="flex items-center gap-2 mb-3">
              <div class="w-3 h-3 rounded-full" style="background:var(--color-team-blue, #3182CE)"></div>
              <span class="font-display"
                    style="font-size:17px; color:var(--color-team-blue, #3182CE); letter-spacing:0.15em">
                TEAM BLU
              </span>
            </div>
            <div class="space-y-2">
              ${this.renderPlayerRow(teamB.defence, 'DIF', '#3182CE')}
              ${this.renderPlayerRow(teamB.attack, 'ATT', '#3182CE')}
            </div>
          </div>

        </div>

        <!-- Ready status bar -->
        <div class="px-4 md:px-5 py-3 flex items-center justify-between"
             style="border-top:1px solid rgba(255,255,255,0.06); background:rgba(10,25,18,0.4)">
          <div class="flex items-center gap-2">
            <i data-lucide="check-circle-2"
               style="width:13px;height:13px;color:${this.confirmed.size >= 4 ? '#4ADE80' : 'rgba(255,255,255,0.3)'}"></i>
            <span id="ready-count" class="font-ui"
                  style="font-size:11px; color:${this.confirmed.size >= 4 ? '#4ADE80' : 'rgba(255,255,255,0.4)'}; letter-spacing:0.08em">
              ${this.confirmed.size}/4 PRONTI
            </span>
          </div>
          <button id="confirm-btn"
                  class="shrink-0 px-4 py-1.5 rounded-lg font-ui transition-all duration-200 hover:brightness-110"
                  style="background:linear-gradient(135deg, #FFD700, #F0A500); font-size:12px; letter-spacing:0.1em; color:#0F2A20; display:${this.shouldShowConfirmButton() ? 'block' : 'none'}">
            CONFERMA PRESENZA
          </button>
        </div>

      </div>
    `;
  }

  private renderPlayerRow(playerId: number, role: string, teamColor: string): string {
    const player = this.players.get(playerId);
    const name = player?.name ?? `Giocatore #${playerId}`;
    const initials = player ? getInitials(player.name) : '??';
    const playerClass = player?.class ?? 4;
    const color = getClassColor(playerClass);
    const elo = player ? getDisplayElo(player) : '---';
    const isConfirmed = this.confirmed.has(playerId);
    const isMe = playerId === this.myPlayerId;

    return `
      <div class="player-row flex items-center justify-between p-2.5 md:p-3 rounded-lg"
           data-player-id="${playerId}"
           style="background:${isConfirmed ? `${teamColor}26` : 'rgba(255,255,255,0.04)'};
                  border:1px solid ${isConfirmed ? `${teamColor}66` : 'rgba(255,255,255,0.08)'};
                  transition:all 0.3s">
        <div class="flex items-center gap-2 min-w-0">
          ${renderPlayerAvatar({ initials, color, size: 'sm', playerId })}
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-white truncate font-ui"
                    style="font-size:13px; font-weight:600">
                ${name.toUpperCase()}${isMe ? ' (TU)' : ''}
              </span>
              <span class="px-1.5 py-0.5 rounded font-ui shrink-0"
                    style="font-size:9px; letter-spacing:0.08em; color:${teamColor};
                           background:${teamColor}22; border:1px solid ${teamColor}44">
                ${role}
              </span>
            </div>
            <div class="font-ui" style="font-size:10px; color:var(--color-gold)">
              ${elo} ELO
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 ml-2">
          <span class="ready-dot w-2.5 h-2.5 rounded-full"
                data-player-id="${playerId}"
                style="background:${isConfirmed ? '#4ADE80' : '#6B7280'}; transition:background 0.3s"></span>
          <span class="font-ui"
                style="font-size:10px; letter-spacing:0.08em;
                       color:${isConfirmed ? '#4ADE80' : 'rgba(255,255,255,0.4)'}">
            ${isConfirmed ? 'PRONTO' : 'IN ATTESA'}
          </span>
        </div>
      </div>
    `;
  }

  private renderChat(): string {
    return `
      <div id="lobby-chat" class="rounded-xl overflow-hidden flex flex-col"
           style="background:rgba(15,42,32,0.85); border:1px solid rgba(255,255,255,0.1);
                  backdrop-filter:blur(8px)">

        <!-- Chat header -->
        <div class="px-4 py-3 flex items-center gap-2 shrink-0"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid rgba(255,215,0,0.2)">
          <i data-lucide="message-circle" style="width:14px;height:14px;color:var(--color-gold)"></i>
          <span class="font-ui"
                style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
            LOBBY CHAT
          </span>
          <div class="ml-auto flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse"></span>
            <span class="font-ui"
                  style="font-size:10px; color:rgba(255,255,255,0.4)">
              LIVE
            </span>
          </div>
        </div>

        <!-- Messages -->
        <div id="chat-messages" class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0"
             style="min-height:200px; max-height:380px">
          <div id="chat-empty" class="text-center py-8 font-ui"
               style="font-size:12px; color:rgba(255,255,255,0.3); letter-spacing:0.1em">
            NESSUN MESSAGGIO
          </div>
        </div>

        <!-- Input -->
        <div class="p-3 shrink-0" style="border-top:1px solid rgba(255,255,255,0.06)">
          <div id="chat-error" class="font-ui mb-1"
               style="font-size:10px; color:#ff4444; display:none; letter-spacing:0.05em"></div>
          <form id="chat-form" class="flex gap-2">
            <input id="chat-input" type="text" maxlength="${CHAT_MAX_LENGTH}"
                   placeholder="Scrivi un messaggio..."
                   class="flex-1 px-3 py-2 rounded-lg text-white placeholder-white/25 outline-none font-body"
                   style="background:rgba(10,25,18,0.8); border:1px solid rgba(255,255,255,0.1);
                          font-size:12px; min-width:0"
                   autocomplete="off" />
            <button type="submit"
                    class="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 hover:brightness-110 shrink-0"
                    style="background:linear-gradient(135deg, #FFD700, #F0A500)">
              <i data-lucide="send" style="width:14px;height:14px;color:#0F2A20"></i>
            </button>
          </form>
        </div>

      </div>
    `;
  }

  private renderAquarium(): string {
    return `
      <div id="lobby-aquarium" class="rounded-xl overflow-hidden relative"
           style="background:linear-gradient(180deg, rgba(0,40,80,0.6) 0%, rgba(0,20,50,0.9) 100%);
                  border:1px solid rgba(255,255,255,0.1); backdrop-filter:blur(8px);
                  min-height:220px">

        <!-- Header -->
        <div class="px-4 md:px-5 py-3 flex items-center gap-2 relative z-10"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid rgba(255,215,0,0.2)">
          <i data-lucide="fish" style="width:14px;height:14px;color:var(--color-gold)"></i>
          <span class="font-ui"
                style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
            ACQUARIO
          </span>
          <span id="fish-count" class="ml-auto font-ui"
                style="font-size:10px; color:rgba(255,255,255,0.4)">
            ${this.confirmed.size} PESCI
          </span>
        </div>

        <!-- Fish area -->
        <div id="aquarium" class="relative" style="height:180px; overflow:hidden">
          <div id="god-rays" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
        </div>

      </div>
    `;
  }

  // ── Countdown ────────────────────────────────────────────────

  private formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private tickCountdown(): void {
    if (this.countdownSeconds <= 0) return;

    this.countdownSeconds--;
    const color = this.getCountdownColor();
    const circumference = 2 * Math.PI * 28;
    const pct = this.countdownTotal > 0
      ? (this.countdownSeconds / this.countdownTotal) * 100
      : 0;
    const offset = circumference * (1 - pct / 100);

    const circle = this.$id('countdown-circle');
    const text = this.$id('countdown-text');
    if (circle) {
      circle.setAttribute('stroke', color);
      circle.setAttribute('stroke-dashoffset', String(offset));
    }
    if (text) {
      text.textContent = this.formatCountdown(this.countdownSeconds);
      text.style.color = color;
    }

    if (this.countdownSeconds <= 0) {
      this.onCountdownExpired();
    }
  }

  private getCountdownColor(): string {
    if (this.countdownTotal <= 0) return '#F87171';
    const pct = (this.countdownSeconds / this.countdownTotal) * 100;
    if (pct > 50) return '#4ADE80';
    if (pct > 25) return '#FFD700';
    return '#F87171';
  }

  private onCountdownExpired(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
    // Could navigate away or show "time's up" state
  }

  // ── Lobby polling ────────────────────────────────────────────

  private async pollLobby(): Promise<void> {
    try {
      const [lobbyRes, stateRes] = await Promise.all([
        fetch(`${API_BASE_URL}/check-lobby`),
        fetch(`${API_BASE_URL}/lobby-state`)
      ]);

      if (lobbyRes.ok) {
        const lobbyData = await lobbyRes.json();
        const hadLobby = !!this.lobbyData;

        if (lobbyData.exists && lobbyData.match) {
          this.lobbyData = lobbyData.match as IRunningMatchDTO;
          // Resolve players
          const ids = [
            this.lobbyData.teamA.defence,
            this.lobbyData.teamA.attack,
            this.lobbyData.teamB.defence,
            this.lobbyData.teamB.attack
          ];
          for (const id of ids) {
            if (!this.players.has(id)) {
              const p = getPlayerById(id);
              if (p) this.players.set(id, p);
            }
          }
        }

        // Sync countdown from server TTL (with drift threshold)
        if (lobbyData.exists && typeof lobbyData.ttl === 'number' && lobbyData.ttl > 0) {
          const serverTtl = lobbyData.ttl;
          if (Math.abs(this.countdownSeconds - serverTtl) > 5) {
            this.countdownSeconds = serverTtl;
          }
          // Keep total in sync for percentage calculations
          if (this.countdownTotal < serverTtl) {
            this.countdownTotal = serverTtl;
          }
        }

        // Re-render teams section when lobby activates
        if (!hadLobby && this.lobbyData) {
          const teamsSection = this.$id('teams-section');
          if (teamsSection) {
            teamsSection.innerHTML = this.renderTeams();
            refreshIcons();
            this.bindConfirmButton();
            gsap.from('.team-card', {
              opacity: 0,
              y: 20,
              stagger: 0.1,
              duration: 0.4,
              ease: 'power2.out'
            });
          }
        }
      }

      if (stateRes.ok) {
        const stateData = await stateRes.json();
        const confirmations: IConfirmation[] = stateData.confirmations ?? [];
        const oldSize = this.confirmed.size;
        this.confirmed.clear();
        for (const c of confirmations) {
          this.confirmed.add(c.playerId);
        }

        // Update ready dots in the DOM
        this.updateReadyStatus();

        // Sync fish in aquarium
        this.syncFish(confirmations);

        // If current player is now confirmed, hide button
        if (this.myPlayerId && this.confirmed.has(this.myPlayerId)) {
          const btn = this.$id('confirm-btn') as HTMLButtonElement | null;
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'CONFERMATO';
            btn.style.opacity = '0.7';
          }
        }

        // Update ready count text
        const countEl = this.$id('ready-count');
        if (countEl) {
          countEl.textContent = `${this.confirmed.size}/4 PRONTI`;
          countEl.style.color = this.confirmed.size >= 4 ? '#4ADE80' : 'rgba(255,255,255,0.4)';
        }

        // Update fish count
        const fishCount = this.$id('fish-count');
        if (fishCount) {
          fishCount.textContent = `${this.confirmed.size} PESCI`;
        }
      }
    } catch (err) {
      console.error('[LobbyPage] Poll error:', err);
    }
  }

  private updateReadyStatus(): void {
    const dots = this.$$('.ready-dot');
    for (const dot of dots) {
      const id = Number(dot.dataset.playerId);
      const isReady = this.confirmed.has(id);
      dot.style.background = isReady ? '#4ADE80' : '#6B7280';

      // Also update the parent row background
      const row = dot.closest('.player-row') as HTMLElement | null;
      if (row) {
        const statusText = row.querySelector('.font-ui:last-child') as HTMLElement | null;
        if (statusText && statusText.textContent) {
          // Check the text is a status indicator
          if (statusText.textContent.includes('ATTESA') || statusText.textContent.includes('PRONTO')) {
            statusText.textContent = isReady ? 'PRONTO' : 'IN ATTESA';
            statusText.style.color = isReady ? '#4ADE80' : 'rgba(255,255,255,0.4)';
          }
        }
      }
    }
  }

  // ── Confirm attendance ───────────────────────────────────────

  private bindConfirmButton(): void {
    const btn = this.$id('confirm-btn') as HTMLButtonElement | null;
    if (!btn) return;

    btn.addEventListener('click', async () => {
      if (!this.myPlayerId) return;

      btn.disabled = true;
      btn.textContent = '...';

      try {
        const res = await fetch(`${API_BASE_URL}/confirm-availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: this.myPlayerId,
            subscription: localStorage.getItem('biliardino_subscription')
          })
        });

        if (!res.ok) throw new Error('Errore nella conferma');

        this.confirmed.add(this.myPlayerId);
        btn.textContent = 'CONFERMATO';
        btn.style.opacity = '0.7';
        this.updateReadyStatus();
      } catch (err: any) {
        console.error('[LobbyPage] Confirm error:', err);
        btn.disabled = false;
        btn.textContent = 'CONFERMA PRESENZA';
      }
    });
  }

  private shouldShowConfirmButton(): boolean {
    if (!this.myPlayerId || !this.lobbyData) return false;
    if (this.confirmed.has(this.myPlayerId)) return false;
    const ids = [
      this.lobbyData.teamA.defence,
      this.lobbyData.teamA.attack,
      this.lobbyData.teamB.defence,
      this.lobbyData.teamB.attack
    ];
    return ids.includes(this.myPlayerId);
  }

  // ── Admin Broadcast ─────────────────────────────────────────

  private renderAdminBroadcastCard(): string {
    return `
      <div class="team-card glass-card rounded-xl p-6 text-center">
        <p class="font-display text-xl text-[var(--color-gold)] mb-2"
           style="letter-spacing:0.12em">
          NESSUNA LOBBY ATTIVA
        </p>
        <p class="font-body text-sm mb-6" style="color:rgba(255,255,255,0.4)">
          Invia la notifica per iniziare una partita
        </p>

        <!-- Animation container -->
        <div class="relative mx-auto" style="width:220px; height:80px">
          <!-- Cue stick (starts off-screen right) -->
          <div id="cue-stick" class="absolute" style="top:24px; left:220px; opacity:0">
            <svg width="120" height="12" viewBox="0 0 120 12">
              <defs>
                <linearGradient id="cue-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stop-color="#2D5A27"/>
                  <stop offset="8%" stop-color="#8B6914"/>
                  <stop offset="15%" stop-color="#F5DEB3"/>
                  <stop offset="100%" stop-color="#4A3728"/>
                </linearGradient>
              </defs>
              <rect x="0" y="3" width="120" height="6" rx="3" fill="url(#cue-grad)"/>
              <rect x="0" y="4" width="4" height="4" rx="1" fill="#2D5A27"/>
            </svg>
          </div>

          <!-- Billiard ball -->
          <button id="broadcast-btn" class="absolute cursor-pointer border-0 bg-transparent p-0"
                  style="top:12px; left:50%; transform:translateX(-50%)">
            <svg width="56" height="56" viewBox="0 0 56 56">
              <defs>
                <radialGradient id="ball-grad" cx="0.35" cy="0.3" r="0.65">
                  <stop offset="0%" stop-color="#ffffff"/>
                  <stop offset="40%" stop-color="#f0f0f0"/>
                  <stop offset="100%" stop-color="#c0c0c0"/>
                </radialGradient>
                <radialGradient id="ball-shine" cx="0.3" cy="0.25" r="0.25">
                  <stop offset="0%" stop-color="rgba(255,255,255,0.9)"/>
                  <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
                </radialGradient>
                <filter id="ball-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
                </filter>
              </defs>
              <circle cx="28" cy="28" r="24" fill="url(#ball-grad)" filter="url(#ball-shadow)"/>
              <circle cx="28" cy="28" r="24" fill="url(#ball-shine)"/>
              <circle cx="28" cy="24" r="10" fill="rgba(255,215,0,0.15)"/>
              <text x="28" y="28" text-anchor="middle" dominant-baseline="central"
                    font-family="var(--font-display)" font-size="14" fill="rgba(0,0,0,0.6)"
                    letter-spacing="0.05em">8</text>
            </svg>
          </button>
        </div>

        <!-- Feedback area -->
        <div id="broadcast-feedback" class="font-ui mt-4"
             style="font-size:12px; letter-spacing:0.08em; min-height:20px; display:none">
        </div>

        <p class="font-ui mt-4" style="font-size:10px; color:rgba(255,255,255,0.3); letter-spacing:0.1em">
          PREMI LA PALLA PER INVIARE LE NOTIFICHE
        </p>
      </div>
    `;
  }

  private bindBroadcastButton(): void {
    const btn = this.$id('broadcast-btn');
    if (!btn) return;

    // Idle pulse animation
    gsap.to(btn, {
      scale: 1.03,
      duration: 1.2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1
    });

    btn.addEventListener('click', () => this.handleBroadcast());
  }

  private async handleBroadcast(): Promise<void> {
    if (this.isBroadcasting) return;
    this.isBroadcasting = true;

    const ball = this.$id('broadcast-btn');
    const cue = this.$id('cue-stick');
    if (!ball || !cue) {
      this.isBroadcasting = false;
      return;
    }

    // Kill idle pulse
    gsap.killTweensOf(ball);
    gsap.set(ball, { scale: 1 });

    // ── Strike animation timeline ──
    const tl = gsap.timeline();

    // 1. Cue appears and slides toward ball
    tl.to(cue, {
      left: 140,
      opacity: 1,
      duration: 0.5,
      ease: 'power2.out'
    });

    // 2. Strike — cue jolts into ball
    tl.to(cue, {
      left: 125,
      duration: 0.08,
      ease: 'power4.in'
    });

    // 3. Ball squash-stretch reaction + bounce
    tl.to(ball, {
      scaleX: 0.85,
      scaleY: 1.15,
      x: -15,
      duration: 0.1,
      ease: 'power2.out'
    }, '<');
    tl.to(ball, {
      scaleX: 1.05,
      scaleY: 0.95,
      x: -30,
      duration: 0.15,
      ease: 'power2.out'
    });
    tl.to(ball, {
      scaleX: 1,
      scaleY: 1,
      x: 0,
      duration: 0.4,
      ease: 'elastic.out(1, 0.4)'
    });

    // 4. Cue retracts off-screen
    tl.to(cue, {
      left: 220,
      opacity: 0,
      duration: 0.4,
      ease: 'power2.in'
    }, '-=0.3');

    // 5. Ball fades to loading state
    tl.to(ball, {
      opacity: 0.5,
      duration: 0.3
    });

    // Wait for animation
    await tl.then();

    // ── API flow ──
    try {
      // 1. Get running match from Firestore
      const runningMatch = await fetchRunningMatch();
      if (!runningMatch) {
        this.showBroadcastFeedback('NESSUN MATCH GENERATO — VAI AL MATCHMAKING', '#F87171');
        this.resetBroadcastButton();
        return;
      }

      // 2. Send broadcast
      const token = localStorage.getItem('biliardino_admin_token');
      const res = await fetch(`${API_BASE_URL}/send-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ match: runningMatch })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Errore ${res.status}`);
      }

      const result = await res.json();

      // 3. Show success feedback
      this.showBroadcastFeedback(
        `${result.sent}/${result.total} NOTIFICHE INVIATE`,
        '#4ADE80'
      );

      // 4. Activate lobby state
      appState.lobbyActive = true;
      appState.emit('lobby-change');

      // 5. Poll lobby after a short delay to load teams
      setTimeout(() => this.pollLobby(), 1500);
    } catch (err: any) {
      console.error('[LobbyPage] Broadcast error:', err);
      this.showBroadcastFeedback(
        err.message || 'ERRORE INVIO NOTIFICHE',
        '#F87171'
      );
      this.resetBroadcastButton();
    }
  }

  private showBroadcastFeedback(message: string, color: string): void {
    const feedback = this.$id('broadcast-feedback');
    if (!feedback) return;
    feedback.style.display = 'block';
    feedback.style.color = color;
    feedback.textContent = message;
  }

  private resetBroadcastButton(): void {
    this.isBroadcasting = false;
    const ball = this.$id('broadcast-btn');
    if (ball) {
      gsap.to(ball, { opacity: 1, scale: 1, duration: 0.3 });
      // Restart idle pulse
      gsap.to(ball, {
        scale: 1.03,
        duration: 1.2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: 0.5
      });
    }
  }

  // ── Chat ─────────────────────────────────────────────────────

  private bindChatEvents(): void {
    const form = this.$id('chat-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendChatMessage();
    });
  }

  private async sendChatMessage(): Promise<void> {
    const input = this.$id('chat-input') as HTMLInputElement | null;
    const errorEl = this.$id('chat-error') as HTMLElement | null;
    if (!input || !this.myPlayerId) return;

    const text = input.value.trim();
    if (!text) return;

    if (text.length > CHAT_MAX_LENGTH) {
      if (errorEl) {
        errorEl.textContent = `Massimo ${CHAT_MAX_LENGTH} caratteri`;
        errorEl.style.display = 'block';
        setTimeout(() => { errorEl.style.display = 'none'; }, 1500);
      }
      return;
    }

    try {
      const player = this.players.get(this.myPlayerId);
      const playerName = player?.name ?? 'Giocatore';
      const fishType = player ? (FISH_TYPES[player.class] ?? 'Tonno') : 'Tonno';

      await MessageService.sendMessage(
        this.myPlayerId,
        playerName,
        fishType,
        text
      );
      input.value = '';
    } catch (err) {
      console.error('[LobbyPage] Send message error:', err);
    }
  }

  private async pollMessages(): Promise<void> {
    try {
      const data = await MessageService.getMessages(
        this.lastMessageTimestamp > 0 ? this.lastMessageTimestamp : undefined
      );

      if (data.messages && data.messages.length > 0) {
        // Determine if there are truly new messages
        const newMessages = data.messages.filter(
          m => m.sentAt > this.lastMessageTimestamp
        );

        if (newMessages.length > 0 || this.messages.length === 0) {
          // On first load, take all messages; afterwards, only new ones
          if (this.messages.length === 0) {
            this.messages = data.messages;
          } else {
            this.messages.push(...newMessages);
          }

          for (const m of data.messages) {
            this.lastMessageTimestamp = Math.max(this.lastMessageTimestamp, m.sentAt);
          }

          this.renderMessages();
        }
      }
    } catch (err) {
      console.error('[LobbyPage] Message poll error:', err);
    }
  }

  private renderMessages(): void {
    const container = this.$id('chat-messages');
    if (!container) return;

    const empty = this.$id('chat-empty');
    if (empty && this.messages.length > 0) {
      empty.remove();
    }

    // Clear and re-render all (simple approach)
    container.innerHTML = '';

    for (const msg of this.messages) {
      const player = this.players.get(msg.playerId) ?? getPlayerById(msg.playerId);
      const initials = player ? getInitials(player.name) : '??';
      const playerClass = player?.class ?? 4;
      const color = getClassColor(playerClass);
      const displayName = msg.playerName || player?.name || `#${msg.playerId}`;
      const time = new Date(msg.sentAt).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit'
      });

      // Fish sprite (small inline) if available
      const fishType = msg.fishType as keyof typeof FISH_SPRITES;
      const fishSvg = FISH_SPRITES[fishType]
        ? `<span class="inline-block" style="width:16px;height:12px;opacity:0.7">${FISH_SPRITES[fishType]}</span>`
        : '';

      const el = document.createElement('div');
      el.className = 'flex items-start gap-2';
      el.innerHTML = `
        ${renderPlayerAvatar({ initials, color, size: 'xs', playerId: msg.playerId })}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            ${fishSvg}
            <span class="font-ui" style="font-size:11px; color:${color}">
              ${displayName}
            </span>
            <span class="font-body" style="font-size:10px; color:rgba(255,255,255,0.25)">
              ${time}
            </span>
          </div>
          <div class="px-2.5 py-1.5 rounded-lg rounded-tl-none font-body"
               style="background:rgba(255,255,255,0.06); font-size:12px;
                      color:rgba(255,255,255,0.8); line-height:1.5; word-break:break-word">
            ${this.escapeHtml(msg.text)}
          </div>
        </div>
      `;
      container.appendChild(el);
    }

    // Auto-scroll
    container.scrollTop = container.scrollHeight;

    // Re-create lucide icons for the newly added elements
    refreshIcons();
  }

  // ── Fish aquarium ────────────────────────────────────────────

  private syncFish(confirmations: IConfirmation[]): void {
    const activeIds = new Set(confirmations.map(c => c.playerId));

    // Remove fish for players who left
    for (const id of Array.from(this.fishMap.keys())) {
      if (!activeIds.has(id)) this.removeFish(id);
    }

    // Spawn fish for confirmed players
    const sorted = [...confirmations].sort(
      (a, b) => new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime()
    );
    sorted.forEach((conf, i) => {
      const isMe = conf.playerId === this.myPlayerId;
      const fishName = conf.fishName || `Giocatore #${conf.playerId}`;
      const name = isMe ? 'Tu' : fishName;
      this.spawnFish(conf.playerId, name, i);
    });
  }

  private spawnFish(playerId: number, name: string, index: number): void {
    const aquarium = this.$id('aquarium');
    if (!aquarium || this.fishMap.has(playerId)) return;

    const isMe = playerId === this.myPlayerId;
    const fishTypeKey = isMe ? 'Squalo' : FISH_TYPES[index % FISH_TYPES.length];
    const labelColor = LABEL_COLORS[index % LABEL_COLORS.length];
    const svgSprite = FISH_SPRITES[fishTypeKey as keyof typeof FISH_SPRITES] || FISH_SPRITES.Tonno;

    const fish = document.createElement('div');
    fish.className = 'absolute pointer-events-none';
    fish.style.cssText = 'transition:opacity 0.5s; z-index:5;';
    fish.dataset.playerId = String(playerId);
    fish.innerHTML = `
      <div class="fish-sprite" style="width:32px;height:24px">${svgSprite}</div>
      <span class="font-ui block text-center mt-0.5 px-1 py-0.5 rounded"
            style="font-size:8px; letter-spacing:0.05em; color:white;
                   background:${labelColor}; white-space:nowrap; max-width:80px;
                   overflow:hidden; text-overflow:ellipsis">
        ${isMe ? 'TU' : name}
      </span>
    `;

    aquarium.appendChild(fish);
    this.fishMap.set(playerId, fish);

    const aquariumRect = aquarium.getBoundingClientRect();
    const margin = 20;
    const fishSprite = fish.querySelector('.fish-sprite') as HTMLElement | null;

    this.fishMovement.set(playerId, {
      x: this.rand(margin, aquariumRect.width - margin - 40),
      y: this.rand(margin, aquariumRect.height - margin - 30),
      vx: this.rand(-1, 1),
      vy: this.rand(-0.5, 0.5),
      speed: this.rand(0.5, 1.5),
      element: fish,
      sprite: fishSprite
    });
  }

  private removeFish(playerId: number): void {
    const fish = this.fishMap.get(playerId);
    if (!fish) return;
    fish.style.opacity = '0';
    setTimeout(() => {
      fish.remove();
      this.fishMap.delete(playerId);
      this.fishMovement.delete(playerId);
    }, 500);
  }

  private startFishAnimation(): void {
    const loop = () => {
      this.updateFishMovement();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private updateFishMovement(): void {
    const aquarium = this.$id('aquarium');
    if (!aquarium) return;

    const w = aquarium.clientWidth;
    const h = aquarium.clientHeight;
    const margin = 10;

    this.fishMovement.forEach((movement, playerId) => {
      const { element, sprite } = movement;
      if (!element || !aquarium.contains(element)) {
        this.fishMovement.delete(playerId);
        return;
      }

      movement.x += movement.vx * movement.speed;
      movement.y += movement.vy * movement.speed;

      // Bounce off walls
      if (movement.x <= margin || movement.x >= w - margin - 40) {
        movement.vx *= -1;
        movement.x = Math.max(margin, Math.min(w - margin - 40, movement.x));
      }
      if (movement.y <= margin || movement.y >= h - margin - 30) {
        movement.vy *= -1;
        movement.y = Math.max(margin, Math.min(h - margin - 30, movement.y));
      }

      // Random direction changes
      if (Math.random() < 0.01) {
        movement.vx += this.rand(-0.3, 0.3);
        movement.vy += this.rand(-0.2, 0.2);
        const maxSpeed = 2;
        const currentSpeed = Math.sqrt(movement.vx ** 2 + movement.vy ** 2);
        if (currentSpeed > maxSpeed) {
          movement.vx = (movement.vx / currentSpeed) * maxSpeed;
          movement.vy = (movement.vy / currentSpeed) * maxSpeed;
        }
      }

      element.style.transform = `translate(${movement.x}px, ${movement.y}px)`;

      // Flip fish based on direction
      if (sprite) {
        sprite.style.transform = movement.vx < 0 ? 'scaleX(-1)' : 'scaleX(1)';
      }
    });
  }

  // ── Aquarium visual effects ──────────────────────────────────

  private spawnBubbles(): void {
    const aquarium = this.$id('aquarium');
    if (!aquarium) return;

    for (let i = 0; i < 14; i++) {
      const b = document.createElement('div');
      const size = this.rand(6, 18);
      b.style.cssText = `
        position:absolute; border-radius:50%; pointer-events:none; z-index:2;
        width:${size}px; height:${size}px;
        left:${this.rand(3, 97)}%;
        background:radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), rgba(255,255,255,0.05));
        animation: bubble-rise ${this.rand(7, 16)}s linear ${this.rand(0, 10)}s infinite;
      `;
      aquarium.appendChild(b);
    }

    // Inject keyframes if not present
    if (!document.getElementById('lobby-aquarium-styles')) {
      const style = document.createElement('style');
      style.id = 'lobby-aquarium-styles';
      style.textContent = `
        @keyframes bubble-rise {
          0% { bottom: -10px; opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.3; }
          100% { bottom: 100%; opacity: 0; transform: translateX(${this.rand(-30, 30)}px); }
        }
        @keyframes god-ray-sway {
          0%, 100% { opacity: var(--ray-opacity, 0.5); transform: rotate(var(--ray-angle, -15deg)) translateX(0); }
          50% { opacity: calc(var(--ray-opacity, 0.5) * 0.6); transform: rotate(var(--ray-angle, -15deg)) translateX(20px); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  private spawnGodRays(): void {
    const container = this.$id('god-rays');
    if (!container) return;

    for (let i = 0; i < 4; i++) {
      const r = document.createElement('div');
      const baseAngle = -15;
      const angle = baseAngle + this.rand(-5, 5);
      const width = this.rand(80, 180);
      const opacity = this.rand(0.3, 0.5);
      const dur = this.rand(7, 14);
      r.style.cssText = `
        position:absolute; top:-20px; height:120%;
        left:${20 + i * 18 + this.rand(-5, 5)}%;
        width:${width}px;
        background:linear-gradient(180deg, rgba(255,215,0,${opacity * 0.3}) 0%, transparent 100%);
        transform:rotate(${angle}deg); transform-origin:top center;
        --ray-angle:${angle}deg; --ray-opacity:${opacity};
        animation: god-ray-sway ${dur}s ease-in-out infinite;
        pointer-events:none; z-index:1;
      `;
      container.appendChild(r);
    }
  }

  // ── Utilities ────────────────────────────────────────────────

  private rand(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export default LobbyPage;
