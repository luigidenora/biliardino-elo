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
import { expectedScore, getMatchPlayerElo } from '@/services/elo.service';
import { addMatch } from '@/services/match.service';
import { findBestMatch } from '@/services/matchmaking.service';
import { getAllPlayers, getClass, getPlayerById, getRank } from '@/services/player.service';
import { clearRunningMatch, fetchRunningMatch, saveMatch, saveRunningMatch } from '@/services/repository.service';
import AvailabilitySubscriber from '@/utils/availability-subscriber';
import { availabilityList } from '@/utils/availability.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { refreshIcons } from '../icons';
import { appState } from '../state';

import type { IConfirmationsResponse } from '@/models/confirmation.interface';
import type { IRunningMatchDTO } from '@/models/match.interface';
import type { IPlayer } from '@/models/player.interface';
import type { IMatchProposal } from '@/services/matchmaking.service';
import { fuzzyMatch, highlightChars } from '@/utils/fuzzy-search.util';
import { renderMatchmakingPageHeader, renderMatchmakingPlayerList } from '../components/ui/matchmaking.ui';

// ── Constants ────────────────────────────────────────────────────

type PlayerState = 0 | 1 | 2;

const MIN_PLAYERS = 4;
const CONFIRMATIONS_POLL_INTERVAL_MS = 20_000;

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

  private playerStates: Map<number, PlayerState> = new Map();
  private generatedMatch: IMatchProposal | null = null;
  private confirmedPlayerIds: Set<number> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private availabilitySubscriber: AvailabilitySubscriber | null = null;
  private isGenerating = false;
  private isSaving = false;
  private searchQuery = '';

  // ── Render ────────────────────────────────────────────────────

  override async render(): Promise<string> {
    const players = getAllPlayers().toSorted((a, b) => a.name.localeCompare(b.name));
    const totalPlayers = players.length;

    // Pre-populate states from daily availability
    this.initPlayerStates(players);

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
    refreshIcons();

    this.bindToggleButtons();
    this.bindActionButtons();
    this.bindSearchFilter();
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
    if (this.generatedMatch) {
      return this.renderGeneratedMatch(this.generatedMatch);
    }

    return `
      <div class="space-y-4 match-panel-card">
        ${this.renderDisclaimerCard()}
        ${this.renderEmptyMatchState()}
        ${this.renderGenerateButton()}
      </div>
    `;
  }

  private renderDisclaimerCard(): string {
    return `
      <div class="rounded-xl p-3 md:p-4 flex items-start gap-3"
           style="background:linear-gradient(135deg, rgba(255,165,0,0.08), rgba(255,215,0,0.05));
                  border:1px solid rgba(255,165,0,0.25)">
        <i data-lucide="shield" style="width:18px;height:18px;color:#FFD700;flex-shrink:0;margin-top:1px"></i>
        <div>
          <div class="font-ui" style="font-size:12px; color:#FFD700; letter-spacing:0.08em; margin-bottom:4px">
            PROMEMORIA
          </div>
          <p class="font-body" style="font-size:11px; color:rgba(255,255,255,0.55); line-height:1.5">
            Il biliardino non e scontato: solo in pausa e con rispetto, per evitare sanzioni.
          </p>
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
                     color:${enabled ? '#0F2A20' : 'rgba(255,215,0,0.5)'};
                     ${enabled ? 'box-shadow:0 0 30px rgba(255,215,0,0.25)' : ''}"
              ${enabled ? '' : 'disabled'}>
        <i data-lucide="swords" style="width:18px;height:18px"></i>
        GENERA MATCH
        <i data-lucide="chevron-right" style="width:16px;height:16px"></i>
      </button>
    `;
  }

  private renderGeneratedMatch(match: IMatchProposal): string {
    const avgEloA = (getMatchPlayerElo(match.teamA.defence, true) + getMatchPlayerElo(match.teamA.attack, false)) / 2;
    const avgEloB = (getMatchPlayerElo(match.teamB.defence, true) + getMatchPlayerElo(match.teamB.attack, false)) / 2;
    const winProbA = expectedScore(avgEloA, avgEloB);
    const winProbB = 1 - winProbA;

    return `
      <div class="space-y-4 match-panel-card">

        ${this.renderDisclaimerCard()}

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
            <!-- Team A -->
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

            <!-- Team B -->
            ${this.renderTeamCard('B', match.teamB.defence, match.teamB.attack, avgEloB, winProbB)}

            <!-- Win probabilities -->
            <div class="flex justify-between px-2">
              <span class="font-ui" style="font-size:11px; color:${winProbA > 0.5 ? '#4ADE80' : 'rgba(255,255,255,0.4)'}">
                ${(winProbA * 100).toFixed(1)}% WIN
              </span>
              <span class="font-ui" style="font-size:11px; color:${winProbB > 0.5 ? '#4ADE80' : 'rgba(255,255,255,0.4)'}">
                ${(winProbB * 100).toFixed(1)}% WIN
              </span>
            </div>
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
                  <div class="font-ui mb-1" style="font-size:10px; color:var(--color-team-red, #E53E3E); letter-spacing:0.1em">
                    TEAM A
                  </div>
                  <input id="score-team-a" type="number" min="0" max="8"
                         class="w-16 h-16 rounded-xl text-center font-display bg-white/5 text-white outline-none
                                focus:ring-2 focus:ring-[var(--color-gold)]/50 transition-all"
                         style="font-size:32px; border:1px solid rgba(255,255,255,0.15)"
                         placeholder="0" />
                </div>
                <span class="font-display text-white/30" style="font-size:28px; margin-top:16px">-</span>
                <div class="text-center">
                  <div class="font-ui mb-1" style="font-size:10px; color:var(--color-team-blue, #3182CE); letter-spacing:0.1em">
                    TEAM B
                  </div>
                  <input id="score-team-b" type="number" min="0" max="8"
                         class="w-16 h-16 rounded-xl text-center font-display bg-white/5 text-white outline-none
                                focus:ring-2 focus:ring-[var(--color-gold)]/50 transition-all"
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
                       color:#0F2A20;
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
    const teamColor = team === 'A' ? 'var(--color-team-red, #E53E3E)' : 'var(--color-team-blue, #3182CE)';
    const teamBg = team === 'A' ? 'rgba(229,62,62,0.08)' : 'rgba(49,130,206,0.08)';
    const teamBorder = team === 'A' ? 'rgba(229,62,62,0.25)' : 'rgba(49,130,206,0.25)';

    const defClass = defence.class === -1 ? getClass(defence.elo) : defence.class;
    const attClass = attack.class === -1 ? getClass(attack.elo) : attack.class;
    const defColor = getClassColor(defClass);
    const attColor = getClassColor(attClass);
    const defInitials = getInitials(defence.name);
    const attInitials = getInitials(attack.name);

    const defRoleElo = Math.round(getMatchPlayerElo(defence, true));
    const attRoleElo = Math.round(getMatchPlayerElo(attack, false));
    const defPercent = Math.round(defence.defence * 100);
    const attPercent = Math.round((1 - attack.defence) * 100);

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
          ${renderPlayerAvatar({ initials: defInitials, color: defColor, size: 'sm', playerId: defence.id })}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-ui text-white truncate" style="font-size:13px">
                ${defence.name}
              </span>
              <span class="font-ui" style="font-size:10px; color:rgba(255,255,255,0.4)">
                #${getRank(defence.id)}
              </span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="font-ui px-1.5 py-0.5 rounded"
                    style="font-size:9px; letter-spacing:0.06em; color:#3182CE;
                           background:rgba(49,130,206,0.15); border:1px solid rgba(49,130,206,0.3)">
                DIF ${defPercent}%
              </span>
              <span class="font-ui" style="font-size:11px; color:rgba(255,255,255,0.5)">
                ${defRoleElo} <span style="font-size:9px; opacity:0.6">(${getDisplayElo(defence)})</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Attack -->
        <div class="flex items-center gap-3">
          ${renderPlayerAvatar({ initials: attInitials, color: attColor, size: 'sm', playerId: attack.id })}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-ui text-white truncate" style="font-size:13px">
                ${attack.name}
              </span>
              <span class="font-ui" style="font-size:10px; color:rgba(255,255,255,0.4)">
                #${getRank(attack.id)}
              </span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="font-ui px-1.5 py-0.5 rounded"
                    style="font-size:9px; letter-spacing:0.06em; color:#E53E3E;
                           background:rgba(229,62,62,0.15); border:1px solid rgba(229,62,62,0.3)">
                ATT ${attPercent}%
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

  private renderHeuristicData(match: IMatchProposal): string {
    const h = match.heuristicData!;

    const items = [
      { icon: 'bar-chart-3', label: 'Bilanciamento', score: h.matchBalance.score, max: h.matchBalance.max, color: '#4A90D9' },
      { icon: 'star', label: 'Priorita', score: h.priority.score, max: h.priority.max, color: '#FFD700' },
      { icon: 'dices', label: 'Diversita', score: h.diversity.score, max: h.diversity.max, color: '#27AE60' },
      { icon: 'zap', label: 'Casualita', score: h.randomness.score, max: h.randomness.max, color: '#E8A020' },
      { icon: 'shield', label: 'Class Balance', score: h.classBalance.score, max: h.classBalance.max, color: '#C0C0C0' }
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
    // Check for daily availability
    const dayKeyMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const todayKey = dayKeyMap[new Date().getDay()];
    const todaysAvailable = (availabilityList as any)[todayKey] as string[] | undefined;

    for (const player of players) {
      let state: PlayerState = 0;

      if (this.confirmedPlayerIds.has(player.id)) {
        state = 1;
      } else if (Array.isArray(todaysAvailable) && todaysAvailable.includes(player.name)) {
        state = 1;
      }

      this.playerStates.set(player.id, state);
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
        if (val > 8) input.value = '8';
        if (val < 0) input.value = '0';
      });
    }
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
    const enabled = this.getSelectedCount() >= MIN_PLAYERS;

    // Update ALL instances (mobile + desktop panels have duplicate IDs)
    for (const btn of this.$$('#generate-match-btn') as HTMLButtonElement[]) {
      btn.disabled = !enabled;
      btn.classList.toggle('opacity-40', !enabled);
      btn.classList.toggle('cursor-not-allowed', !enabled);
      btn.style.background = enabled
        ? 'linear-gradient(135deg, #FFD700, #F0A500)'
        : 'rgba(255,215,0,0.1)';
      btn.style.color = enabled ? '#0F2A20' : 'rgba(255,215,0,0.5)';
      btn.style.boxShadow = enabled ? '0 0 30px rgba(255,215,0,0.25)' : 'none';
    }
  }

  // ── Actions ───────────────────────────────────────────────────

  private async handleGenerateMatch(): Promise<void> {
    if (this.isGenerating) return;

    const selectedIds = this.getSelectedPlayerIds();
    const priorityIds = this.getPriorityPlayerIds();

    if (selectedIds.length < MIN_PLAYERS) {
      alert(`Seleziona almeno ${MIN_PLAYERS} giocatori per generare una partita.`);
      return;
    }

    this.isGenerating = true;

    try {
      const match = findBestMatch(selectedIds, priorityIds);

      if (!match) {
        alert('Impossibile generare partite con i giocatori selezionati.');
        return;
      }

      this.generatedMatch = match;

      // Persist to Firestore so it survives refresh
      await this.persistCurrentMatch();

      // Re-render the match panel
      this.refreshMatchPanels();
    } catch (error) {
      console.error('Error generating match:', error);
      alert('Errore durante la generazione della partita.');
    } finally {
      this.isGenerating = false;
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
  }

  private async handleSaveMatch(): Promise<void> {
    if (this.isSaving || !this.generatedMatch) return;

    const scoreA = this.getScoreValue('score-team-a');
    const scoreB = this.getScoreValue('score-team-b');

    if (!this.validateScores(scoreA, scoreB)) return;

    this.isSaving = true;
    const saveBtn = this.$id('save-match-btn') as HTMLButtonElement | null;
    if (saveBtn) saveBtn.disabled = true;

    try {
      await this.executeMatchSave(scoreA!, scoreB!);
    } catch (error) {
      console.error('Error saving match:', error);
      alert('Errore durante il salvataggio della partita. Riprova.');
      if (saveBtn) saveBtn.disabled = false;
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
    await saveMatch(matchDTO);

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
    appState.lobbyActive = false;
    appState.emit('lobby-change');
    this.refreshMatchPanels();
    this.updateProgressBar();
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

  // ── Confirmations Polling / WebSocket ─────────────────────────

  private startConfirmationsPolling(): void {
    // Initial load
    this.loadConfirmations();

    // Try to connect AvailabilitySubscriber for real-time updates
    try {
      const env = (import.meta as any).env || {};
      if (env.VITE_UPSTASH_PUBSUB_TOKEN) {
        if (!this.availabilitySubscriber) {
          this.availabilitySubscriber = new AvailabilitySubscriber();
          this.availabilitySubscriber.connect();
          this.availabilitySubscriber.onMessage(() => {
            this.loadConfirmations();
          });
          console.log('AvailabilitySubscriber started for real-time updates');
        }
      } else {
        // No real-time: use single initial fetch only
        console.warn('AvailabilitySubscriber not configured: no real-time updates');
      }
    } catch (e) {
      console.warn('AvailabilitySubscriber init failed, falling back to polling', e);
      this.pollInterval = setInterval(() => {
        this.loadConfirmations();
      }, CONFIRMATIONS_POLL_INTERVAL_MS);
    }
  }

  private stopConfirmationsPolling(): void {
    if (this.availabilitySubscriber) {
      try {
        this.availabilitySubscriber.close();
      } catch (_) {
        // ignore
      }
      this.availabilitySubscriber = null;
    }

    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async loadConfirmations(): Promise<void> {
    if (!API_BASE_URL) return;

    try {
      const response = await fetch(`${API_BASE_URL}/lobby-state`);
      if (!response.ok) return;

      const data: IConfirmationsResponse = await response.json();

      const newConfirmedIds = new Set(data.confirmations.map(c => c.playerId));
      const addedIds = [...newConfirmedIds].filter(id => !this.confirmedPlayerIds.has(id));

      this.confirmedPlayerIds = newConfirmedIds;

      // Auto-select confirmed players
      for (const playerId of this.confirmedPlayerIds) {
        const current = this.playerStates.get(playerId);
        if (current === 0 || current === undefined) {
          this.playerStates.set(playerId, 1);
          this.updateToggleButton(playerId, 1);
        }

        // Add confirmed visual indicator to the row
        const row = document.querySelector(`.player-row[data-player-id="${playerId}"]`) as HTMLElement | null;
        if (row && !row.classList.contains('confirmed-player')) {
          row.classList.add('confirmed-player');
        }
      }

      // Update confirmations panel
      this.updateConfirmationsPanel(data);

      if (addedIds.length > 0) {
        this.updateProgressBar();
        this.updateGenerateButton();
        console.log(`New confirmations: ${addedIds.join(', ')} (total: ${data.count})`);
      }
    } catch (error) {
      // Silently fail -- backend may not be running
      console.debug('Confirmations polling error:', error);
    }
  }

  private updateConfirmationsPanel(data: IConfirmationsResponse): void {
    const panel = this.$id('confirmations-panel');
    if (!panel) return;

    if (data.count > 0) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
      return;
    }

    const badge = this.$id('conf-count-badge');
    if (badge) {
      badge.textContent = String(data.count);
    }
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

    // Animate the new content
    gsap.from('.match-panel-card', {
      opacity: 0,
      y: 10,
      duration: 0.3,
      ease: 'power2.out'
    });
  }
}

export default MatchmakingPage;
