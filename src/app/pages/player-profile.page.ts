/**
 * PlayerProfilePage -- Full-screen profile for a single player.
 *
 * Route: /profile/:id
 * Displays hero card, ELO chart (Chart.js), recent matches,
 * stat grid, and an animated win/loss distribution bar.
 */

import { getAllMatches } from '@/services/match.service';
import { getPlayerById, getRank } from '@/services/player.service';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { Chart, registerables } from 'chart.js';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { refreshIcons } from '../icons';

// ── Player color palette ──────────────────────────────────────

const PLAYER_COLORS = [
  '#E8A020', '#4A90D9', '#50C878', '#E74C3C', '#9B59B6',
  '#1ABC9C', '#E67E22', '#3498DB', '#2ECC71', '#E91E63'
];

function getPlayerColor(id: number): string {
  return PLAYER_COLORS[id % 10];
}

// ── Helpers ───────────────────────────────────────────────────

function getRankMedal(rank: number): string {
  if (rank === 1) return '&#x1F947;';
  if (rank === 2) return '&#x1F948;';
  if (rank === 3) return '&#x1F949;';
  return '';
}

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function formatFullDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function computeCurrentStreak(deltas: number[]): { type: 'W' | 'L' | 'none'; count: number } {
  if (deltas.length === 0) return { type: 'none', count: 0 };

  const last = deltas[deltas.length - 1];
  const isWin = last > 0;
  let count = 0;

  for (let i = deltas.length - 1; i >= 0; i--) {
    if ((deltas[i] > 0) === isWin) {
      count++;
    } else {
      break;
    }
  }

  return { type: isWin ? 'W' : 'L', count };
}

// ── Page Component ────────────────────────────────────────────

export default class PlayerProfilePage extends Component {
  private chart: Chart | null = null;
  private gsapCtx: gsap.Context | null = null;


  private renderPageHeader(): string {
    return `
      <div class="page-header flex items-center gap-3">
        <i data-lucide="circle-user" class="text-(--color-gold)"
           style="width:26px;height:26px"></i>
        <div>
          <h1 class="text-white font-display"
              style="font-size:clamp(28px,6vw,42px); letter-spacing:0.12em; line-height:1">
            PROFILO GIOCATORE
          </h1>
          <p class="font-ui"
             style="font-size:12px; color:rgba(255,255,255,0.5); letter-spacing:0.1em">
              Statistiche dettagliate e storico partite
          </p>
        </div>
      </div>
    `;
  }

