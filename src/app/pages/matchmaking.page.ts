/**
 * MatchmakingPage -- Admin-only matchmaking interface with 3-state player
 * selection, real-time availability updates, match generation via heuristic
 * algorithm, and score entry.
 *
 * Route: /matchmaking
 * Auth: admin guard (handled by router)
 *
 * Ported from: src/views/matchmaking.view.ts
 */

import { API_BASE_URL } from '@/config/env.config';
import { expectedScore } from '@/services/elo.service';
import { LobbyService } from '@/services/lobby.service';
import { addMatch } from '@/services/match.service';
import { findBestMatch } from '@/services/matchmaking.service';
import { getAllPlayers, getClass, getPlayerById } from '@/services/player.service';
import { clearRunningMatch, fetchMatchById, fetchRunningMatch, saveMatch, saveRunningMatch } from '@/services/repository.service';
import { availabilityList } from '@/utils/availability.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import haptics from '@/utils/haptics.util';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { refreshIcons } from '../icons';
import { createParticles } from '../particles/particles-manager';
import { appState } from '../state';

import type { ILobbyState } from '@/models/lobby.interface';
import type { IRunningMatchDTO } from '@/models/match.interface';
import type { IPlayer } from '@/models/player.interface';
import type { IMatchProposal } from '@/services/matchmaking.service';
import { RealtimeClient } from '@/services/realtime-client';
import { fuzzyMatch, highlightChars } from '@/utils/fuzzy-search.util';
import { renderMatchmakingPageHeader, renderMatchmakingPlayerList } from '../components/ui/matchmaking.ui';

// ── Constants ────────────────────────────────────────────────────

type PlayerState = 0 | 1 | 2;

const MIN_PLAYERS = 4;
const LOBBY_TTL_DEFAULT = 5400; // 90 min

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

// ── Page Component ───────────────────────────────────────────────

class MatchmakingPage extends Component {
  // ── State ─────────────────────────────────────────────────────

  private readonly playerStates: Map<number, PlayerState> = new Map();
  private generatedMatch: IMatchProposal | null = null;
  private confirmedPlayerIds: Set<number> = new Set();
  private lobbyStateListener: ((state: ILobbyState) => void) | null = null;
  private sseClient: RealtimeClient | null = null;
  private sseVisibilityHandler: (() => void) | null = null;
  private isGenerating = false;
  private isSaving = false;
  private searchQuery = '';
  private useRelaxedClassDiff = false;
  private lobbyExists = false;
  private lobbyConfirmedCount = 0;

  // ── Render ────────────────────────────────────────────────────

  override async render(): Promise<string> {
    const players = getAllPlayers().toSorted((a, b) => a.name.localeCompare(b.name));
    const totalPlayers = players.length;

    // Pre-populate states from daily availability
    this.initPlayerStates(players);

    // Pre-populate confirmedPlayerIds from cached lobby state (avoids empty set on first render)
    const cachedLobbyState = LobbyService.getState();
    if (cachedLobbyState) {
      this.lobbyExists = cachedLobbyState.exists;
      this.lobbyConfirmedCount = cachedLobbyState.count;
      this.confirmedPlayerIds = new Set(cachedLobbyState.confirmations.map(c => c.playerId));
      for (const playerId of this.confirmedPlayerIds) {
        if (this.playerStates.get(playerId) === 0) {
          this.playerStates.set(playerId, 1);
        }
      }
    }

    // Try to restore a previously saved running match
    await this.restoreSavedMatch();

    return `
      <div class="space-y-5 md:space-y-6" id="matchmaking-page">

        ${this.renderPageHeader(totalPlayers)}

        <!-- Mobile: Match panel shown first on small screens -->
        <div class="lg:hidden" id="match-panel-mobile">
          ${this.renderMatchPanel()}
        </div>

        <div class="flex flex-col lg:grid lg:grid-cols-[1fr_380px] gap-5 md:gap-6">

          <!-- LEFT: Player List -->
          <div id="player-list-panel">
            ${this.renderPlayerList(players)}
          </div>

          <!-- RIGHT: Match Panel (desktop) -->
          <div class="hidden lg:block space-y-4" id="match-panel-desktop">
            ${this.renderMatchPanel()}
          </div>

        </div>
      </div>
    `;
  }

  // ── Mount / Destroy ───────────────────────────────────────────

