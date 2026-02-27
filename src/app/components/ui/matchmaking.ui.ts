import { expectedScore, getMatchPlayerElo } from '@/services/elo.service';
import { getClass, getRank } from '@/services/player.service';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { getInitials, renderPlayerAvatar } from '../player-avatar.component';

import type { IPlayer } from '@/models/player.interface';
import type { IMatchProposal } from '@/services/matchmaking.service';

export type PlayerState = 0 | 1 | 2;

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

type PlayerListRenderParams = {
  players: IPlayer[];
  playerStates: Map<number, PlayerState>;
  confirmedPlayerIds: Set<number>;
  selectedCount: number;
  minPlayers: number;
  getToggleBtnStyle: (state: PlayerState) => string;
  getToggleBtnIcon: (state: PlayerState) => string;
};

export function renderMatchmakingPageHeader(totalPlayers: number, minPlayers: number): string {
  return `
    <div class="page-header flex items-center gap-3">
      <i data-lucide="swords" class="size-7 text-[var(--color-gold)]"></i>
      <div>
        <h1 class="text-white font-display text-[clamp(28px,6vw,42px)] tracking-[0.12em] leading-none">
          MATCHMAKING
        </h1>
        <p class="font-ui text-xs text-white/50 tracking-[0.1em]">
          ${totalPlayers} GIOCATORI &middot; SELEZIONA ALMENO ${minPlayers} PER GENERARE
        </p>
      </div>
    </div>
  `;
}

