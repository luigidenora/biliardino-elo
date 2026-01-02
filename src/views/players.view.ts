import { IMatch } from '@/models/match.interface';
import { IPlayer } from '@/models/player.interface';
import { getPlayerStats, MatchResult, PlayerStats } from '@/services/stats.service';
import { getAllPlayers, getPlayerById } from '../services/player.service';

/**
 * Handles UI display for player details.
 */
export class PlayersView {
  /**
   * Initialize the view by reading player from query string and rendering stats.
   */
  public static init(): void {
    const urlParams = new URLSearchParams(window.location.search);
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

    // Update page title with player name and rank (after stats are calculated)
    const titleElement = document.getElementById('player-name');
    if (titleElement) {
      // Calculate rank considering only players with at least 1 match
      const allPlayers = getAllPlayers().filter(p => p.matches > 0);
      const sortedPlayers = allPlayers.sort((a, b) => b.elo - a.elo);
      const rank = sortedPlayers.findIndex(p => p.id === player.id) + 1;
      const rankText = rank > 0 ? ` (${rank}°)` : '';
      titleElement.textContent = `Statistiche di ${player.name}${rankText}`;
    }

    const winPercentage = stats.matches > 0 ? ((stats.wins / stats.matches) * 100).toFixed(0) : '0';
    const winPercentageAttack = stats.matchesAsAttack > 0 ? ((stats.winsAsAttack / stats.matchesAsAttack) * 100).toFixed(0) : '0';
    const winPercentageDefence = stats.matchesAsDefence > 0 ? ((stats.winsAsDefence / stats.matchesAsDefence) * 100).toFixed(0) : '0';

    const formatElo = (value: number): number | string => {
      if (!isFinite(value)) return 'N/A';
      return Math.round(value);
    };

    const formatPlayerResult = (result: { player: { name: string }; score: number } | null): string => {
      if (!result) return 'N/A';
      return `${result.player.name} (${result.score > 0 ? '+' : ''}${result.score.toFixed(0)})`;
    };

    const formatMatchResult = (result: { match: IMatch; delta: number } | null, playerId: number): { score: string; details: string } => {
      if (!result) return { score: 'N/A', details: '' };
      const m = result.match;
      const isTeamA = m.teamA.attack === playerId || m.teamA.defence === playerId;
      const score = isTeamA ? `${m.score[0]}-${m.score[1]}` : `${m.score[1]}-${m.score[0]}`;

      const myTeam = isTeamA ? m.teamA : m.teamB;
      const opponentTeam = isTeamA ? m.teamB : m.teamA;

      const teammate = getPlayerById(myTeam.attack === playerId ? myTeam.defence : myTeam.attack);
      const opp1 = getPlayerById(opponentTeam.attack);
      const opp2 = getPlayerById(opponentTeam.defence);

      const teammateName = teammate?.name || '?';
      const opponentsNames = `${opp1?.name || '?'} & ${opp2?.name || '?'}`;

      return {
        score,
        details: `<small>vs ${opponentsNames}</small><br><small>con ${teammateName} (${result.delta > 0 ? '+' : ''}${result.delta.toFixed(0)} ELO)</small>`
      };
    };

    const formatMatchByScore = (match: IMatch | null, playerId: number): { score: string; details: string } => {
      if (!match) return { score: 'N/A', details: '' };
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

    const formatMatchHistory = (matchResult: { match: IMatch; delta: number }, playerElo: number): string => {
      const match = matchResult.match;
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
      const myExpColor = myExpectedPercent !== '?' ? (myExpectedPercent > 50 ? 'green' : myExpectedPercent < 50 ? 'red' : 'inherit') : 'inherit';
      const oppExpColor = oppExpectedPercent !== '?' ? (oppExpectedPercent > 50 ? 'green' : oppExpectedPercent < 50 ? 'red' : 'inherit') : 'inherit';

      return `
        <tr class="${isWin ? 'match-win' : 'match-loss'}">
          <td><strong>${Math.round(playerElo)}</strong> <span style="color:${deltaColor};">(${matchResult.delta >= 0 ? '+' : ''}${Math.round(matchResult.delta)})</span></td>
          <td><strong>${myTeamElo}</strong></td>
          <td>${myRole}</td>
          <td>${teammateNames}</td>
          <td><span style="color:${myExpColor};font-size:0.85em;">(${myExpectedPercent}%)</span> <strong>${myScore}-${oppScore}</strong> <span style="color:${oppExpColor};font-size:0.85em;">(${oppExpectedPercent}%)</span></td>
          <td>${opponentsNames}</td>
          <td><strong>${oppTeamElo}</strong> ${oppDeltaFormatted}</td>
        </tr>
      `;
    };

    container.innerHTML = `
      <div class="player-card">
        <h2>📊 Generale</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">ELO Attuale</span>
            <span class="stat-value highlight">${formatElo(stats.elo)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Miglior ELO</span>
            <span class="stat-value positive">${formatElo(stats.bestElo)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggior ELO</span>
            <span class="stat-value negative">${formatElo(stats.worstElo)}</span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>🎮 Partite</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Partite Totali</span>
            <span class="stat-value">${stats.matches}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Come Attaccante</span>
            <span class="stat-value">${stats.matchesAsAttack}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Come Difensore</span>
            <span class="stat-value">${stats.matchesAsDefence}</span>
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
            <span class="stat-value">${(stats.totalGoalsFor / stats.matches).toFixed(2)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Media Goal Subiti</span>
            <span class="stat-value">${(stats.totalGoalsAgainst / stats.matches).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>👥 Compagni e Avversari</h2>
        <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Compagno Frequente</span>
              <span class="stat-value player-name">${stats.bestTeammateCount ? `${stats.bestTeammateCount.player.name} (${stats.bestTeammateCount.score})` : 'N/A'}</span>
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
        </div>
      </div>

      <div class="player-card best-worst-card">
        <h2>🏅 Migliori e Peggiori Partite</h2>
        <div class="best-worst-grid">
          <div class="best-worst-item">
            <span class="stat-label">Migliore Vittoria (ELO)</span>
            <span class="stat-score positive">${(() => {
              const result = formatMatchResult(stats.bestVictoryByElo, player.id);
              return result.score === 'N/A' ? result.score : `<strong>${result.score}</strong>`;
            })()}</span>
            <span class="stat-details">${formatMatchResult(stats.bestVictoryByElo, player.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Peggiore Sconfitta (ELO)</span>
            <span class="stat-score negative">${(() => {
              const result = formatMatchResult(stats.worstDefeatByElo, player.id);
              return result.score === 'N/A' ? result.score : `<strong>${result.score}</strong>`;
            })()}</span>
            <span class="stat-details">${formatMatchResult(stats.worstDefeatByElo, player.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Migliore Vittoria (Punteggio)</span>
            <span class="stat-score positive">${(() => {
              const result = formatMatchByScore(stats.bestVictoryByScore, player.id);
              return result.score === 'N/A' ? result.score : `<strong>${result.score}</strong>`;
            })()}</span>
            <span class="stat-details">${formatMatchByScore(stats.bestVictoryByScore, player.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Peggiore Sconfitta (Punteggio)</span>
            <span class="stat-score negative">${(() => {
              const result = formatMatchByScore(stats.worstDefeatByScore, player.id);
              return result.score === 'N/A' ? result.score : `<strong>${result.score}</strong>`;
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
                  const playerElos: number[] = [1000];
                  let currentElo = 1000;
                  for (let i = 0; i < stats.history.length; i++) {
                    currentElo += stats.history[i].delta;
                    playerElos.push(currentElo);
                  }
                  return stats.history.slice().reverse().map((matchResult, idx) => {
                    const eloBeforeMatch = playerElos[stats.history.length - idx - 1];
                    return formatMatchHistory(matchResult, eloBeforeMatch);
                  }).join('');
                })()}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;

    PlayersView.renderEloChart(stats);
  }

  /**
   * Render the Elo progression chart at the bottom of the page.
   */
  private static renderEloChart(stats: PlayerStats): void {
    const chartContainer = document.getElementById('elo-chart');
    if (!chartContainer) {
      return;
    }

    const progression = PlayersView.buildEloProgression(stats.history);

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

    const path = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const areaPath = `${path} L ${points.at(-1)?.x ?? padding} ${height - padding} L ${points[0]?.x ?? padding} ${height - padding} Z`;

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
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Andamento ELO nel tempo" style="min-width:${width}px">
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

  private static buildEloProgression(history: MatchResult[]): { value: number; label: string }[] {
    if (history.length === 0) return [];

    const progression: { value: number; label: string }[] = [{
      value: 1000,
      label: '0'
    }];

    let currentElo = 1000;
    for (let i = 0; i < history.length; i++) {
      const match = history[i];
      currentElo += match.delta;
      progression.push({
        value: Math.round(currentElo),
        label: `${i + 1}`
      });
    }

    return progression;
  }
}
