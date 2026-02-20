import { BASE_PATH } from '@/config/env.config';
import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { getBonusK } from '@/services/player.service';
import { getPlayerStats, PlayerStats } from '@/services/stats.service';
import { formatRank } from '@/utils/format-rank.util';
import { getClassName } from '@/utils/get-class-name.util';
import { getPlayerById, getRank } from '../services/player.service';

/**
 * Handles UI display for player details.
 */
export class PlayersView {
  /**
   * Initialize the view by reading player from query string and rendering stats.
   */
  public static init(): void {
    try {
      const urlParams = new URLSearchParams(globalThis.location.search);
      const playerId = Number.parseInt(urlParams.get('id')!);

      if (!playerId) {
        PlayersView.renderError('Nessun giocatore specificato. Aggiungi ?id=PLAYER_ID all\'URL.');
        return;
      }

      const player = getPlayerById(playerId);
      if (!player) {
        PlayersView.renderError('Giocatore non trovato.');
        return;
      }

      PlayersView.renderPlayerStats(player);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      PlayersView.renderError(`❌ Errore: ${errorMessage}`);
    }
  }

  /**
   * Render error message.
   */
  private static renderError(message: string): void {
    const container = document.getElementById('player-stats');
    if (container) {
      container.innerHTML = `<div class="empty-state">${message}</div>`;
    }
  }