export function renderMatchmakingPlayerList({
  players,
  playerStates,
  confirmedPlayerIds,
  selectedCount,
  minPlayers,
  getToggleBtnStyle,
  getToggleBtnIcon
}: PlayerListRenderParams): string {
  const progressPct = Math.min(100, (selectedCount / minPlayers) * 100);
  const progressComplete = selectedCount >= minPlayers;

  const playerRows = players.map((player, idx) => {
    const state = playerStates.get(player.id) ?? 0;
    const classNum = player.class === -1 ? getClass(player.elo) : player.class;
    const classColor = getClassColor(classNum);
    const className = getClassName(classNum);
    const initials = getInitials(player.name);
    const displayElo = getDisplayElo(player);
    const winRate = player.matches > 0 ? Math.round((player.wins / player.matches) * 100) : 0;
    const isConfirmed = confirmedPlayerIds.has(player.id);

    return `
      <div class="player-row flex items-center justify-between px-4 md:px-5 py-3 md:py-3.5 transition-all duration-200 cursor-pointer hover:bg-white/[0.08]
                  ${state > 0 ? 'bg-white/[0.04]' : idx % 2 === 0 ? 'bg-white/[0.015]' : ''}
                  ${isConfirmed ? 'confirmed-player' : ''}
                  border-b border-white/5"
           data-player-id="${player.id}"
           data-player-name="${player.name.toLowerCase()}">

        <div class="flex items-center gap-3 min-w-0 flex-1">
          ${renderPlayerAvatar({ initials, color: classColor, size: 'sm', online: isConfirmed ? true : undefined })}
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="player-name text-white font-ui truncate text-sm font-semibold" data-original-name="${player.name}">
                ${player.name}
              </span>
              <span class="px-1.5 py-0.5 rounded font-ui hidden sm:inline text-[9px] tracking-[0.08em]"
                    style="color:${classColor}; background:${classColor}22; border:1px solid ${classColor}33">
                ${className.toUpperCase()}
              </span>
              ${isConfirmed ? '<span class="text-[10px]" title="Confermato tramite app">&#128241;</span>' : ''}
            </div>
            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
              <div class="flex items-center gap-1">
                <i data-lucide="star" class="size-2.5 text-[#FFD700]"></i>
                <span class="font-ui text-[11px] text-[#FFD700]">${displayElo}</span>
              </div>
              <span class="text-white/20">&middot;</span>
              <span class="font-ui text-[11px] text-white/45">${winRate}% WR</span>
              <span class="hidden sm:inline font-ui text-[11px] text-[#4ADE80]">${player.wins}W</span>
              <span class="hidden sm:inline font-ui text-[11px] text-[#F87171]">${player.matches - player.wins}L</span>
            </div>
          </div>
        </div>

        <button class="player-toggle-btn w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ml-2"
                data-player-id="${player.id}"
                data-state="${state}"
          style="${getToggleBtnStyle(state)}"
                title="${state === 0 ? 'Non selezionato' : state === 1 ? 'Disponibile (click per priorita)' : 'Priorita (click per deselezionare)'}">
          ${getToggleBtnIcon(state)}
        </button>
      </div>
    `;
  }).join('');

  return `
    <div class="glass-card rounded-xl overflow-hidden">
      <div class="flex items-center justify-between px-4 md:px-5 py-3 bg-[rgba(10,25,18,0.8)] border-b border-[rgba(255,215,0,0.2)]">
        <div class="flex items-center gap-2">
          <i data-lucide="users" class="size-3.5 text-[var(--color-gold)]"></i>
          <span class="font-ui text-[13px] tracking-[0.1em] text-[var(--color-gold)]">DISPONIBILITA GIOCATORI</span>
        </div>
        <div class="flex items-center gap-3">
          <button id="select-all-btn" class="font-ui px-2 py-1 rounded text-[10px] transition-colors hover:bg-white/10 tracking-[0.08em] text-white/50 border border-white/15">TUTTI</button>
          <button id="deselect-all-btn" class="font-ui px-2 py-1 rounded text-[10px] transition-colors hover:bg-white/10 tracking-[0.08em] text-white/50 border border-white/15">NESSUNO</button>
        </div>
      </div>

      <div class="px-4 md:px-5 py-2 bg-[rgba(10,25,18,0.5)] border-b border-white/5">
        <div class="relative">
          <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 size-[13px] text-white/30"></i>
          <input id="matchmaking-search" type="text" placeholder="Cerca giocatore…"
                 class="w-full pl-9 pr-3 py-2 rounded-lg text-white placeholder:text-white/25 outline-none transition-all duration-200 bg-white/5 border border-white/10 focus:border-[rgba(255,215,0,0.3)] font-body text-[13px]" />
        </div>
      </div>

      <div class="px-4 md:px-5 py-2 bg-[rgba(10,25,18,0.5)] border-b border-white/5">
        <div class="flex items-center justify-between mb-1.5">
          <span id="selected-count-label" class="font-ui text-[11px] text-white/50 tracking-[0.08em]">${selectedCount} / ${minPlayers} SELEZIONATI</span>
          <span id="progress-status" class="font-ui text-[10px] tracking-[0.08em] ${progressComplete ? 'text-[#4ADE80]' : 'text-white/30'}">${progressComplete ? 'PRONTO' : 'MIN. ' + minPlayers}</span>
        </div>
        <div class="w-full h-1.5 rounded-full overflow-hidden bg-white/10">
          <div id="progress-fill" class="h-full rounded-full transition-all duration-500"
               style="width:${progressPct}%; background:${progressComplete ? 'linear-gradient(90deg,#4ADE80,#22C55E)' : 'linear-gradient(90deg,#FFD700,#F0A500)'}"></div>
        </div>
      </div>

      <div id="confirmations-panel" class="px-4 md:px-5 py-2 hidden bg-[rgba(74,222,128,0.05)] border-b border-[rgba(74,222,128,0.15)]">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i data-lucide="wifi" class="size-3 text-[#4ADE80]"></i>
            <span class="font-ui text-[11px] text-[#4ADE80] tracking-[0.08em]">CONFERME LIVE</span>
          </div>
          <span id="conf-count-badge" class="font-ui px-2 py-0.5 rounded-full text-[11px] text-[#4ADE80] bg-[rgba(74,222,128,0.15)] border border-[rgba(74,222,128,0.3)]">0</span>
        </div>
      </div>

      <div id="player-rows-container">${playerRows}</div>
    </div>
  `;
}