  render(): string {
    const id = Number(this.params.id);
    const player = getPlayerById(id);

    if (!player) {
      return `
        <div class="text-center py-20">
          <p class="font-display text-4xl" style="color: var(--color-gold)">GIOCATORE NON TROVATO</p>
          <p class="font-body mt-2" style="color: var(--color-text-secondary)">
            Il giocatore con ID ${id} non esiste.
          </p>
          <a href="/" class="inline-block mt-6 font-ui text-sm px-5 py-2 rounded-lg"
             style="background: var(--color-gold-muted); color: var(--color-gold); letter-spacing: 0.08em">
            TORNA ALLA CLASSIFICA
          </a>
        </div>
      `;
    }

    const color = getPlayerColor(player.id);
    const rank = getRank(player.id);
    const displayElo = getDisplayElo(player);
    const className = player.class >= 0 ? getClassName(player.class) : 'Non classificato';
    const losses = player.matches - player.wins;
    const winRate = player.matches > 0 ? ((player.wins / player.matches) * 100).toFixed(1) : '0.0';
    const goalsPerMatch = player.matches > 0 ? (player.goalsFor / player.matches).toFixed(1) : '0.0';
    const concededPerMatch = player.matches > 0 ? (player.goalsAgainst / player.matches).toFixed(1) : '0.0';
    const defenceRate = player.goalsFor > 0
      ? ((1 - player.goalsAgainst / (player.goalsFor + player.goalsAgainst)) * 100).toFixed(0)
      : '0';
    const streak = computeCurrentStreak(player.matchesDelta);
    const streakLabel = streak.type === 'none'
      ? '---'
      : `${streak.count}${streak.type}`;
    const streakColor = streak.type === 'W'
      ? 'var(--color-win)'
      : streak.type === 'L'
        ? 'var(--color-loss)'
        : 'var(--color-text-secondary)';
    const peakElo = Math.round(player.bestElo ?? displayElo);

    // Recent matches (last 10 involving this player)
    const allMatches = getAllMatches();
    const playerMatches = allMatches.filter(
      m => m.teamA.defence === id || m.teamA.attack === id
        || m.teamB.defence === id || m.teamB.attack === id
    );
    const recentMatches = playerMatches.slice(-10).reverse();

    const avatarHtml = renderPlayerAvatar({
      initials: getInitials(player.name),
      color,
      size: 'xl',
      playerId: id
    });

    return `
      <div class="space-y-5 md:space-y-6">
        ${this.renderPageHeader()}
        <div id="hero-card"
             class="rounded-xl p-5 md:p-6 mb-6"
             style="
               background: var(--glass-bg);
               backdrop-filter: blur(var(--glass-blur-heavy));
               border: 1px solid ${color}33;
               box-shadow: 0 0 40px ${color}15, var(--shadow-card);
             ">

          <div class="flex flex-col lg:flex-row gap-6">

            <!-- Left: avatar + identity -->
            <div class="hero-left flex flex-col items-center lg:items-start gap-3 lg:min-w-[200px]">
              <div class="hero-avatar relative">
                ${avatarHtml}
                ${rank <= 3 && rank > 0
        ? `<span class="absolute -top-1 -right-1 text-xl leading-none">${getRankMedal(rank)}</span>`
        : ''}
                ${player.online ? `<span class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full" style="background:var(--color-online);border:2px solid rgba(15,42,32,0.9)"></span>` : ''}
              </div>
              <div class="hero-identity text-center lg:text-left">
                <h2 class="font-display text-3xl md:text-4xl tracking-wide"
                    style="color: #fff; line-height: 1">
                  ${player.name.toUpperCase()}
                </h2>
                <p class="font-ui text-xs mt-1 hero-class"
                   style="color: ${color}; letter-spacing: 0.1em">
                  ${className.toUpperCase()}
                </p>
                <p class="font-body text-xs mt-0.5" style="color: var(--color-text-muted)">
                  Rank #${rank > 0 ? rank : '---'}
                </p>
              </div>
            </div>

            <!-- Center: quick stats (mobile-first: ELO left, small stats right) -->
            <div class="hero-stats flex-1 flex items-center justify-between gap-4">
              <div class="elo-block flex-shrink-0">
                <p class="font-ui text-[10px] uppercase tracking-widest"
                   style="color: var(--color-text-muted)">ELO</p>
                <p class="font-display text-4xl md:text-5xl stat-elo"
                   style="color: var(--color-gold); line-height: 1.1">
                  ${displayElo}
                </p>
              </div>

              <div class="small-stats flex-1 flex items-center justify-end gap-4 text-center">
                <div class="stat-item">
                  <p class="font-ui text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">Partite</p>
                  <p class="font-display text-2xl stat-matches" style="color:#fff; line-height:1.1">${player.matches}</p>
                </div>
                <div class="stat-item">
                  <p class="font-ui text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">V</p>
                  <p class="font-display text-2xl stat-wins" style="color:var(--color-win); line-height:1.1">${player.wins}</p>
                </div>
                <div class="stat-item">
                  <p class="font-ui text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">S</p>
                  <p class="font-display text-2xl stat-losses" style="color:var(--color-loss); line-height:1.1">${losses}</p>
                </div>
                <div class="stat-item">
                  <p class="font-ui text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">WR</p>
                  <p class="font-display text-2xl stat-winrate" style="color:#fff; line-height:1.1">${winRate}%</p>
                </div>
              </div>
            </div>

            <!-- Right: compact goal stats card -->
            <div class="hero-goals w-full lg:w-auto ml-0 lg:ml-auto">
              <div class="rounded-lg p-3 h-full flex flex-col justify-center items-center w-full lg:w-auto"
                   style="background: rgba(0,0,0,0.25); border-radius: 12px; border:1px solid rgba(255,255,255,0.03); min-width:120px">
                <div style="text-align:center">
                  <div class="font-ui text-[10px] uppercase tracking-widest" style="color: var(--color-text-muted)">GOAL STATS</div>
                  <div class="mt-3 font-display text-2xl" style="color: var(--color-win)">${player.goalsFor}</div>
                  <div class="text-[10px] font-body" style="color: var(--color-text-dim)">SCORED</div>
                </div>
                <div class="w-full border-t my-3" style="border-color: rgba(255,255,255,0.04)"></div>
                <div style="text-align:center">
                  <div class="font-display text-2xl" style="color: var(--color-loss)">${player.goalsAgainst}</div>
                  <div class="text-[10px] font-body" style="color: var(--color-text-dim)">CONCEDed</div>
                </div>
                <div class="w-full border-t my-3" style="border-color: rgba(255,255,255,0.04)"></div>
                <div style="text-align:center">
                  <div class="font-display text-xl" style="color: #fff">${goalsPerMatch}</div>
                  <div class="text-[10px] font-body" style="color: var(--color-text-dim)">per match</div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- ── Chart + Recent Matches Grid ──────────────────── -->
        <div id="chart-section" class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mb-6">

          <!-- ELO Chart -->
          <div class="rounded-xl p-4 md:p-5"
               style="background: var(--glass-bg);
                      backdrop-filter: blur(var(--glass-blur));
                      border: 1px solid var(--glass-border)">
            <h3 class="font-ui text-xs uppercase tracking-widest mb-3"
                style="color: var(--color-text-muted)">
              ANDAMENTO ELO
            </h3>
            <div class="relative" style="height: 260px">
              <canvas id="elo-chart"></canvas>
            </div>
          </div>

          <!-- Recent Matches -->
          <div class="rounded-xl p-4 md:p-5 overflow-y-auto"
               style="background: var(--glass-bg);
                      backdrop-filter: blur(var(--glass-blur));
                      border: 1px solid var(--glass-border);
                      max-height: 340px">
            <h3 class="font-ui text-xs uppercase tracking-widest mb-3"
                style="color: var(--color-text-muted)">
              ULTIME PARTITE
            </h3>
            <div class="flex flex-col gap-2">
              ${recentMatches.length > 0
        ? recentMatches.map(m => this.renderMatchRow(m, id)).join('')
        : `<p class="font-body text-xs text-center py-4"
                      style="color: var(--color-text-dim)">
                    Nessuna partita trovata
                  </p>`}
            </div>
          </div>

        </div>

        <!-- ── Stats Grid ───────────────────────────────────── -->
        <div id="stats-grid" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          ${this.renderStatCard('award', 'Peak ELO', `${peakElo}`, 'Miglior punteggio raggiunto')}
          ${this.renderStatCard('target', 'Gol/Partita', goalsPerMatch, `${player.goalsFor} gol totali`)}
          ${this.renderStatCard('shield', 'Difesa', `${defenceRate}%`, 'Tasso difensivo')}
          ${this.renderStatCard('trending-up', 'Serie', streakLabel,
          streak.type === 'W'
            ? 'Vittorie consecutive'
            : streak.type === 'L'
              ? 'Sconfitte consecutive'
              : 'Nessuna serie attiva',
          streakColor)}
        </div>

        <!-- ── Win/Loss Distribution Bar ────────────────────── -->
        <div id="winloss-bar" class="rounded-xl p-4 md:p-5"
             style="background: var(--glass-bg);
                    backdrop-filter: blur(var(--glass-blur));
                    border: 1px solid var(--glass-border)">
          <h3 class="font-ui text-xs uppercase tracking-widest mb-3"
              style="color: var(--color-text-muted)">
            DISTRIBUZIONE VITTORIE / SCONFITTE
          </h3>
          <div class="flex items-center gap-3 mb-2">
            <span class="font-ui text-xs"
                  style="color: var(--color-win); min-width: 50px">${player.wins}V</span>
            <div class="flex-1 h-6 rounded-full overflow-hidden flex"
                 style="background: rgba(255,255,255,0.06)">
              <div id="win-bar" class="h-full rounded-l-full transition-all"
                   style="width: 0%; background: var(--color-win)"></div>
              <div id="loss-bar" class="h-full rounded-r-full transition-all"
                   style="width: 0%; background: var(--color-loss)"></div>
            </div>
            <span class="font-ui text-xs"
                  style="color: var(--color-loss); min-width: 50px; text-align: right">
              ${losses}S
            </span>
          </div>
          <div class="flex justify-between">
            <span class="font-body text-[10px]" style="color: var(--color-text-dim)">
              ${winRate}% vittorie
            </span>
            <span class="font-body text-[10px]" style="color: var(--color-text-dim)">
              ${(100 - parseFloat(winRate)).toFixed(1)}% sconfitte
            </span>
          </div>
        </div>

      </div>
    `;
  }

  // ── Match row renderer ────────────────────────────────────

  private renderMatchRow(
    match: ReturnType<typeof getAllMatches>[number],
    playerId: number
  ): string {
    const inTeamA = match.teamA.defence === playerId || match.teamA.attack === playerId;
    const isWin = inTeamA
      ? match.score[0] > match.score[1]
      : match.score[1] > match.score[0];
    const delta = inTeamA ? match.deltaELO[0] : match.deltaELO[1];
    const roundedDelta = Math.round(delta * 10) / 10;
    const deltaSign = roundedDelta >= 0 ? '+' : '';

    // Determine opponent names
    const opponentTeam = inTeamA ? match.teamB : match.teamA;
    const opp1 = getPlayerById(opponentTeam.defence);
    const opp2 = getPlayerById(opponentTeam.attack);
    const oppNames = [opp1?.name ?? '?', opp2?.name ?? '?'].join(' & ');

    const score = `${match.score[0]} - ${match.score[1]}`;

    return `
      <div class="flex items-center gap-2 py-2 px-3 rounded-lg"
           style="background: rgba(255,255,255,0.03);
                  border: 1px solid rgba(255,255,255,0.04)">
        <div class="flex-1 min-w-0">
          <p class="font-body text-xs truncate" style="color: #fff">${oppNames}</p>
          <p class="font-body text-[10px]" style="color: var(--color-text-dim)">
            ${formatFullDate(match.createdAt)}
          </p>
        </div>
        <div class="text-center px-2">
          <p class="font-display text-sm" style="color: #fff">${score}</p>
        </div>
        <div class="flex flex-col items-end gap-0.5">
          <span class="font-ui text-[10px] px-1.5 py-0.5 rounded"
                style="background: ${isWin ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)'};
                       color: ${isWin ? 'var(--color-win)' : 'var(--color-loss)'}">
            ${isWin ? 'WIN' : 'LOSS'}
          </span>
          <span class="font-body text-[10px]"
                style="color: ${roundedDelta >= 0 ? 'var(--color-win)' : 'var(--color-loss)'}">
            ${deltaSign}${roundedDelta}
          </span>
        </div>
      </div>
    `;
  }

  // ── Stat card renderer ────────────────────────────────────

  private renderStatCard(
    icon: string,
    label: string,
    value: string,
    subtitle: string,
    valueColor?: string
  ): string {
    return `
      <div class="stat-card rounded-xl p-4"
           style="background: var(--glass-bg);
                  backdrop-filter: blur(var(--glass-blur));
                  border: 1px solid var(--glass-border)">
      <div class="flex flex-col items-start"> 
        <i data-lucide="${icon}" class="w-5 h-5 mb-2"
           style="color: var(--color-gold-dim)"></i>
        <p class="font-ui text-[10px] uppercase tracking-widest"
           style="color: var(--color-text-muted)">${label}</p>
           </div>
        <p class="font-display text-3xl mt-1"

           style="color: ${valueColor ?? '#fff'}; line-height: 1.1">${value}</p>
        <p class="font-body text-[10px] mt-1"
           style="color: var(--color-text-dim)">${subtitle}</p>
      </div>
    `;
  }

  // ── Mount ─────────────────────────────────────────────────

  mount(): void {
    const id = Number(this.params.id);
    const player = getPlayerById(id);
    if (!player) return;

    // Register Chart.js components
    Chart.register(...registerables);

    // Lucide icons
    refreshIcons();

    // ── Build ELO history from all matches ────────────────
    const allMatches = getAllMatches();
    const labels: string[] = [];
    const eloData: number[] = [];
    let currentElo = player.startElo;

    for (const match of allMatches) {
      const inTeamA = match.teamA.defence === id || match.teamA.attack === id;
      const inTeamB = match.teamB.defence === id || match.teamB.attack === id;

      if (!inTeamA && !inTeamB) continue;

      const delta = inTeamA ? match.deltaELO[0] : match.deltaELO[1];
      currentElo += delta;

      labels.push(formatShortDate(match.createdAt));
      eloData.push(Math.round(currentElo));
    }

    // ── Create Chart ──────────────────────────────────────
    const canvas = this.$id('elo-chart') as HTMLCanvasElement | null;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 260);
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.25)');
        gradient.addColorStop(1, 'rgba(240, 165, 0, 0.02)');

        this.chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'ELO',
              data: eloData,
              borderColor: '#FFD700',
              backgroundColor: gradient,
              borderWidth: 2,
              pointBackgroundColor: '#FFD700',
              pointBorderColor: '#FFD700',
              pointRadius: eloData.length > 30 ? 0 : 3,
              pointHoverRadius: 5,
              fill: true,
              tension: 0.3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              intersect: false,
              mode: 'index'
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 42, 32, 0.95)',
                titleFont: { family: 'Oswald', size: 11 },
                bodyFont: { family: 'Inter', size: 12 },
                titleColor: 'rgba(255,255,255,0.5)',
                bodyColor: '#FFD700',
                borderColor: 'rgba(255,215,0,0.2)',
                borderWidth: 1,
                padding: 10,
                displayColors: false,
                callbacks: {
                  label: context => `ELO: ${context.parsed.y}`
                }
              }
            },
            scales: {
              x: {
                ticks: {
                  font: { family: 'Oswald', size: 10 },
                  color: 'rgba(255,255,255,0.4)',
                  maxRotation: 45,
                  maxTicksLimit: 12
                },
                grid: { color: 'rgba(255,255,255,0.06)' },
                border: { display: false }
              },
              y: {
                ticks: {
                  font: { family: 'Oswald', size: 10 },
                  color: 'rgba(255,255,255,0.4)'
                },
                grid: { color: 'rgba(255,255,255,0.06)' },
                border: { display: false }
              }
            }
          }
        });
      }
    }

    // ── GSAP animations ───────────────────────────────────
    this.gsapCtx = gsap.context(() => {
      // Hero card entrance
      gsap.from('#hero-card', {
        opacity: 0,
        y: 30,
        duration: 0.6,
        ease: 'power3.out'
      });

      // Avatar and identity
      gsap.from('.hero-avatar', { scale: 0.92, opacity: 0, duration: 0.45, ease: 'back.out(1.2)' });
      gsap.from('.hero-identity', { x: -12, opacity: 0, duration: 0.45, delay: 0.08, ease: 'power2.out' });

      // Center stats numbers (stagger)
      gsap.from('.hero-stats .stat-elo, .hero-stats .stat-matches, .hero-stats .stat-wins, .hero-stats .stat-losses, .hero-stats .stat-winrate', {
        y: 12,
        opacity: 0,
        stagger: 0.06,
        duration: 0.45,
        delay: 0.15,
        ease: 'power2.out'
      });

      // Compact goals card
      gsap.from('.hero-goals', { x: 12, opacity: 0, duration: 0.45, delay: 0.18, ease: 'power2.out' });

      // Chart section
      gsap.from('#chart-section', {
        opacity: 0,
        y: 25,
        duration: 0.5,
        delay: 0.15,
        ease: 'power3.out'
      });

      // Stats grid cards
      gsap.from('#stats-grid .stat-card', {
        opacity: 0,
        y: 20,
        duration: 0.4,
        stagger: 0.08,
        delay: 0.3,
        ease: 'power2.out'
      });

      // Win/loss bar section
      gsap.from('#winloss-bar', {
        opacity: 0,
        y: 20,
        duration: 0.4,
        delay: 0.5,
        ease: 'power2.out'
      });

      // Animate win/loss bar widths
      const winPct = player.matches > 0
        ? (player.wins / player.matches) * 100
        : 50;
      const lossPct = 100 - winPct;

      gsap.to('#win-bar', {
        width: `${winPct}%`,
        duration: 0.8,
        delay: 0.7,
        ease: 'power2.out'
      });

      gsap.to('#loss-bar', {
        width: `${lossPct}%`,
        duration: 0.8,
        delay: 0.7,
        ease: 'power2.out'
      });
    }, this.el ?? undefined);
  }

  // ── Destroy ───────────────────────────────────────────────

  destroy(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    if (this.gsapCtx) {
      this.gsapCtx.revert();
      this.gsapCtx = null;
    }
  }
}