  /**
   * Render player details into the container element.
   *
   * @param player - Player to display.
   */
  private static renderPlayerStats(player: IPlayer): void {
    const container = document.getElementById('player-stats');
    if (!container) {
      throw new Error('Player stats container not found');
    }

    const stats = getPlayerStats(player.id);

    if (!stats) {
      container.innerHTML = '<div class="empty-state">Nessuna statistica disponibile</div>';
      return;
    }

    // Update page title (empty)
    const titleElement = document.getElementById('player-name');
    if (titleElement) {
      titleElement.textContent = '';
    }

    const winPercentage = stats.matches > 0 ? ((stats.wins / stats.matches) * 100).toFixed(0) : '0';
    const winPercentageAttack = stats.matchesAsAttack > 0 ? ((stats.winsAsAttack / stats.matchesAsAttack) * 100).toFixed(0) : '0';
    const winPercentageDefence = stats.matchesAsDefence > 0 ? ((stats.winsAsDefence / stats.matchesAsDefence) * 100).toFixed(0) : '0';
    const attackRolePercentage = stats.matches > 0 ? ((stats.matchesAsAttack / stats.matches) * 100).toFixed(0) : '0';
    const defenceRolePercentage = stats.matches > 0 ? ((stats.matchesAsDefence / stats.matches) * 100).toFixed(0) : '0';

    // Calcola il ruolo come nella classifica (player.defence * 100)
    let rolePercentage = Math.round(player.defence * 100);
    const isDefender = rolePercentage >= 50;
    if (rolePercentage < 50) {
      rolePercentage = 100 - rolePercentage;
    }

    // Classe per il colore del win rate badge
    const winRateClass = parseInt(winPercentage) > 50 ? 'pp-winrate-good' : parseInt(winPercentage) < 50 ? 'pp-winrate-bad' : 'pp-winrate-equal';

    const formatElo = (value: number): number | string => {
      if (value === -Infinity || value === Infinity || Number.isNaN(value)) return 'TBD';
      if (!Number.isFinite(value)) return 'N/A';
      return Math.round(value);
    };

    const formatPlayerResult = (result: { player: { name: string }; score: number } | null): string => {
      if (!result) return 'TBD';
      if (!result.player) return 'TBD';
      return `${result.player.name} (${result.score > 0 ? '+' : ''}${result.score.toFixed(0)})`;
    };

    const formatMatch = (match: IMatch | null, playerId: number): { score: string; details: string } => {
      if (!match) return { score: 'TBD', details: '' };
      const isTeamA = match.teamA.attack === playerId || match.teamA.defence === playerId;
      const score = isTeamA ? `${match.score[0]}-${match.score[1]}` : `${match.score[1]}-${match.score[0]}`;

      const myTeam = isTeamA ? match.teamA : match.teamB;
      const opponentTeam = isTeamA ? match.teamB : match.teamA;

      const teammate = getPlayerById(myTeam.attack === playerId ? myTeam.defence : myTeam.attack);
      const opp1 = getPlayerById(opponentTeam.attack);
      const opp2 = getPlayerById(opponentTeam.defence);

      const teammateName = teammate?.name || '?';
      const opponentsNames = `${opp1?.name || '?'} & ${opp2?.name || '?'}`;
      const delta = isTeamA ? match.deltaELO[0] : match.deltaELO[1];

      return {
        score,
        details: `<small>vs ${opponentsNames}</small><br><small>con ${teammateName} (${delta > 0 ? '+' : ''}${delta.toFixed(0)} ELO)</small>`
      };
    };

    const formatMatchByScore = (match: IMatch | null, playerId: number): { score: string; details: string } => {
      if (!match) return { score: 'TBD', details: '' };
      const isTeamA = match.teamA.attack === playerId || match.teamA.defence === playerId;
      const scoreFor = isTeamA ? match.score[0] : match.score[1];
      const scoreAgainst = isTeamA ? match.score[1] : match.score[0];
      const diff = scoreFor - scoreAgainst;

      const myTeam = isTeamA ? match.teamA : match.teamB;
      const opponentTeam = isTeamA ? match.teamB : match.teamA;

      const teammate = getPlayerById(myTeam.attack === playerId ? myTeam.defence : myTeam.attack);
      const opp1 = getPlayerById(opponentTeam.attack);
      const opp2 = getPlayerById(opponentTeam.defence);

      const teammateName = teammate?.name || '?';
      const opponentsNames = `${opp1?.name || '?'} & ${opp2?.name || '?'}`;

      return {
        score: `${scoreFor}-${scoreAgainst}`,
        details: `<small>vs ${opponentsNames}</small><br><small>con ${teammateName} (${diff > 0 ? '+' : ''}${diff})</small>`
      };
    };

    const formatMatchHistory = (match: IMatch, playerElo: number, matchesPlayed: number): string => {
      const isTeamA = match.teamA.attack === player.id || match.teamA.defence === player.id;
      const myTeam = isTeamA ? match.teamA : match.teamB;
      const opponentTeam = isTeamA ? match.teamB : match.teamA;

      const teammate = getPlayerById(myTeam.attack === player.id ? myTeam.defence : myTeam.attack);
      const oppDefence = getPlayerById(opponentTeam.defence);
      const oppAttack = getPlayerById(opponentTeam.attack);

      // Helper per nome + elo preso dal match
      function playerWithElo(p: IPlayer | undefined, elo: number | undefined): string {
        if (!p || elo === undefined) return '?';
        return `${p.name} <strong>(${Math.round(elo)})</strong>`;
      }

      // ELO dei giocatori per questa partita
      // teamAELO: [difensore, attaccante], teamBELO: [difensore, attaccante]
      const teamAELO = match.teamAELO || [undefined, undefined];
      const teamBELO = match.teamBELO || [undefined, undefined];

      // Teammate ELO
      let teammateElo: number | undefined = undefined;
      if (isTeamA) {
        teammateElo = myTeam.defence === player.id ? teamAELO[1] : teamAELO[0];
      } else {
        teammateElo = myTeam.defence === player.id ? teamBELO[1] : teamBELO[0];
      }
      const teammateNames = playerWithElo(teammate, teammateElo);

      // Opponenti ELO
      const oppDefenceElo = isTeamA ? teamBELO[0] : teamAELO[0];
      const oppAttackElo = isTeamA ? teamBELO[1] : teamAELO[1];
      const opponentsNames = `${playerWithElo(oppDefence, oppDefenceElo)} & ${playerWithElo(oppAttack, oppAttackElo)}`;

      const myScore = isTeamA ? match.score[0] : match.score[1];
      const oppScore = isTeamA ? match.score[1] : match.score[0];
      const isWin = myScore > oppScore;

      const isAttack = myTeam.attack === player.id;
      const myRole = isAttack
        ? '<span style="font-size:0.9em;color:#dc3545;">⚔️ ATT</span>'
        : '<span style="font-size:0.9em;color:#0077cc;">🛡️ DIF</span>';

      // Elo delle squadre prima della partita
      const myTeamElo = isTeamA ? Math.round(match.teamELO[0]) : Math.round(match.teamELO[1]);
      const oppTeamElo = isTeamA ? Math.round(match.teamELO[1]) : Math.round(match.teamELO[0]);

      // Delta ELO
      const myDelta = isTeamA ? Math.round(match.deltaELO[0]) : Math.round(match.deltaELO[1]);
      const oppDelta = isTeamA ? Math.round(match.deltaELO[1]) : Math.round(match.deltaELO[0]);
      const deltaColor = myDelta >= 0 ? 'green' : 'red';
      const oppDeltaColor = oppDelta >= 0 ? 'green' : 'red';
      const oppDeltaFormatted = `<span style="color:${oppDeltaColor};">(${oppDelta >= 0 ? '+' : ''}${oppDelta})</span>`;

      // Percentuali di vittoria attesa
      const myExpected = isTeamA ? match.expectedScore[0] : match.expectedScore[1];
      const oppExpected = isTeamA ? match.expectedScore[1] : match.expectedScore[0];
      const myExpectedPercent = typeof myExpected === 'number' ? Math.round(myExpected * 100) : '?';
      const oppExpectedPercent = typeof oppExpected === 'number' ? Math.round(oppExpected * 100) : '?';

      // Colora le percentuali
      const myExpColor = myExpectedPercent === '?' ? 'inherit' : (myExpectedPercent > 50 ? 'green' : myExpectedPercent < 50 ? 'red' : 'inherit');
      const oppExpColor = oppExpectedPercent === '?' ? 'inherit' : (oppExpectedPercent > 50 ? 'green' : oppExpectedPercent < 50 ? 'red' : 'inherit');

      // Calcola ELO del giocatore preso da teamAELO o teamBELO
      const isDefence = myTeam.defence === player.id;
      let myPlayerElo: number | undefined = undefined;
      if (isTeamA) {
        myPlayerElo = isDefence ? teamAELO[0] : teamAELO[1];
      } else {
        myPlayerElo = isDefence ? teamBELO[0] : teamBELO[1];
      }
      const eloWithMalus = myPlayerElo !== undefined ? Math.round(myPlayerElo) : '?';

      // ELO reale: rimuovi il malus dal valore con malus
      // Il malus è: (isDef ? 1 - player.defence : player.defence) * 100
      const malus = (isDefence ? 1 - player.defence : player.defence) * 100;
      const realElo = myPlayerElo !== undefined ? Math.round(myPlayerElo + malus) : '?';
      const delta = isTeamA ? match.deltaELO[0] : match.deltaELO[1];

      const multiplier = getBonusK(matchesPlayed);

      // Formatta delta del giocatore con moltiplicatore
      const deltaRounded = Math.round(delta);
      const totalDelta = Math.round(delta * multiplier);
      const myDeltaFormatted = multiplier !== 1
        ? `<span style="color:${deltaColor};">${totalDelta >= 0 ? '+' : ''}${totalDelta} <span style="font-size:0.85em;">(x${multiplier.toFixed(2)})</span></span>`
        : `<span style="color:${deltaColor};">${delta >= 0 ? '+' : ''}${deltaRounded}</span>`;

      return `
        <tr class="${isWin ? 'match-win' : 'match-loss'}">
          <td><strong>${eloWithMalus}</strong> <span style="font-size:0.85em;opacity:0.7;">(${realElo})</span></td>
          <td><strong>${myTeamElo}</strong> ${myDeltaFormatted}</td>
          <td>${myRole}</td>
          <td>${teammateNames}</td>
          <td><span style="color:${myExpColor};font-size:0.85em;">(${myExpectedPercent}%)</span> <strong>${myScore}-${oppScore}</strong> <span style="color:${oppExpColor};font-size:0.85em;">(${oppExpectedPercent}%)</span></td>
          <td>${opponentsNames}</td>
          <td><strong>${oppTeamElo}</strong></td>
        </tr>
      `;
    };

    // === Avatar (stesso standard della classifica) ===
    const fallbackAvatar
      = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4=';

    const avatarSrc = `${BASE_PATH}avatars/${player.id}.webp`;

    const avatarHTML = `
      <div class="player-avatar">
        <img
          src="${avatarSrc}"
          alt="${player.name}"
          class="avatar-img"
          onerror="this.src='${fallbackAvatar}'"
        />
      </div>
    `;

    const profileCardHtml = `
  <div class="pp-row">
    <div class="player-card pp-card">
      <div class="pp-avatar">
        <img
          src="${BASE_PATH}avatars/${player.id}.webp"
          alt="${player.name}"
          class="pp-avatar-img"
          onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4='"
        />
      </div>

      <div class="pp-content">
        <div class="pp-header">
          <div class="pp-name-wrapper">
            ${player.class !== -1 ? `<img src="/class/${player.class}.webp" alt="Class ${player.class}" title="${getClassName(player.class)}" class="pp-class-icon" />` : ''}
            <h2 class="pp-name">${player.name}</h2>
          </div>
          <div class="pp-badges">
            ${player.class !== -1 ? `<span class="pp-rank-badge">${formatRank(getRank(player.id))}</span>` : ''}
            <span class="pp-winrate-badge ${winRateClass}">Win ${winPercentage}%</span>
          </div>
        </div>

        <div class="pp-stats">
          <div class="stat-item">
            <span class="stat-label">ELO Attuale</span>
            <span class="stat-value highlight">${formatElo(stats.elo)}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Miglior ELO</span>
            <span class="stat-value positive stat-value-with-icon">
              ${formatElo(stats.bestElo)}
              ${Number.isFinite(stats.bestClass) && stats.bestClass !== -1 ? `<img src="/class/${stats.bestClass}.webp" alt="Class ${stats.bestClass}" title="${getClassName(stats.bestClass)}" class="stat-class-icon" />` : ''}
            </span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Peggior ELO</span>
            <span class="stat-value negative">${formatElo(stats.worstElo)}</span>
          </div>

          <div class="stat-item stat-item-role">
            <span class="stat-label">Ruolo</span>
            <span class="stat-value">${rolePercentage === 50 ? `<span class="role-badge badge-neutral">⚖️ ${rolePercentage}%</span>` : isDefender ? `<span class="role-badge badge-def">🛡️ ${rolePercentage}%</span>` : `<span class="role-badge badge-att">⚔️ ${rolePercentage}%</span>`}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

    container.innerHTML = `
      ${profileCardHtml}

      <div class="player-card">
        <h2>🎮 Partite</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Partite Totali</span>
            <span class="stat-value">${stats.matches}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Come Attaccante</span>
            <span class="stat-value">${stats.matchesAsAttack} <span class="percentage">(${attackRolePercentage}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Come Difensore</span>
            <span class="stat-value">${stats.matchesAsDefence} <span class="percentage">(${defenceRolePercentage}%)</span></span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>🏆 Vittorie e Sconfitte</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Generale</span>
            <span class="stat-value">${stats.wins}V - ${stats.losses}S <span class="percentage">(${winPercentage}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">⚔️ Attacco</span>
            <span class="stat-value">${stats.winsAsAttack}V - ${stats.lossesAsAttack}S <span class="percentage">(${winPercentageAttack}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">🛡️ Difesa</span>
            <span class="stat-value">${stats.winsAsDefence}V - ${stats.lossesAsDefence}S <span class="percentage">(${winPercentageDefence}%)</span></span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>🔥 Streak</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Migliore Striscia Vittorie</span>
            <span class="stat-value positive">${stats.bestWinStreak}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggiore Striscia Sconfitte</span>
            <span class="stat-value negative">${stats.worstLossStreak}</span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>⚽ Goal</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Goal Totali Fatti</span>
            <span class="stat-value positive">${stats.totalGoalsFor}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Goal Totali Subiti</span>
            <span class="stat-value negative">${stats.totalGoalsAgainst}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Rapporto Goal Fatti/Subiti</span>
            <span class="stat-value">${stats.totalGoalsAgainst === 0 ? '∞' : (stats.totalGoalsFor / stats.totalGoalsAgainst).toFixed(2)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Media Goal Fatti</span>
            <span class="stat-value">${(() => { const val = stats.totalGoalsFor / stats.matches; return Number.isNaN(val) ? 'TBD' : val.toFixed(2); })()}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Media Goal Subiti</span>
            <span class="stat-value">${(() => { const val = stats.totalGoalsAgainst / stats.matches; return Number.isNaN(val) ? 'TBD' : val.toFixed(2); })()}</span>
          </div>
        </div>
      </div>

      <div class="player-card teammates-card">
        <h2>👥 Compagni e Avversari</h2>
        <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Compagno Frequente</span>
              <span class="stat-value player-name">${stats.bestTeammateCount && stats.bestTeammateCount.player ? `${stats.bestTeammateCount.player.name} (${stats.bestTeammateCount.score})` : 'TBD'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Miglior Compagno</span>
              <span class="stat-value player-name positive">${formatPlayerResult(stats.bestTeammate)}</span>
            </div>
          <div class="stat-item">
            <span class="stat-label">Peggior Compagno</span>
            <span class="stat-value player-name negative">${formatPlayerResult(stats.worstTeammate)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Avversario Più Forte</span>
            <span class="stat-value player-name negative">${formatPlayerResult(stats.bestOpponent)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Avversario Più Scarso</span>
            <span class="stat-value player-name positive">${formatPlayerResult(stats.worstOpponent)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">ELO Medio Squadra</span>
            <span class="stat-value">${formatElo(stats.avgTeamElo)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">ELO Medio Avversari</span>
            <span class="stat-value">${formatElo(stats.avgOpponentElo)}</span>
          </div>
        </div>
      </div>

      <div class="player-card best-worst-card">
        <h2>🏅 Migliori e Peggiori Partite</h2>
        <div class="best-worst-grid">
          <div class="best-worst-item">
            <span class="stat-label">Migliore Vittoria (ELO)</span>
            <span class="stat-score positive">${(() => {
        const result = formatMatch(stats.bestVictoryByElo, player.id);
        return result.score === 'TBD' ? result.score : `<strong>${result.score}</strong>`;
      })()}</span>
            <span class="stat-details">${formatMatch(stats.bestVictoryByElo, player.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Peggiore Sconfitta (ELO)</span>
            <span class="stat-score negative">${(() => {
        const result = formatMatch(stats.worstDefeatByElo, player.id);
        return result.score === 'TBD' ? result.score : `<strong>${result.score}</strong>`;
      })()}</span>
            <span class="stat-details">${formatMatch(stats.worstDefeatByElo, player.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Migliore Vittoria (Punteggio)</span>
            <span class="stat-score positive">${(() => {
        const result = formatMatchByScore(stats.bestVictoryByScore, player.id);
        return result.score === 'TBD' ? result.score : `<strong>${result.score}</strong>`;
      })()}</span>
            <span class="stat-details">${formatMatchByScore(stats.bestVictoryByScore, player.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Peggiore Sconfitta (Punteggio)</span>
            <span class="stat-score negative">${(() => {
        const result = formatMatchByScore(stats.worstDefeatByScore, player.id);
        return result.score === 'TBD' ? result.score : `<strong>${result.score}</strong>`;
      })()}</span>
            <span class="stat-details">${formatMatchByScore(stats.worstDefeatByScore, player.id).details}</span>
          </div>
        </div>
      </div>

      <div class="player-card chart-card">
        <h2>📈 Andamento ELO</h2>
        <div class="chart-wrapper" id="elo-chart"></div>
      </div>

      <div class="player-card history-card">
        <h2>📜 Storico Partite</h2>
        <div class="match-history">
          ${stats.history.length === 0
        ? '<p class="empty-state">Nessuna partita giocata</p>'
        : `
            <table class="match-history-table">
              <thead>
                <tr>
                  <th>Elo</th>
                  <th>Elo Team</th>
                  <th>Ruolo</th>
                  <th>Compagno</th>
                  <th>Risultato</th>
                  <th>Avversari</th>
                  <th>Elo Avversari</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
          const startElo = player.startElo;
          const playerElos: number[] = [startElo];
          let currentElo = startElo;
          for (const match of stats.history) {
            const isTeamA = match.teamA.attack === player.id || match.teamA.defence === player.id;
            const teamDelta = isTeamA ? match.deltaELO[0] : match.deltaELO[1];
            currentElo += teamDelta;
            playerElos.push(currentElo);
          }
          return stats.history.slice().reverse().map((match, idx) => {
            const matchIndex = stats.history.length - idx - 1;
            const eloBeforeMatch = playerElos[matchIndex];
            return formatMatchHistory(match, eloBeforeMatch, matchIndex);
          }).join('');
        })()}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;

    PlayersView.renderEloChart(stats, player);
  }

  /**
   * Render the Elo progression chart at the bottom of the page.
   */
  private static renderEloChart(stats: PlayerStats, player: IPlayer): void {
    const chartContainer = document.getElementById('elo-chart');
    if (!chartContainer) {
      return;
    }

    const progression = PlayersView.buildEloProgression(stats.history, player.startElo, player.id);

    if (progression.length === 0) {
      chartContainer.innerHTML = '<p class="empty-state">Nessuna partita per calcolare l\'andamento ELO.</p>';
      return;
    }

    const values = progression.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const yStep = PlayersView.getYStep(max - min);
    const tickMin = Math.floor(min / yStep) * yStep;
    const tickMax = Math.ceil(max / yStep) * yStep;
    const range = Math.max(tickMax - tickMin, 1);
    const width = Math.min(Math.max(progression.length * 55, 600), 1200);
    const height = 260;
    const padding = 40;

    const points = progression.map((point, index) => {
      const x = padding + (index / Math.max(progression.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.value - tickMin) / range) * (height - padding * 2);
      return { ...point, x, y };
    });

    // Calculate moving average (10 matches window)
    const movingAverageValues = PlayersView.calculateMovingAverage(values, 10);
    const movingAveragePoints = movingAverageValues.map((value, index) => {
      const x = padding + (index / Math.max(movingAverageValues.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((value - tickMin) / range) * (height - padding * 2);
      return { x, y };
    });

    // Calculate linear regression (trend line)
    const regressionPoints = PlayersView.calculateLinearRegression(values, padding, height, tickMin, range, width);

    const path = PlayersView.createSmoothPath(points);
    const areaPath = `${path} L ${points.at(-1)?.x ?? padding} ${height - padding} L ${points[0]?.x ?? padding} ${height - padding} Z`;

    const movingAveragePath = PlayersView.createSmoothPath(movingAveragePoints);
    const regressionPath = PlayersView.createLinePath(regressionPoints);

    const labelStep = Math.max(1, Math.ceil(progression.length / 8));
    const labels = points.map((p, idx) => {
      if (idx % labelStep !== 0 && idx !== points.length - 1) return '';
      return `<text x="${p.x}" y="${height - padding + 18}" class="chart-label" text-anchor="middle">${p.label}</text>`;
    }).join('');

    const circles = points.map((p, idx) => {
      const eloValue = Math.round(p.value);
      return `<circle cx="${p.x}" cy="${p.y}" r="3" class="chart-point" data-elo="${eloValue}">
        <title>ELO: ${eloValue}</title>
      </circle>`;
    }).join('');

    chartContainer.innerHTML = `
      <div class="chart-meta">
        <span>Min: ${Math.round(min)}</span>
        <span>Max: ${Math.round(max)}</span>
        <span>Ultimo: ${Math.round(values[values.length - 1])}</span>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-color" style="background-color: #4a5568;"></span>Andamento reale</span>
        <span class="legend-item"><span class="legend-color" style="background-color: #f59e0b;"></span>Media mobile (10)</span>
        <span class="legend-item"><span class="legend-color" style="background-color: #10b981;"></span>Trend generale</span>
      </div>
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Andamento ELO nel tempo">
        <defs>
          <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4a5568" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#2d3748" stop-opacity="0.05" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#4a5568" />
            <stop offset="100%" stop-color="#2d3748" />
          </linearGradient>
        </defs>
        ${PlayersView.renderYTicks(tickMin, tickMax, yStep, height, padding, width)}
        <path d="${areaPath}" class="chart-area" />
        <path d="${path}" class="chart-line" />
        <path d="${movingAveragePath}" class="chart-trend" style="stroke: #f59e0b; stroke-width: 2; fill: none;" />
        <path d="${regressionPath}" class="chart-regression" style="stroke: #10b981; stroke-width: 2.5; fill: none; stroke-dasharray: 5,5;" />
        ${circles}
        ${labels}
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis" />
        <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" class="chart-axis" />
      </svg>
    `;
  }

  private static renderYTicks(min: number, max: number, step: number, height: number, padding: number, width: number): string {
    const ticks: string[] = [];
    for (let value = max; value >= min; value -= step) {
      const ratio = (value - min) / Math.max(max - min, 1);
      const y = padding + (1 - ratio) * (height - padding * 2);
      ticks.push(`
        <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="chart-grid" />
        <text x="${padding - 10}" y="${y + 4}" text-anchor="end" class="chart-tick">${value}</text>
      `);
    }
    return ticks.join('');
  }

  private static getYStep(range: number): number {
    if (range <= 150) return 25;
    if (range <= 300) return 50;
    if (range <= 600) return 100;
    if (range <= 1000) return 150;
    return 200;
  }

  private static buildEloProgression(history: IMatch[], startElo: number, playerId: number): { value: number; label: string }[] {
    if (history.length === 0) return [];

    const progression: { value: number; label: string }[] = [{
      value: startElo,
      label: '0'
    }];

    let currentElo = startElo;
    for (let i = 0; i < history.length; i++) {
      const match = history[i];
      const isTeamA = playerId === match.teamA.attack || playerId === match.teamA.defence;
      const delta = isTeamA ? match.deltaELO[0] : match.deltaELO[1];
      const bonusMultiplier = getBonusK(i);
      currentElo += delta * bonusMultiplier;
      progression.push({
        value: currentElo,
        label: `${i + 1}`
      });
    }

    return progression;
  }

  /**
   * Calculate moving average with given window size.
   */
  private static calculateMovingAverage(values: number[], windowSize: number): number[] {
    if (values.length === 0) return [];

    const result: number[] = [];

    // Initial values before we have enough data
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = values.slice(start, i + 1);
      const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
      result.push(avg);
    }

    return result;
  }

  /**
   * Calculate linear regression (trend line).
   */
  private static calculateLinearRegression(values: number[], padding: number, height: number, tickMin: number, range: number, width: number): { x: number; y: number }[] {
    if (values.length < 2) return [];

    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return [
      {
        x: padding,
        y: height - padding - ((intercept - tickMin) / range) * (height - padding * 2)
      },
      {
        x: width - padding,
        y: height - padding - (((slope * (n - 1) + intercept) - tickMin) / range) * (height - padding * 2)
      }
    ];
  }

  /**
   * Create a path from two points (for regression line).
   */
  private static createLinePath(points: { x: number; y: number }[]): string {
    if (points.length < 2) return '';
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }

  /**
   * Create a smooth curve path using cubic Bézier curves.
   */
  private static createSmoothPath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    if (points.length === 2) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;

    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

    // Calculate control points for smooth curves
    const tension = 0.3; // Smoothness factor (0 = straight lines, 1 = very smooth)

    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const prev = i > 0 ? points[i - 1] : current;
      const afterNext = i < points.length - 2 ? points[i + 2] : next;

      // Calculate control points for the curve
      const cp1x = current.x + (next.x - prev.x) * tension;
      const cp1y = current.y + (next.y - prev.y) * tension;
      const cp2x = next.x - (afterNext.x - current.x) * tension;
      const cp2y = next.y - (afterNext.y - current.y) * tension;

      path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    }

    return path;
  }
}