export function renderMatchmakingDisclaimerCard(): string {
  return `
    <div class="rounded-xl p-3 md:p-4 flex items-start gap-3 bg-[linear-gradient(135deg,rgba(255,165,0,0.08),rgba(255,215,0,0.05))] border border-[rgba(255,165,0,0.25)]">
      <i data-lucide="shield" class="size-[18px] text-[#FFD700] shrink-0 mt-px"></i>
      <div>
        <div class="font-ui text-xs text-[#FFD700] tracking-[0.08em] mb-1">PROMEMORIA</div>
        <p class="font-body text-[11px] text-white/55 leading-[1.5]">Il biliardino non e scontato: solo in pausa e con rispetto, per evitare sanzioni.</p>
      </div>
    </div>
  `;
}

export function renderMatchmakingEmptyState(minPlayers: number): string {
  return `
    <div class="glass-card rounded-xl p-6 md:p-8 text-center" id="empty-match-state">
      <i data-lucide="dices" class="size-10 text-[rgba(255,215,0,0.3)] mx-auto mb-4"></i>
      <p class="font-ui text-[13px] text-white/40 tracking-[0.08em]">SELEZIONA ALMENO ${minPlayers} GIOCATORI</p>
      <p class="font-body mt-1 text-[11px] text-white/25">e premi "Genera Match" per creare una partita bilanciata</p>
    </div>
  `;
}

export function renderMatchmakingGenerateButton(enabled: boolean): string {
  return `
    <button class="generate-match-btn w-full py-3.5 md:py-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-300 ${enabled ? 'bg-[linear-gradient(135deg,#FFD700,#F0A500)] text-[#0F2A20] shadow-[0_0_30px_rgba(255,215,0,0.25)]' : 'bg-[rgba(255,215,0,0.1)] text-[rgba(255,215,0,0.5)] opacity-40 cursor-not-allowed'} border border-[rgba(255,215,0,0.4)] font-display text-lg tracking-[0.15em]"
            ${enabled ? '' : 'disabled'}>
      <i data-lucide="swords" class="size-[18px]"></i>
      GENERA MATCH
      <i data-lucide="chevron-right" class="size-4"></i>
    </button>
  `;
}