  override mount(): void {
    // Inject spinner keyframe once
    if (!document.getElementById('_matchmaking-spin-style')) {
      const style = document.createElement('style');
      style.id = '_matchmaking-spin-style';
      style.textContent = '@keyframes _spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    refreshIcons();

    this.bindToggleButtons();
    this.bindActionButtons();
    this.bindSearchFilter();

    // Initialize confirmations panel to "no confirmations" state immediately
    this.updateConfirmationsPanel({
      exists: false, ttl: 0, match: null, count: 0, confirmations: [], messages: [], messageCount: 0
    });

    this.startConfirmationsPolling();

    // GSAP entrance animations
    gsap.from('#matchmaking-page .page-header', {
      opacity: 0,
      y: -20,
      duration: 0.4,
      ease: 'power2.out'
    });

    gsap.from('.player-row', {
      x: -10,
      stagger: 0.03,
      duration: 0.25,
      ease: 'power2.out',
      delay: 0.1
    });

    gsap.from('.match-panel-card', {
      opacity: 0,
      x: 20,
      duration: 0.4,
      ease: 'power2.out',
      delay: 0.15
    });
  }

  override destroy(): void {
    this.stopConfirmationsPolling();
  }

  // ── Section Renderers ─────────────────────────────────────────

  private renderPageHeader(totalPlayers: number): string {
    return renderMatchmakingPageHeader(totalPlayers, MIN_PLAYERS);
  }

  private renderPlayerList(players: IPlayer[]): string {
    return renderMatchmakingPlayerList({
      players,
      playerStates: this.playerStates,
      confirmedPlayerIds: this.confirmedPlayerIds,
      selectedCount: this.getSelectedCount(),
      minPlayers: MIN_PLAYERS,
      getToggleBtnStyle: this.getToggleBtnStyle.bind(this),
      getToggleBtnIcon: this.getToggleBtnIcon.bind(this)
    });
  }

  private renderMatchPanel(): string {
    const matchContent = this.generatedMatch
      ? this.renderGeneratedMatch(this.generatedMatch)
      : `${this.renderEmptyMatchState()}${this.renderGenerateButton()}`;

    return `
      <div class="space-y-4 match-panel-card">
        <div id="lobby-panel">
          ${this.renderLobbyPanel()}
        </div>
        ${matchContent}
      </div>
    `;
  }

  private renderLobbyPanel(): string {
    if (this.lobbyExists) {
      return `
        <div class="flex items-center gap-2.5 px-4 py-3 rounded-xl"
             style="background:rgba(74,222,128,0.1); border:1px solid rgba(74,222,128,0.3)">
          <i data-lucide="wifi" style="width:14px;height:14px;color:#4ADE80;flex-shrink:0"></i>
          <span class="font-ui text-[#4ADE80]" style="font-size:12px; letter-spacing:0.1em">
            LOBBY ATTIVA
          </span>
          <span id="lobby-confirmed-count" class="font-ui ml-auto"
                style="font-size:11px; color:rgba(74,222,128,0.7); letter-spacing:0.06em">
            ${this.lobbyConfirmedCount} CONFERMATI
          </span>
        </div>
      `;
    }

    return `
      <div class="rounded-xl overflow-hidden"
           style="background:rgba(15,42,32,0.85); border:1px solid rgba(255,215,0,0.25); backdrop-filter:blur(8px)">
        <div class="px-4 py-3 flex items-center gap-2"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid rgba(255,215,0,0.2)">
          <i data-lucide="bell" style="width:14px;height:14px;color:var(--color-gold)"></i>
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
            AVVIA LOBBY
          </span>
        </div>
        <div class="p-4 space-y-3">
          <p class="font-body" style="font-size:12px; color:rgba(255,255,255,0.45); line-height:1.5">
            Invia la notifica ai giocatori prima di generare la partita.
          </p>
          <div class="flex items-center gap-3">
            <label for="lobby-duration-select" class="font-ui shrink-0"
                   style="font-size:11px; letter-spacing:0.08em; color:rgba(255,255,255,0.45)">
              DURATA
            </label>
            <select id="lobby-duration-select"
                    class="flex-1 rounded-lg px-3 py-1.5 font-ui"
                    style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,215,0,0.3);
                           color:#FFD700; font-size:12px; letter-spacing:0.06em; outline:none; cursor:pointer">
              <option value="1800">30 min</option>
              <option value="2700">45 min</option>
              <option value="3600">60 min</option>
              <option value="5400" selected>90 min</option>
              <option value="7200">120 min</option>
            </select>
          </div>
          <button id="admin-broadcast-btn"
                  class="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-ui transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                  style="background:linear-gradient(135deg,rgba(255,215,0,0.15),rgba(240,165,0,0.1));
                         border:1px solid rgba(255,215,0,0.4); font-size:13px; letter-spacing:0.12em; color:#FFD700">
            <i data-lucide="bell" style="width:14px;height:14px"></i>
            INVIA NOTIFICHE
          </button>
          <p id="admin-broadcast-feedback" class="font-ui text-center"
             style="font-size:11px; color:rgba(255,255,255,0.3); letter-spacing:0.08em; min-height:14px"></p>
        </div>
      </div>
    `;
  }

  private renderEmptyMatchState(): string {
    return `
      <div class="glass-card rounded-xl p-6 md:p-8 text-center" id="empty-match-state">
        <i data-lucide="dices" style="width:40px;height:40px;color:rgba(255,215,0,0.3);margin:0 auto 16px"></i>
        <p class="font-ui" style="font-size:13px; color:rgba(255,255,255,0.4); letter-spacing:0.08em">
          SELEZIONA ALMENO ${MIN_PLAYERS} GIOCATORI
        </p>
        <p class="font-body mt-1" style="font-size:11px; color:rgba(255,255,255,0.25)">
          e premi "Genera Match" per creare una partita bilanciata
        </p>
      </div>
    `;
  }

  private renderGenerateButton(): string {
    const enabled = this.getSelectedCount() >= MIN_PLAYERS;
    return `
      <!-- Class diff toggle -->
      <label id="class-diff-toggle-label" class="flex items-center gap-3 cursor-pointer select-none px-1">
        <div class="relative">
          <input type="checkbox" id="class-diff-toggle" class="sr-only" ${this.useRelaxedClassDiff ? 'checked' : ''}>
          <div id="class-diff-track" class="w-9 h-5 rounded-full transition-colors duration-200"
               style="background:${this.useRelaxedClassDiff ? 'rgba(255,165,0,0.5)' : 'rgba(255,255,255,0.1)'}; border:1px solid rgba(255,255,255,0.15)">
            <div id="class-diff-thumb" class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200"
                 style="background:#FFD700; transform:translateX(${this.useRelaxedClassDiff ? '16px' : '0px'})"></div>
          </div>
        </div>
        <span class="font-ui" style="font-size:11px; color:rgba(255,255,255,0.55); letter-spacing:0.08em">
          MAX DIFF. CLASSI: <span style="color:${this.useRelaxedClassDiff ? '#FFD700' : 'rgba(255,255,255,0.35)'}">${this.useRelaxedClassDiff ? '2' : '1'}</span>
        </span>
      </label>

      <button id="generate-match-btn"
              class="w-full py-3.5 md:py-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-300
                     ${enabled ? '' : 'opacity-40 cursor-not-allowed'}"
              style="background:${enabled
                ? 'linear-gradient(135deg, #FFD700, #F0A500)'
                : 'rgba(255,215,0,0.1)'};
                     border:1px solid rgba(255,215,0,0.4);
                     font-family:'Bebas Neue',sans-serif;
                     font-size:18px;
                     letter-spacing:0.15em;
                color:${enabled ? 'var(--color-bg-deep)' : 'rgba(255,215,0,0.5)'};
                     ${enabled ? 'box-shadow:0 0 30px rgba(255,215,0,0.25)' : ''}"
              ${enabled ? '' : 'disabled'}>
        <i data-lucide="swords" style="width:18px;height:18px"></i>
        GENERA MATCH
        <i data-lucide="chevron-right" style="width:16px;height:16px"></i>
      </button>
    `;
  }

  private renderGeneratedMatch(match: IMatchProposal): string {
    const avgEloA = (match.teamA.defence.elo[0] + match.teamA.attack.elo[1]) / 2;
    const avgEloB = (match.teamB.defence.elo[0] + match.teamB.attack.elo[1]) / 2;
    const winProbA = expectedScore(avgEloA, avgEloB);
    const winProbB = 1 - winProbA;

    return `
      <div class="space-y-4 match-panel-card">

        <!-- Match Card -->
        <div class="glass-card-gold rounded-xl overflow-hidden">
          <div class="px-4 md:px-5 py-3 flex items-center justify-between"
               style="background:rgba(10,25,18,0.8);
                      border-bottom:1px solid rgba(255,215,0,0.2)">
            <div class="flex items-center gap-2">
              <i data-lucide="swords" style="width:14px;height:14px;color:var(--color-gold)"></i>
              <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
                MATCH GENERATO
              </span>
            </div>
            <button id="delete-match-btn" class="font-ui px-2 py-1 rounded text-[10px] transition-colors hover:bg-red-500/20"
                    style="letter-spacing:0.08em; color:#F87171; border:1px solid rgba(248,113,113,0.3)">
              ELIMINA
            </button>
          </div>

          <div class="p-4 md:p-5 space-y-4">
            <!-- BIANCHI -->
            ${this.renderTeamCard('A', match.teamA.defence, match.teamA.attack, avgEloA, winProbA)}

            <!-- VS Divider -->
            <div class="flex items-center gap-3">
              <div class="flex-1 h-px" style="background:rgba(255,255,255,0.1)"></div>
              <div class="px-4 py-1.5 rounded-full font-display"
                   style="font-size:20px; color:var(--color-gold); letter-spacing:0.1em;
                          background:rgba(255,215,0,0.08); border:1px solid rgba(255,215,0,0.25)">
                VS
              </div>
              <div class="flex-1 h-px" style="background:rgba(255,255,255,0.1)"></div>
            </div>

            <!-- ROSSI -->
            ${this.renderTeamCard('B', match.teamB.defence, match.teamB.attack, avgEloB, winProbB)}

            <!-- Win probabilities -->
            ${this.renderWinProbBar(winProbA, winProbB)}
          </div>

          <!-- Heuristic Data -->
          ${match.heuristicData ? this.renderHeuristicData(match) : ''}

          <!-- Score Entry -->
          <div style="border-top:1px solid rgba(255,255,255,0.08)">
            <div class="px-4 md:px-5 py-3"
                 style="background:rgba(10,25,18,0.5)">
              <span class="font-ui" style="font-size:11px; color:rgba(255,255,255,0.5); letter-spacing:0.1em">
                INSERISCI PUNTEGGIO
              </span>
            </div>
            <div class="p-4 md:p-5">
              <div class="flex items-center justify-center gap-4">
                <div class="text-center">
                  <div class="font-ui mb-1" style="font-size:10px; color:rgba(240,240,240,0.7); letter-spacing:0.1em">
                    BIANCHI
                  </div>
                  <input id="score-team-a" type="text" inputmode="numeric" pattern="[0-8]"
                         class="w-16 h-16 rounded-xl text-center font-display bg-white/5 text-white outline-none
                                focus:ring-2 focus:ring-(--color-gold)/50 transition-all"
                         style="font-size:32px; border:1px solid rgba(255,255,255,0.15)"
                         placeholder="0" />
                </div>
                <span class="font-display text-white/30" style="font-size:28px; margin-top:16px">-</span>
                <div class="text-center">
                  <div class="font-ui mb-1" style="font-size:10px; color:#E53E3E; letter-spacing:0.1em">
                    ROSSI
                  </div>
                  <input id="score-team-b" type="text" inputmode="numeric" pattern="[0-8]"
                         class="w-16 h-16 rounded-xl text-center font-display bg-white/5 text-white outline-none
                                focus:ring-2 focus:ring-(--color-gold)/50 transition-all"
                         style="font-size:32px; border:1px solid rgba(255,255,255,0.15)"
                         placeholder="0" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <button id="save-match-btn"
                class="w-full py-3.5 md:py-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-300"
                style="background:linear-gradient(135deg, #FFD700, #F0A500);
                       border:1px solid rgba(255,215,0,0.4);
                       font-family:'Bebas Neue',sans-serif;
                       font-size:18px;
                       letter-spacing:0.15em;
                 color:var(--color-bg-deep);
                       box-shadow:0 0 30px rgba(255,215,0,0.25)">
          <i data-lucide="trophy" style="width:18px;height:18px"></i>
          SALVA PARTITA
        </button>

        ${this.renderGenerateButton()}
      </div>
    `;
  }

  private renderTeamCard(
    team: 'A' | 'B',
    defence: IPlayer,
    attack: IPlayer,
    avgElo: number,
    _winProb: number
  ): string {
    const teamColor = team === 'A' ? 'rgba(240,240,240,0.9)' : '#E53E3E';
    const teamBg = team === 'A' ? 'rgba(255,255,255,0.06)' : 'rgba(229,62,62,0.08)';
    const teamBorder = team === 'A' ? 'rgba(255,255,255,0.2)' : 'rgba(229,62,62,0.25)';

    const defClass = defence.class[0] === -1 ? getClass(defence.elo[0]) : defence.class[0];
    const attClass = attack.class[1] === -1 ? getClass(attack.elo[1]) : attack.class[1];
    const defColor = getClassColor(defClass);
    const attColor = getClassColor(attClass);
    const defInitials = getInitials(defence.name);
    const attInitials = getInitials(attack.name);

    const defRoleElo = Math.round(defence.elo[0]);
    const attRoleElo = Math.round(attack.elo[1]);

    return `
      <div class="rounded-xl p-3 md:p-4" style="background:${teamBg}; border:1px solid ${teamBorder}">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-2.5 h-2.5 rounded-full" style="background:${teamColor}"></div>
            <span class="font-ui" style="font-size:13px; color:${teamColor}; letter-spacing:0.1em; font-weight:600">
              TEAM ${team}
            </span>
          </div>
          <span class="font-display" style="font-size:18px; color:${teamColor}; letter-spacing:0.05em">
            ${avgElo.toFixed(0)}
          </span>
        </div>

        <!-- Defence -->
        <div class="flex items-center gap-3 mb-2">
          ${renderPlayerAvatar({ initials: defInitials, color: defColor, size: 'sm', playerId: defence.id, playerClass: defClass })}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-ui text-white truncate" style="font-size:13px">
                ${defence.name}
              </span>
              <span class="font-ui" style="font-size:10px; color:rgba(255,255,255,0.4)">
                #${defence.rank[2]}
              </span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="font-ui px-1.5 py-0.5 rounded"
                    style="font-size:9px; letter-spacing:0.06em; color:#3182CE;
                           background:rgba(49,130,206,0.15); border:1px solid rgba(49,130,206,0.3)">
                DIF
              </span>
              <span class="font-ui" style="font-size:11px; color:rgba(255,255,255,0.5)">
                ${defRoleElo} <span style="font-size:9px; opacity:0.6">(${getDisplayElo(defence)})</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Attack -->
        <div class="flex items-center gap-3">
          ${renderPlayerAvatar({ initials: attInitials, color: attColor, size: 'sm', playerId: attack.id, playerClass: attClass })}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-ui text-white truncate" style="font-size:13px">
                ${attack.name}
              </span>
              <span class="font-ui" style="font-size:10px; color:rgba(255,255,255,0.4)">
                #${attack.rank[2]}
              </span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="font-ui px-1.5 py-0.5 rounded"
                    style="font-size:9px; letter-spacing:0.06em; color:#E53E3E;
                           background:rgba(229,62,62,0.15); border:1px solid rgba(229,62,62,0.3)">
                ATT
              </span>
              <span class="font-ui" style="font-size:11px; color:rgba(255,255,255,0.5)">
                ${attRoleElo} <span style="font-size:9px; opacity:0.6">(${getDisplayElo(attack)})</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderWinProbBar(winProbA: number, winProbB: number): string {
    const pctA = Math.round(winProbA * 100);
    const pctB = Math.round(winProbB * 100);
    const colorA = 'rgba(220,220,220,0.85)';
    const colorB = '#E53E3E';
    return `
      <div>
        <div class="flex justify-between mb-1 px-0.5">
          <span class="font-ui" style="font-size:11px; color:${colorA}">${pctA}%</span>
          <span class="font-ui" style="font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:0.08em">PROB. VITTORIA</span>
          <span class="font-ui" style="font-size:11px; color:${colorB}">${pctB}%</span>
        </div>
        <div class="flex h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
          <div style="width:${pctA}%; background:${colorA}; border-radius:4px 0 0 4px; transition:width 0.4s"></div>
          <div style="width:${pctB}%; background:${colorB}; border-radius:0 4px 4px 0; transition:width 0.4s"></div>
        </div>
      </div>
    `;
  }

  private renderHeuristicData(match: IMatchProposal): string {
    const h = match.heuristicData!;

    const items = [
      { icon: 'bar-chart-3', label: 'Bilanciamento', score: h.matchBalance.score, max: h.matchBalance.max, color: '#4A90D9' },
      { icon: 'star', label: 'Priorita', score: h.priority.score, max: h.priority.max, color: '#FFD700' },
      { icon: 'dices', label: 'Diversita team', score: h.diversityTeam.score, max: h.diversityTeam.max, color: '#27AE60' },
      { icon: 'dices', label: 'Diversita avversari', score: h.diversityOpponent.score, max: h.diversityOpponent.max, color: '#2ECC71' },
      { icon: 'zap', label: 'Casualita', score: h.randomness.score, max: h.randomness.max, color: '#E8A020' },
      { icon: 'trending-down', label: 'Diff. gioc.', score: h.playersDifference.score, max: h.playersDifference.max, color: '#C0C0C0' }
    ];

    return `
      <div style="border-top:1px solid rgba(255,255,255,0.08)">
        <div class="px-4 md:px-5 py-3"
             style="background:rgba(10,25,18,0.5)">
          <span class="font-ui" style="font-size:11px; color:rgba(255,255,255,0.5); letter-spacing:0.1em">
            EURISTICA DI GENERAZIONE
          </span>
        </div>
        <div class="px-4 md:px-5 py-3 space-y-2">
          ${items.map((item) => {
            const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
            return `
              <div class="flex items-center gap-2">
                <i data-lucide="${item.icon}" style="width:12px;height:12px;color:${item.color};flex-shrink:0"></i>
                <span class="font-body shrink-0" style="font-size:10px; color:rgba(255,255,255,0.5); width:80px">
                  ${item.label}
                </span>
                <div class="flex-1 h-1 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.08)">
                  <div class="h-full rounded-full" style="width:${pct}%; background:${item.color}"></div>
                </div>
                <span class="font-ui shrink-0" style="font-size:10px; color:rgba(255,255,255,0.4); width:70px; text-align:right">
                  ${item.score.toFixed(2)} / ${item.max.toFixed(2)}
                </span>
              </div>
            `;
          }).join('')}

          <!-- Total -->
          <div class="flex items-center gap-2 pt-1" style="border-top:1px solid rgba(255,255,255,0.06)">
            <i data-lucide="trophy" style="width:12px;height:12px;color:#FFD700;flex-shrink:0"></i>
            <span class="font-ui shrink-0" style="font-size:10px; color:#FFD700; width:80px; letter-spacing:0.06em; font-weight:600">
              TOTALE
            </span>
            <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.08)">
              <div class="h-full rounded-full"
                   style="width:${h.total.max > 0 ? (h.total.score / h.total.max) * 100 : 0}%;
                          background:linear-gradient(90deg,#FFD700,#F0A500)"></div>
            </div>
            <span class="font-ui shrink-0" style="font-size:10px; color:#FFD700; width:70px; text-align:right">
              ${h.total.score.toFixed(2)} / ${h.total.max.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Toggle Button Styles ──────────────────────────────────────

  private getToggleBtnStyle(state: PlayerState): string {
    switch (state) {
      case 0:
        return 'background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.3)';
      case 1:
        return 'background:rgba(74,222,128,0.2); border:1px solid rgba(74,222,128,0.5); color:#4ADE80';
      case 2:
        return 'background:rgba(255,215,0,0.2); border:1px solid rgba(255,215,0,0.5); color:#FFD700';
    }
  }

  private getToggleBtnIcon(state: PlayerState): string {
    switch (state) {
      case 0:
        return '<span style="width:12px;height:12px;display:block;border-radius:50%;border:2px solid rgba(255,255,255,0.2)"></span>';
      case 1:
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      case 2:
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    }
  }

  // ── State Helpers ─────────────────────────────────────────────

  private getSelectedCount(): number {
    let count = 0;
    for (const state of this.playerStates.values()) {
      if (state > 0) count++;
    }
    return count;
  }

  private getSelectedPlayerIds(): number[] {
    const ids: number[] = [];
    for (const [id, state] of this.playerStates) {
      if (state > 0) ids.push(id);
    }
    return ids;
  }

  private getPriorityPlayerIds(): number[] {
    const ids: number[] = [];
    for (const [id, state] of this.playerStates) {
      if (state === 2) ids.push(id);
    }
    return ids;
  }

  private initPlayerStates(players: IPlayer[]): void {
    // Se non c'è una lobby attiva, preseleziona i giocatori disponibili oggi
    const today = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayKey = days[today.getDay()];
    const availableNames: string[] = availabilityList[todayKey] || [];

    for (const player of players) {
      // Se non c'è una lobby attiva e il nome è nella lista, stato 1 (selezionato), altrimenti 0
      if (!this.lobbyExists && availableNames.includes(player.name)) {
        this.playerStates.set(player.id, 1);
      } else {
        this.playerStates.set(player.id, 0);
      }
    }
  }

  // ── Event Binding ─────────────────────────────────────────────

  private bindToggleButtons(): void {
    const container = this.$id('player-rows-container');
    if (!container) return;

    container.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;

      // Check if clicked on button
      const btn = target.closest('.player-toggle-btn') as HTMLButtonElement | null;
      if (btn) {
        const playerId = Number(btn.dataset.playerId);
        if (!playerId) return;
        this.cyclePlayerState(playerId);
        return;
      }

      // Check if clicked on row (but not on button)
      const row = target.closest('.player-row') as HTMLElement | null;
      if (row && !target.closest('.player-toggle-btn')) {
        const playerId = Number(row.dataset.playerId);
        if (!playerId) return;
        this.cyclePlayerState(playerId);
        return;
      }
    });
  }

  private bindActionButtons(): void {
    // Note: match panel is rendered in both mobile (#match-panel-mobile) and
    // desktop (#match-panel-desktop) containers, so buttons share the same IDs.
    // We use querySelectorAll to bind handlers on ALL instances.

    for (const btn of this.$$('#generate-match-btn')) {
      btn.addEventListener('click', () => this.handleGenerateMatch());
    }

    for (const btn of this.$$('#delete-match-btn')) {
      btn.addEventListener('click', () => this.handleDeleteMatch());
    }

    for (const btn of this.$$('#save-match-btn')) {
      btn.addEventListener('click', () => this.handleSaveMatch());
    }

    // Select all / Deselect all (single instance in player list)
    const selectAllBtn = this.$id('select-all-btn');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => this.handleSelectAll());
    }

