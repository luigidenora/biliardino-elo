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
import { FISH_SPRITES } from '@/utils/fish-sprites.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import gsap from 'gsap';
import { BroadcastKickComponent } from '../components/broadcast-kick.component';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { refreshIcons } from '../icons';
import { appState } from '../state';

import type { IRunningMatchDTO } from '@/models/match.interface';
import type { IMessage } from '@/models/message.interface';
import type { IPlayer } from '@/models/player.interface';

// ── Constants ────────────────────────────────────────────────────

const LOBBY_TTL_DEFAULT = 5400; // 90 min
const POLL_INTERVAL_MS = 10_000;
const MSG_POLL_INTERVAL_MS = 15_000;
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
  private lobbyExists = false;
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
  private confirmKick: BroadcastKickComponent | null = null;

  // ── Render ───────────────────────────────────────────────────

  override async render(): Promise<string> {
    this.myPlayerId = Number(localStorage.getItem('biliardino_player_id')) || null;
    this.isAdmin = isPlayerAdmin(this.myPlayerId);

    // Attempt to load lobby data on render
    try {
      const res = await fetch(`${API_BASE_URL}/check-lobby`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          this.lobbyExists = true;
        }
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
    console.log('[LobbyPage] mount() called');
    refreshIcons();

    // Start countdown
    this.countdownInterval = setInterval(() => this.tickCountdown(), 1000);

    // Start lobby polling
    console.log('[LobbyPage] Starting pollLobby()');
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
    this.bindConfirmKick();

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
    this.confirmKick?.destroy();
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
        if (this.lobbyExists) {
          return this.renderConfirmKickCard();
        }
        return this.renderAdminBroadcastCard();
      }
      if (this.lobbyExists) {
        return this.renderConfirmKickCard();
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
        <div id="chat-input-area" class="shrink-0"
             style="border-top:1px solid rgba(255,255,255,0.06)">
          ${this.isMyPresenceConfirmed
            ? `
            <div class="p-3">
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
          `
            : `
            <div class="px-4 py-4 flex items-center justify-center gap-2">
              <i data-lucide="lock" style="width:13px;height:13px;color:rgba(255,255,255,0.3)"></i>
              <span class="font-ui"
                    style="font-size:11px; color:rgba(255,255,255,0.3); letter-spacing:0.1em">
                CONFERMA LA PRESENZA PER CHATTARE
              </span>
            </div>
          `}
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
          ${!this.isMyPresenceConfirmed
            ? `
            <div id="aquarium-lock"
                 class="absolute inset-0 flex flex-col items-center justify-center gap-2 z-20"
                 style="background:rgba(0,10,25,0.6); backdrop-filter:blur(3px)">
              <i data-lucide="lock" style="width:22px;height:22px;color:rgba(255,255,255,0.35)"></i>
              <span class="font-ui"
                    style="font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:0.12em; text-align:center; line-height:1.8">
                CONFERMA LA PRESENZA<br>PER SBLOCCARE IL MINIGIOCO
              </span>
            </div>
          `
            : ''}
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
    console.log('[LobbyPage] pollLobby() called');
    try {
      console.log('[LobbyPage] Fetching:', `${API_BASE_URL}/check-lobby`, `${API_BASE_URL}/lobby-state`);
      const [lobbyRes, stateRes] = await Promise.all([
        fetch(`${API_BASE_URL}/check-lobby`),
        fetch(`${API_BASE_URL}/lobby-state`)
      ]);
      console.log('[LobbyPage] Fetch responses:', lobbyRes, stateRes);

      if (lobbyRes.ok) {
        const lobbyData = await lobbyRes.json();
        console.log('[LobbyPage] lobbyData:', lobbyData);
        const hadLobby = !!this.lobbyData;
        const hadLobbyExists = this.lobbyExists;
        this.lobbyExists = lobbyData.exists;

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

        // Re-render teams section when lobby state changes
        if ((!hadLobby && this.lobbyData) || (!hadLobbyExists && this.lobbyExists)) {
          const teamsSection = this.$id('teams-section');
          if (teamsSection) {
            teamsSection.innerHTML = this.renderTeams();
            refreshIcons();
            this.bindConfirmButton();
            this.bindBroadcastButton();
            this.bindConfirmKick();
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
        console.log('[LobbyPage] stateData:', stateData);
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

        // If current player is now confirmed, hide button and unlock components
        if (this.myPlayerId && this.confirmed.has(this.myPlayerId)) {
          const btn = this.$id('confirm-btn') as HTMLButtonElement | null;
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'CONFERMATO';
            btn.style.opacity = '0.7';
          }
          this.updateUnlockedState();
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

  private updateUnlockedState(): void {
    if (!this.isMyPresenceConfirmed) return;

    // Unlock chat: swap lock banner with actual form
    const chatInputArea = this.$id('chat-input-area');
    if (chatInputArea && !this.$id('chat-form')) {
      chatInputArea.innerHTML = `
        <div class="p-3">
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
      `;
      refreshIcons();
      this.bindChatEvents();
    }

    // Unlock aquarium: fade out and remove overlay
    const aquariumLock = this.$id('aquarium-lock');
    if (aquariumLock) {
      gsap.to(aquariumLock, {
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
        onComplete: () => aquariumLock.remove()
      });
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
        this.updateUnlockedState();
      } catch (err: any) {
        console.error('[LobbyPage] Confirm error:', err);
        btn.disabled = false;
        btn.textContent = 'CONFERMA PRESENZA';
      }
    });
  }

  private get isMyPresenceConfirmed(): boolean {
    return !!(this.myPlayerId && this.lobbyExists && this.confirmed.has(this.myPlayerId));
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
        <i data-lucide="bell" class="mx-auto mb-3"
           style="width:32px;height:32px;color:var(--color-gold)"></i>
        <p class="font-display text-xl text-[var(--color-gold)] mb-2"
           style="letter-spacing:0.12em">
          NESSUNA LOBBY ATTIVA
        </p>
        <p class="font-body text-sm mb-6" style="color:rgba(255,255,255,0.4)">
          Invia la notifica per iniziare una partita
        </p>
        <button id="admin-broadcast-btn"
                class="px-6 py-2.5 rounded-lg font-ui transition-all duration-200 hover:brightness-110 active:scale-95"
                style="background:linear-gradient(135deg, #FFD700, #F0A500); font-size:13px; letter-spacing:0.12em; color:#0F2A20">
          AVVIA PARTITA
        </button>
        <p id="admin-broadcast-feedback" class="font-ui mt-4" style="font-size:11px; color:rgba(255,255,255,0.3); letter-spacing:0.1em; min-height:16px"></p>
      </div>
    `;
  }

  private renderConfirmKickCard(): string {
    this.confirmKick?.destroy();
    this.confirmKick = new BroadcastKickComponent();
    const alreadyConfirmed = this.myPlayerId ? this.confirmed.has(this.myPlayerId) : false;
    return `
      <div class="team-card glass-card rounded-xl p-6 text-center overflow-visible">
        <p class="font-display text-xl text-[var(--color-gold)] mb-2"
           style="letter-spacing:0.12em">
          LOBBY ATTIVA
        </p>
        <p class="font-body text-sm mb-6" style="color:rgba(255,255,255,0.4)">
          ${alreadyConfirmed ? 'Hai già confermato la tua presenza' : 'Premi la palla per confermare la tua presenza'}
        </p>
        ${alreadyConfirmed
            ? `<span class="font-ui" style="font-size:14px; color:#4ADE80; letter-spacing:0.1em">CONFERMATO</span>`
            : this.confirmKick.render()
        }
        ${!alreadyConfirmed
          ? `
          <p class="font-ui mt-4" style="font-size:10px; color:rgba(255,255,255,0.3); letter-spacing:0.1em">
            PREMI LA PALLA PER CONFERMARE LA PRESENZA
          </p>
        `
          : ''}
      </div>
    `;
  }

  private bindBroadcastButton(): void {
    const btn = this.$id('admin-broadcast-btn') as HTMLButtonElement | null;
    if (!btn) return;

    btn.addEventListener('click', () => this.handleBroadcast());
  }

  private async handleBroadcast(): Promise<void> {
    const btn = this.$id('admin-broadcast-btn') as HTMLButtonElement | null;
    const feedback = this.$id('admin-broadcast-feedback');
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = '...';

    try {
      const token = localStorage.getItem('biliardino_admin_token');
      const res = await fetch(`${API_BASE_URL}/send-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Errore ${res.status}`);
      }

      const result = await res.json();

      if (feedback) {
        feedback.textContent = `${result.sent}/${result.total} NOTIFICHE INVIATE`;
        feedback.style.color = '#4ADE80';
      }

      appState.lobbyActive = true;
      appState.emit('lobby-change');

      setTimeout(() => this.pollLobby(), 1500);
    } catch (err: any) {
      console.error('[LobbyPage] Broadcast error:', err);
      if (feedback) {
        feedback.textContent = err.message || 'ERRORE INVIO NOTIFICHE';
        feedback.style.color = '#F87171';
      }
      btn.disabled = false;
      btn.textContent = 'AVVIA PARTITA';
    }
  }

  // ── Confirm Kick ─────────────────────────────────────────────

  private bindConfirmKick(): void {
    if (!this.confirmKick) return;
    this.confirmKick.mount(() => this.handleConfirmKick());
  }

  private async handleConfirmKick(): Promise<void> {
    if (!this.confirmKick || !this.myPlayerId) return;

    const kicked = await this.confirmKick.playKick();
    if (!kicked) return;

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
      this.confirmKick.showFeedback('CONFERMATO', '#4ADE80');
      this.updateReadyStatus();
      this.updateUnlockedState();
    } catch (err: any) {
      console.error('[LobbyPage] Confirm kick error:', err);
      this.confirmKick.showFeedback(
        err.message || 'ERRORE CONFERMA',
        '#F87171'
      );
      this.confirmKick.reset();
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