export function renderMatchmakingTeamCard(
  team: 'A' | 'B',
  defence: IPlayer,
  attack: IPlayer,
  avgElo: number
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
          <span class="font-ui text-[13px] tracking-[0.1em] font-semibold" style="color:${teamColor}">TEAM ${team}</span>
        </div>
        <span class="font-display text-lg tracking-[0.05em]" style="color:${teamColor}">${avgElo.toFixed(0)}</span>
      </div>

      <div class="flex items-center gap-3 mb-2">
        ${renderPlayerAvatar({ initials: defInitials, color: defColor, size: 'sm' })}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-ui text-white truncate text-[13px]">${defence.name}</span>
            <span class="font-ui text-[10px] text-white/40">#${getRank(defence.id)}</span>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="font-ui px-1.5 py-0.5 rounded text-[9px] tracking-[0.06em] text-[#3182CE] bg-[rgba(49,130,206,0.15)] border border-[rgba(49,130,206,0.3)]">DIF ${defPercent}%</span>
            <span class="font-ui text-[11px] text-white/50">${defRoleElo} <span class="text-[9px] opacity-60">(${getDisplayElo(defence)})</span></span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        ${renderPlayerAvatar({ initials: attInitials, color: attColor, size: 'sm' })}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-ui text-white truncate text-[13px]">${attack.name}</span>
            <span class="font-ui text-[10px] text-white/40">#${getRank(attack.id)}</span>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="font-ui px-1.5 py-0.5 rounded text-[9px] tracking-[0.06em] text-[#E53E3E] bg-[rgba(229,62,62,0.15)] border border-[rgba(229,62,62,0.3)]">ATT ${attPercent}%</span>
            <span class="font-ui text-[11px] text-white/50">${attRoleElo} <span class="text-[9px] opacity-60">(${getDisplayElo(attack)})</span></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderMatchmakingHeuristicData(match: IMatchProposal): string {
  const h = match.heuristicData!;

  const items = [
    { icon: 'bar-chart-3', label: 'Bilanciamento', score: h.matchBalance.score, max: h.matchBalance.max, color: '#4A90D9' },
    { icon: 'star', label: 'Priorita', score: h.priority.score, max: h.priority.max, color: '#FFD700' },
    { icon: 'dices', label: 'Diversita', score: h.diversity.score, max: h.diversity.max, color: '#27AE60' },
    { icon: 'zap', label: 'Casualita', score: h.randomness.score, max: h.randomness.max, color: '#E8A020' },
    { icon: 'shield', label: 'Class Balance', score: h.classBalance.score, max: h.classBalance.max, color: '#C0C0C0' }
  ];

  return `
    <div class="border-t border-white/10">
      <div class="px-4 md:px-5 py-3 bg-[rgba(10,25,18,0.5)]">
        <span class="font-ui text-[11px] text-white/50 tracking-[0.1em]">EURISTICA DI GENERAZIONE</span>
      </div>
      <div class="px-4 md:px-5 py-3 space-y-2">
        ${items.map((item) => {
      const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
      return `
            <div class="flex items-center gap-2">
              <i data-lucide="${item.icon}" class="size-3 shrink-0" style="color:${item.color}"></i>
              <span class="font-body shrink-0 text-[10px] text-white/50 w-20">${item.label}</span>
              <div class="flex-1 h-1 rounded-full overflow-hidden bg-white/10">
                <div class="h-full rounded-full" style="width:${pct}%; background:${item.color}"></div>
              </div>
              <span class="font-ui shrink-0 text-[10px] text-white/40 w-[70px] text-right">${item.score.toFixed(2)} / ${item.max.toFixed(2)}</span>
            </div>
          `;
    }).join('')}

        <div class="flex items-center gap-2 pt-1 border-t border-white/10">
          <i data-lucide="trophy" class="size-3 text-[#FFD700] shrink-0"></i>
          <span class="font-ui shrink-0 text-[10px] text-[#FFD700] w-20 tracking-[0.06em] font-semibold">TOTALE</span>
          <div class="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10">
            <div class="h-full rounded-full bg-[linear-gradient(90deg,#FFD700,#F0A500)]" style="width:${h.total.max > 0 ? (h.total.score / h.total.max) * 100 : 0}%"></div>
          </div>
          <span class="font-ui shrink-0 text-[10px] text-[#FFD700] w-[70px] text-right">${h.total.score.toFixed(2)} / ${h.total.max.toFixed(2)}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderGeneratedMatchCard(match: IMatchProposal): string {
  const avgEloA = (getMatchPlayerElo(match.teamA.defence, true) + getMatchPlayerElo(match.teamA.attack, false)) / 2;
  const avgEloB = (getMatchPlayerElo(match.teamB.defence, true) + getMatchPlayerElo(match.teamB.attack, false)) / 2;
  const winProbA = expectedScore(avgEloA, avgEloB);
  const winProbB = 1 - winProbA;

  return `
    <div class="glass-card-gold rounded-xl overflow-hidden">
      <div class="px-4 md:px-5 py-3 flex items-center justify-between bg-[rgba(10,25,18,0.8)] border-b border-[rgba(255,215,0,0.2)]">
        <div class="flex items-center gap-2">
          <i data-lucide="swords" class="size-3.5 text-[var(--color-gold)]"></i>
          <span class="font-ui text-[13px] text-[var(--color-gold)] tracking-[0.1em]">MATCH GENERATO</span>
        </div>
        <button id="delete-match-btn" class="font-ui px-2 py-1 rounded text-[10px] transition-colors hover:bg-red-500/20 tracking-[0.08em] text-[#F87171] border border-[rgba(248,113,113,0.3)">ELIMINA</button>
      </div>

      <div class="p-4 md:p-5 space-y-4">
        ${renderMatchmakingTeamCard('A', match.teamA.defence, match.teamA.attack, avgEloA)}
        <div class="flex items-center gap-3">
          <div class="flex-1 h-px bg-white/10"></div>
          <div class="px-4 py-1.5 rounded-full font-display text-xl text-[var(--color-gold)] tracking-[0.1em] bg-[rgba(255,215,0,0.08)] border border-[rgba(255,215,0,0.25)]">VS</div>
          <div class="flex-1 h-px bg-white/10"></div>
        </div>
        ${renderMatchmakingTeamCard('B', match.teamB.defence, match.teamB.attack, avgEloB)}

        <div class="flex justify-between px-2">
          <span class="font-ui text-[11px] ${winProbA > 0.5 ? 'text-[#4ADE80]' : 'text-white/40'}">${(winProbA * 100).toFixed(1)}% WIN</span>
          <span class="font-ui text-[11px] ${winProbB > 0.5 ? 'text-[#4ADE80]' : 'text-white/40'}">${(winProbB * 100).toFixed(1)}% WIN</span>
        </div>
      </div>

      ${match.heuristicData ? renderMatchmakingHeuristicData(match) : ''}

      <div class="border-t border-white/10">
        <div class="px-4 md:px-5 py-3 bg-[rgba(10,25,18,0.5)]">
          <span class="font-ui text-[11px] text-white/50 tracking-[0.1em]">INSERISCI PUNTEGGIO</span>
        </div>
        <div class="p-4 md:p-5">
          <div class="flex items-center justify-center gap-4">
            <div class="text-center">
              <div class="font-ui mb-1 text-[10px] text-[var(--color-team-red,#E53E3E)] tracking-[0.1em]">TEAM A</div>
              <input id="score-team-a" type="number" min="0" max="8"
                     class="w-16 h-16 rounded-xl text-center font-display bg-white/5 text-white outline-none focus:ring-2 focus:ring-[var(--color-gold)]/50 transition-all text-[32px] border border-white/15"
                     placeholder="0" />
            </div>
            <span class="font-display text-white/30 text-[28px] mt-4">-</span>
            <div class="text-center">
              <div class="font-ui mb-1 text-[10px] text-[var(--color-team-blue,#3182CE)] tracking-[0.1em]">TEAM B</div>
              <input id="score-team-b" type="number" min="0" max="8"
                     class="w-16 h-16 rounded-xl text-center font-display bg-white/5 text-white outline-none focus:ring-2 focus:ring-[var(--color-gold)]/50 transition-all text-[32px] border border-white/15"
                     placeholder="0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderMatchmakingPanel(match: IMatchProposal | null, minPlayers: number, selectedCount: number): string {
  const enabled = selectedCount >= minPlayers;
  if (match) {
    return `
      <div class="space-y-4 match-panel-card">
        ${renderMatchmakingDisclaimerCard()}
        ${renderGeneratedMatchCard(match)}
        <button id="save-match-btn"
                class="w-full py-3.5 md:py-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-300 bg-[linear-gradient(135deg,#FFD700,#F0A500)] border border-[rgba(255,215,0,0.4)] font-display text-lg tracking-[0.15em] text-[#0F2A20] shadow-[0_0_30px_rgba(255,215,0,0.25)]">
          <i data-lucide="trophy" class="size-[18px]"></i>
          SALVA PARTITA
        </button>
        <button id="save-and-lobby-btn"
                class="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 bg-[rgba(74,222,128,0.12)] border border-[rgba(74,222,128,0.35)] font-display text-base tracking-[0.12em] text-[#4ADE80]">
          <i data-lucide="chevron-right" class="size-4"></i>
          SAVE & GO TO LOBBY
        </button>
        ${renderMatchmakingGenerateButton(enabled)}
      </div>
    `;
  }

  return `
    <div class="space-y-4 match-panel-card">
      ${renderMatchmakingDisclaimerCard()}
      ${renderMatchmakingEmptyState(minPlayers)}
      ${renderMatchmakingGenerateButton(enabled)}
    </div>
  `;
}