    const deselectAllBtn = this.$id('deselect-all-btn');
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => this.handleDeselectAll());
    }

    // Score input blur validation (both panels)
    for (const input of this.$$('#score-team-a, #score-team-b') as HTMLInputElement[]) {
      input.addEventListener('blur', () => {
        const val = Number.parseInt(input.value, 10);
        if (Number.isNaN(val) || val < 0) input.value = '0';
        if (val > 8) input.value = '8';
      });
    }

    // Class diff toggle (rendered in both panels)
    for (const checkbox of this.$$('#class-diff-toggle') as HTMLInputElement[]) {
      checkbox.addEventListener('change', () => {
        this.useRelaxedClassDiff = checkbox.checked;
        // Sync all toggle instances
        for (const cb of this.$$('#class-diff-toggle') as HTMLInputElement[]) {
          cb.checked = this.useRelaxedClassDiff;
        }
        for (const track of this.$$('#class-diff-track')) {
          track.style.background = this.useRelaxedClassDiff ? 'rgba(255,165,0,0.5)' : 'rgba(255,255,255,0.1)';
        }
        for (const thumb of this.$$('#class-diff-thumb')) {
          thumb.style.transform = `translateX(${this.useRelaxedClassDiff ? '16px' : '0px'})`;
        }
        const labels = this.$$('#class-diff-toggle-label span span');
        for (const span of labels) {
          span.textContent = this.useRelaxedClassDiff ? '2' : '1';
          (span as HTMLElement).style.color = this.useRelaxedClassDiff ? '#FFD700' : 'rgba(255,255,255,0.35)';
        }
      });
    }

    this.bindBroadcastButton();
  }

  private bindBroadcastButton(): void {
    for (const btn of this.$$('#admin-broadcast-btn') as HTMLButtonElement[]) {
      btn.addEventListener('click', e => this.handleBroadcast(e as PointerEvent));
    }
  }

  private async handleBroadcast(e: PointerEvent): Promise<void> {
    const feedback = this.$$('#admin-broadcast-feedback');
    const durationSelects = this.$$('#lobby-duration-select') as HTMLSelectElement[];
    const btns = this.$$('#admin-broadcast-btn') as HTMLButtonElement[];

    const token = localStorage.getItem('biliardino_admin_token');
    if (!token) {
      for (const f of feedback) {
        f.textContent = 'TOKEN ADMIN MANCANTE';
        (f as HTMLElement).style.color = '#F87171';
      }
      return;
    }

    createParticles(e.clientX, e.clientY, [
      { emoji: '🔔', canFlip: true },
      { emoji: '📣', canFlip: true },
      { emoji: '📢', canFlip: true }
    ], 1000);
    haptics.trigger('buzz');

    const durationSeconds = durationSelects[0] ? parseInt(durationSelects[0].value, 10) : LOBBY_TTL_DEFAULT;

    for (const btn of btns) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px;animation:_spin 0.6s linear infinite"></i> INVIO...`;
    }
    refreshIcons();

    try {
      const res = await fetch(`${API_BASE_URL}/send-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ durationSeconds })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Errore ${res.status}`);
      }

      const result = await res.json();

      for (const f of feedback) {
        f.textContent = `${result.sent}/${result.total} NOTIFICHE INVIATE`;
        (f as HTMLElement).style.color = '#4ADE80';
      }

      appState.lobbyActive = true;
      appState.emit('lobby-change');

      this.lobbyExists = true;
      this.patchLobbyPanels();

      await LobbyService.refreshNow();
    } catch (err: any) {
      console.error('[Matchmaking] Broadcast error:', err);
      for (const f of feedback) {
        f.textContent = err.message || 'ERRORE INVIO';
        (f as HTMLElement).style.color = '#F87171';
      }
      for (const btn of btns) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="bell" style="width:14px;height:14px"></i> INVIA NOTIFICHE`;
      }
      refreshIcons();
    }
  }

  private patchLobbyPanels(): void {
    const html = this.renderLobbyPanel();
    for (const el of this.$$('#lobby-panel')) {
      el.innerHTML = html;
    }
    refreshIcons();
    this.bindBroadcastButton();
  }

  private bindSearchFilter(): void {
    const searchInput = this.$id('matchmaking-search') as HTMLInputElement | null;
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.filterPlayerRows();
    });
  }

  // ── State Cycling ─────────────────────────────────────────────

  private cyclePlayerState(playerId: number): void {
    const current = this.playerStates.get(playerId) ?? 0;
    let next: PlayerState;

    if (current === 0) {
      next = 1;
    } else if (current === 1) {
      next = 2;
    } else {
      next = 0;
    }

    this.playerStates.set(playerId, next);
    this.updateToggleButton(playerId, next);
    this.updateProgressBar();
    this.updateGenerateButton();
  }

  private updateToggleButton(playerId: number, state: PlayerState): void {
    const btn = this.el?.querySelector(`.player-toggle-btn[data-player-id="${playerId}"]`) as HTMLButtonElement
      ?? document.querySelector(`.player-toggle-btn[data-player-id="${playerId}"]`) as HTMLButtonElement;
    if (!btn) return;

    btn.dataset.state = String(state);
    btn.style.cssText = this.getToggleBtnStyle(state);
    btn.innerHTML = this.getToggleBtnIcon(state);
    btn.title = state === 0 ? 'Non selezionato' : state === 1 ? 'Disponibile (click per priorita)' : 'Priorita (click per deselezionare)';

    // Update row background
    const row = btn.closest('.player-row') as HTMLElement | null;
    if (row) {
      if (state > 0) {
        row.classList.add('bg-white/[0.04]');
      } else {
        row.classList.remove('bg-white/[0.04]');
      }
    }
  }

  private updateProgressBar(): void {
    const count = this.getSelectedCount();
    const pct = Math.min(100, (count / MIN_PLAYERS) * 100);
    const complete = count >= MIN_PLAYERS;

    const fill = this.$id('progress-fill');
    const label = this.$id('selected-count-label');
    const status = this.$id('progress-status');

    if (fill) {
      fill.style.width = `${pct}%`;
      fill.style.background = complete
        ? 'linear-gradient(90deg,#4ADE80,#22C55E)'
        : 'linear-gradient(90deg,#FFD700,#F0A500)';
    }

    if (label) {
      label.textContent = `${count} / ${MIN_PLAYERS} SELEZIONATI`;
    }

    if (status) {
      status.textContent = complete ? 'PRONTO' : `MIN. ${MIN_PLAYERS}`;
      status.style.color = complete ? '#4ADE80' : 'rgba(255,255,255,0.3)';
    }
  }

  private updateGenerateButton(): void {
    const canGenerate = this.getSelectedCount() >= MIN_PLAYERS && !this.isGenerating && !this.isSaving && !this.generatedMatch;

    for (const btn of this.$$('#generate-match-btn') as HTMLButtonElement[]) {
      btn.disabled = !canGenerate;
      btn.classList.toggle('opacity-40', !canGenerate);
      btn.classList.toggle('cursor-not-allowed', !canGenerate);
      btn.style.background = canGenerate
        ? 'linear-gradient(135deg, #FFD700, #F0A500)'
        : 'rgba(255,215,0,0.1)';
      btn.style.color = canGenerate ? 'var(--color-bg-deep)' : 'rgba(255,215,0,0.5)';
      btn.style.boxShadow = canGenerate ? '0 0 30px rgba(255,215,0,0.25)' : 'none';
    }
  }

  private setGenerateButtonLoading(loading: boolean): void {
    const SPINNER = `<svg style="display:inline-block;width:14px;height:14px;animation:_spin 0.6s linear infinite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
    for (const btn of this.$$('#generate-match-btn') as HTMLButtonElement[]) {
      btn.disabled = loading;
      if (loading) {
        btn.style.opacity = '0.7';
        btn.innerHTML = `${SPINNER} GENERAZIONE...`;
      } else {
        btn.style.opacity = '';
        btn.innerHTML = `<i data-lucide="swords" style="width:18px;height:18px"></i> GENERA MATCH <i data-lucide="chevron-right" style="width:16px;height:16px"></i>`;
      }
    }
  }

  private setSaveButtonLoading(loading: boolean): void {
    for (const btn of this.$$('#save-match-btn') as HTMLButtonElement[]) {
      btn.disabled = loading;
      if (loading) {
        btn.style.opacity = '0.7';
        const SPINNER = `<svg style="display:inline-block;width:14px;height:14px;animation:_spin 0.6s linear infinite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
        btn.innerHTML = `${SPINNER} SALVATAGGIO...`;
      }
    }
  }

  // ── Actions ───────────────────────────────────────────────────

  private async handleGenerateMatch(): Promise<void> {
    if (this.isGenerating || this.generatedMatch) return;

    const selectedIds = this.getSelectedPlayerIds();
    const priorityIds = this.getPriorityPlayerIds();

    if (selectedIds.length < MIN_PLAYERS) {
      alert(`Seleziona almeno ${MIN_PLAYERS} giocatori per generare una partita.`);
      return;
    }

    this.isGenerating = true;
    this.setGenerateButtonLoading(true);

    try {
      const match = findBestMatch(selectedIds, priorityIds, this.useRelaxedClassDiff ? 2 : 1);

      if (!match) {
        alert('Impossibile generare partite con i giocatori selezionati.');
        return;
      }

      this.generatedMatch = match;

      // Persist to Firestore so it survives refresh
      await this.persistCurrentMatch();

      // Re-render the match panel
      this.refreshMatchPanels();

      // On mobile, scroll up so the new match card is visible
      this.scrollToMobileMatchPanel();
    } catch (error) {
      console.error('Error generating match:', error);
      alert('Errore durante la generazione della partita.');
    } finally {
      this.isGenerating = false;
      this.setGenerateButtonLoading(false);
      this.updateGenerateButton();
    }
  }

  private async handleDeleteMatch(): Promise<void> {
    this.generatedMatch = null;

    try {
      await clearRunningMatch();
      appState.lobbyActive = false;
      appState.emit('lobby-change');
    } catch (error) {
      console.error('Failed to clear running match:', error);
    }

    this.refreshMatchPanels();
    this.refreshPlayerListPanel();
    this.updateGenerateButton();
  }

  private async handleSaveMatch(): Promise<void> {
    if (this.isSaving || !this.generatedMatch) return;

    const scoreA = this.getScoreValue('score-team-a');
    const scoreB = this.getScoreValue('score-team-b');

    if (!this.validateScores(scoreA, scoreB)) return;

    this.isSaving = true;
    this.setSaveButtonLoading(true);
    this.updateGenerateButton();

    try {
      await this.executeMatchSave(scoreA!, scoreB!);
    } catch (error) {
      console.error('Error saving match:', error);
      alert('Errore durante il salvataggio della partita. Riprova.');
      // Restore buttons on error (match panel still visible)
      this.refreshMatchPanels();
    } finally {
      this.isSaving = false;
    }
  }

  private async executeMatchSave(scoreA: number, scoreB: number): Promise<void> {
    const match = this.generatedMatch!;

    const teamA = {
      defence: match.teamA.defence.id,
      attack: match.teamA.attack.id
    };

    const teamB = {
      defence: match.teamB.defence.id,
      attack: match.teamB.attack.id
    };

    const matchDTO = addMatch(teamA, teamB, [scoreA, scoreB]);

    const existing = await fetchMatchById(matchDTO.id);
    if (existing) {
      throw new Error(`La partita con ID ${matchDTO.id} esiste già in Firestore. Possibile doppio salvataggio.`);
    }

    await saveMatch(matchDTO);
    haptics.trigger('success');

    // Clear Redis confirmations
    try {
      await this.clearConfirmations();
    } catch (e) {
      console.error('Error clearing confirmations:', e);
    }

    // Clear running match
    try {
      await clearRunningMatch();
    } catch (e) {
      console.error('Error clearing running match:', e);
    }

    // Reset state
    this.generatedMatch = null;
    this.confirmedPlayerIds.clear();
    this.lobbyExists = false;
    this.lobbyConfirmedCount = 0;
    appState.lobbyActive = false;
    appState.emit('lobby-change');
    this.refreshMatchPanels();
    this.refreshPlayerListPanel();
  }

  private handleSelectAll(): void {
    for (const [id] of this.playerStates) {
      this.playerStates.set(id, 1);
      this.updateToggleButton(id, 1);
    }
    this.updateProgressBar();
    this.updateGenerateButton();
  }

  private handleDeselectAll(): void {
    for (const [id] of this.playerStates) {
      this.playerStates.set(id, 0);
      this.updateToggleButton(id, 0);
    }
    this.updateProgressBar();
    this.updateGenerateButton();
  }

  // ── Score Validation ──────────────────────────────────────────

  private getScoreValue(elementId: string): number | null {
    // Check all instances (mobile + desktop) and return the first non-empty value
    for (const input of this.$$(`#${elementId}`) as HTMLInputElement[]) {
      if (input.value !== '') {
        const val = Number.parseInt(input.value, 10);
        if (!Number.isNaN(val)) return val;
      }
    }
    return null;
  }

  private validateScores(scoreA: number | null, scoreB: number | null): boolean {
    if (scoreA === null || scoreB === null) {
      alert('Inserisci punteggi validi per entrambi i team.');
      return false;
    }

    if (scoreA < 0 || scoreB < 0 || scoreA > 8 || scoreB > 8) {
      alert('I punteggi devono essere compresi tra 0 e 8.');
      return false;
    }

    if (scoreA === scoreB) {
      alert('La partita non puo finire in parita. Inserisci punteggi diversi.');
      return false;
    }

    return true;
  }

  // ── Match Persistence ─────────────────────────────────────────

  private async persistCurrentMatch(): Promise<void> {
    if (!this.generatedMatch) return;

    const match = this.generatedMatch;
    const storedMatch: IRunningMatchDTO = {
      teamA: {
        defence: match.teamA.defence.id,
        attack: match.teamA.attack.id
      },
      teamB: {
        defence: match.teamB.defence.id,
        attack: match.teamB.attack.id
      }
    };

    try {
      await saveRunningMatch(storedMatch);
    } catch (error) {
      console.error('Failed to persist running match:', error);
    }
  }

  private async restoreSavedMatch(): Promise<void> {
    try {
      const storedMatch = await fetchRunningMatch();
      if (!storedMatch) return;

      const defA = getPlayerById(storedMatch.teamA.defence);
      const attA = getPlayerById(storedMatch.teamA.attack);
      const defB = getPlayerById(storedMatch.teamB.defence);
      const attB = getPlayerById(storedMatch.teamB.attack);

      if (!defA || !attA || !defB || !attB) {
        await clearRunningMatch();
        return;
      }

      this.generatedMatch = {
        teamA: { defence: defA, attack: attA },
        teamB: { defence: defB, attack: attB }
      };
    } catch (error) {
      console.error('Failed to restore running match:', error);
    }
  }

  // ── Confirmations via LobbyService ────────────────────────────

  private startConfirmationsPolling(): void {
    this.lobbyStateListener = (state: ILobbyState) => this.applyConfirmations(state);
    LobbyService.onStateChange(this.lobbyStateListener);
    LobbyService.acquire().then(() => {
      const state = LobbyService.getState();
      if (state) this.applyConfirmations(state);
    });

    // SSE: any lobby event triggers an immediate refresh (no debounce needed — we just call refresh)
    this.sseClient = new RealtimeClient({
      onStatusChange: status => console.log('[Matchmaking] SSE', status)
    });
    this.sseClient.onEvent(() => {
      LobbyService.refresh();
    });
    this.sseClient.connect();

    // Pause SSE when tab is hidden, reconnect + refresh on visible
    this.sseVisibilityHandler = () => {
      if (!this.sseClient) return;
      if (document.visibilityState === 'hidden') {
        this.sseClient.disconnect();
      } else {
        this.sseClient.connect();
        LobbyService.refresh();
      }
    };
    document.addEventListener('visibilitychange', this.sseVisibilityHandler);
  }

  private stopConfirmationsPolling(): void {
    if (this.lobbyStateListener) {
      LobbyService.offStateChange(this.lobbyStateListener);
      this.lobbyStateListener = null;
    }
    LobbyService.release();

    if (this.sseVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.sseVisibilityHandler);
      this.sseVisibilityHandler = null;
    }
    if (this.sseClient) {
      this.sseClient.disconnect();
      this.sseClient = null;
    }
  }

  private applyConfirmations(state: ILobbyState): void {
    const newConfirmedIds = new Set(state.confirmations.map(c => c.playerId));
    const addedIds = [...newConfirmedIds].filter(id => !this.confirmedPlayerIds.has(id));

    this.confirmedPlayerIds = newConfirmedIds;
    this.lobbyConfirmedCount = state.count;

    // Patch lobby panel if existence changed
    const prevLobbyExists = this.lobbyExists;
    this.lobbyExists = state.exists;
    if (prevLobbyExists !== this.lobbyExists) {
      this.patchLobbyPanels();
    } else if (this.lobbyExists) {
      // Just update the count label without full re-render
      for (const el of this.$$('#lobby-confirmed-count')) {
        el.textContent = `${state.count} CONFERMATI`;
      }
    }

    // Auto-select confirmed players
    for (const playerId of this.confirmedPlayerIds) {
      const current = this.playerStates.get(playerId);
      if (current === 0 || current === undefined) {
        this.playerStates.set(playerId, 1);
        this.updateToggleButton(playerId, 1);
      }

      // Add confirmed visual indicator to the row
      const row = document.querySelector(`.player-row[data-player-id="${playerId}"]`) as HTMLElement | null;
      if (row) {
        if (!row.classList.contains('confirmed-player')) {
          row.classList.add('confirmed-player');
        }
        // Inject wifi icon inline if not already present
        if (!row.querySelector('[data-lobby-wifi]')) {
          const toggleBtn = row.querySelector('.player-toggle-btn');
          if (toggleBtn) {
            const wifi = document.createElement('i');
            wifi.dataset.lucide = 'wifi';
            wifi.dataset.lobbyWifi = '1';
            wifi.title = 'Confermato dalla lobby';
            wifi.style.cssText = 'width:13px;height:13px;color:#4ADE80;flex-shrink:0';
            toggleBtn.before(wifi);
            refreshIcons();
          }
        }
      }
    }

    // Update confirmations panel
    this.updateConfirmationsPanel(state);

    if (addedIds.length > 0) {
      this.updateProgressBar();
      this.updateGenerateButton();
      console.log(`New confirmations: ${addedIds.join(', ')} (total: ${state.count})`);
    }
  }

  private updateConfirmationsPanel(data: ILobbyState): void {
    const panel = this.$id('confirmations-panel');
    if (!panel) return;

    // Always visible — remove hidden class added by template default
    panel.classList.remove('hidden');

    if (data.count === 0) {
      panel.innerHTML = `
        <div class="flex items-center gap-2">
          <i data-lucide="wifi-off" style="width:12px;height:12px;color:rgba(255,255,255,0.2)"></i>
          <span class="font-ui text-[11px] tracking-[0.08em]" style="color:rgba(255,255,255,0.3)">NESSUNA CONFERMA IN LOBBY</span>
        </div>
      `;
      refreshIcons();
      return;
    }

    const playerNames = data.confirmations
      .map(c => getPlayerById(c.playerId)?.name ?? `#${c.playerId}`)
      .join(', ');

    panel.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <i data-lucide="wifi" style="width:12px;height:12px;color:#4ADE80;flex-shrink:0"></i>
          <span class="font-ui text-[11px] text-[#4ADE80] tracking-[0.08em] shrink-0">CONFERME LIVE</span>
          <span class="font-body text-[11px] truncate" style="color:rgba(255,255,255,0.5)">${playerNames}</span>
        </div>
        <span class="font-ui px-2 py-0.5 rounded-full text-[11px] text-[#4ADE80] shrink-0"
              style="background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.3)">${data.count}</span>
      </div>
    `;
    refreshIcons();
  }

  private async clearConfirmations(): Promise<void> {
    if (!API_BASE_URL) return;

    const token = localStorage.getItem('biliardino_admin_token');

    const response = await fetch(`${API_BASE_URL}/admin-cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Failed to clear confirmations: ${response.status}`);
    }

    const result = await response.json();
    console.log(`Confirmations cleared: ${result.deleted}`);
  }

  // ── UI Refresh ────────────────────────────────────────────────

  private filterPlayerRows(): void {
    const container = this.$id('player-rows-container');
    if (!container) return;

    const rows = Array.from(container.querySelectorAll<HTMLElement>('.player-row'));
    for (const row of rows) {
      const nameEl = row.querySelector('.player-name') as HTMLElement | null;
      if (!nameEl) continue;

      const originalName = row.dataset.playerName ?? '';

      if (!this.searchQuery) {
        row.style.display = '';
        const storedName = nameEl.dataset.originalName;
        if (storedName) nameEl.innerHTML = storedName;
        continue;
      }

      if (!nameEl.dataset.originalName) {
        nameEl.dataset.originalName = nameEl.textContent?.trim() ?? '';
      }

      const indices = fuzzyMatch(this.searchQuery, originalName);
      if (!indices) {
        row.style.display = 'none';
        continue;
      }

      row.style.display = '';
      nameEl.innerHTML = highlightChars(nameEl.dataset.originalName!, indices);
    }
  }

  private refreshMatchPanels(): void {
    const html = this.renderMatchPanel();

    const mobilePanel = this.$id('match-panel-mobile');
    const desktopPanel = this.$id('match-panel-desktop');

    if (mobilePanel) mobilePanel.innerHTML = html;
    if (desktopPanel) desktopPanel.innerHTML = html;

    // Re-render lucide icons in the new HTML
    refreshIcons();

    // Re-bind action buttons for the new DOM
    this.bindActionButtons();

    // Ensure button/progress states are consistent after re-render
    this.updateGenerateButton();
    this.updateProgressBar();

    // Animate the new content
    gsap.from('.match-panel-card', {
      opacity: 0,
      y: 10,
      duration: 0.3,
      ease: 'power2.out'
    });
  }

  private refreshPlayerListPanel(): void {
    const players = getAllPlayers().toSorted((a, b) => a.name.localeCompare(b.name));
    const panel = this.$id('player-list-panel');
    if (!panel) return;
    panel.innerHTML = this.renderPlayerList(players);
    refreshIcons();
    this.bindToggleButtons();
    this.bindSearchFilter();
    this.updateConfirmationsPanel(LobbyService.getState() ?? {
      exists: false, ttl: 0, match: null, count: 0, confirmations: [], messages: [], messageCount: 0
    });
  }

  private resetAllPlayerStates(): void {
    for (const [id] of this.playerStates) {
      this.playerStates.set(id, 0);
    }
    this.updateProgressBar();
    this.updateGenerateButton();
  }

  private scrollToMobileMatchPanel(): void {
    if (window.innerWidth >= 1024) return;
    const panel = this.$id('match-panel-mobile');
    if (!panel) return;
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }
}

export default MatchmakingPage;
