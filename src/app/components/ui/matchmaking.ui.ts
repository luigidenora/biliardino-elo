import { html, rawHtml } from '../../utils/html-template.util';
import { getInitials, renderPlayerAvatar } from '../player-avatar.component';
import { renderRoleBadge } from '../role-badge.component';
import playerListTemplate from './matchmaking-player-list.component.html?raw';

import type { IPlayer } from '@/models/player.interface';

export type PlayerState = 0 | 1 | 2;

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
    const initials = getInitials(player.name);
    const isConfirmed = confirmedPlayerIds.has(player.id);
    const defElo = Math.round(player.elo[0]);
    const attElo = Math.round(player.elo[1]);
    const roleBadge = renderRoleBadge({ playerRole: player.role, defenceMatches: player.matches[0], attackMatches: player.matches[1], size: 'base' });

    return `
      <div class="player-row flex items-center justify-between px-4 md:px-5 py-3 md:py-3.5 transition-all duration-200 cursor-pointer hover:bg-white/[0.08]
                  ${state > 0 ? 'bg-white/[0.04]' : idx % 2 === 0 ? 'bg-white/[0.015]' : ''}
                  ${isConfirmed ? 'confirmed-player border-l-2 border-[#4ADE80]' : 'border-l-2 border-transparent'}
                  border-b border-white/5"
           data-player-id="${player.id}"
           data-player-name="${player.name.toLowerCase()}">

        <div class="flex items-center gap-3 min-w-0 flex-1">
          ${renderPlayerAvatar({ initials, color: 'rgba(255,255,255,0.25)', size: 'sm', online: isConfirmed ? true : undefined, playerId: player.id })}
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="player-name font-ui truncate text-sm font-semibold ${isConfirmed ? 'text-white' : 'text-white'}" data-original-name="${player.name}">
                ${player.name}
              </span>
              ${roleBadge}
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="font-ui text-[11px] text-white/50">DIF <span class="text-[#4A90D9]">${defElo}</span></span>
              <span class="text-white/20">&middot;</span>
              <span class="font-ui text-[11px] text-white/50">ATT <span class="text-[#E53E3E]">${attElo}</span></span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 ml-2">
          ${isConfirmed
            ? `<i data-lucide="wifi" title="Confermato dalla lobby" style="width:13px;height:13px;color:#4ADE80;flex-shrink:0"></i>`
            : ''}
          <button class="player-toggle-btn w-9 h-9 rounded-full flex items-center justify-center transition-all"
                  data-player-id="${player.id}"
                  data-state="${state}"
                  style="${getToggleBtnStyle(state)}"
                  title="${state === 0 ? 'Non selezionato' : state === 1 ? 'Disponibile (click per priorita)' : 'Priorita (click per deselezionare)'}">
            ${getToggleBtnIcon(state)}
          </button>
        </div>
      </div>
    `;
  }).join('');

  return html(playerListTemplate, {
    selectedCount,
    minPlayers,
    progressStatusClass: progressComplete ? 'text-[#4ADE80]' : 'text-white/30',
    progressStatus: progressComplete ? 'PRONTO' : 'MIN. ' + minPlayers,
    progressPct,
    progressFillStyle: progressComplete
      ? 'linear-gradient(90deg,#4ADE80,#22C55E)'
      : 'linear-gradient(90deg,#FFD700,#F0A500)',
    playerRows: rawHtml(playerRows)
  });
}
