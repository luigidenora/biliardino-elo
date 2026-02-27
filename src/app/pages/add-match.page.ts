/**
 * AddMatchPage — Form for adding and editing matches.
 *
 * Route: /add-match (admin only)
 *
 * Ports business logic from add-match.view.ts with new Figma-style design.
 */

import { expectedScore } from '@/services/elo.service';
import { addMatch, editMatch, getAllMatches } from '@/services/match.service';
import { getAllPlayers, getPlayerById } from '@/services/player.service';
import { saveMatch } from '@/services/repository.service';
import { formatDate } from '@/utils/format-date.util';
import gsap from 'gsap';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { refreshIcons } from '../icons';

import type { IMatch, ITeam } from '@/models/match.interface';
import type { IPlayer } from '@/models/player.interface';

const CLASS_COLORS: Record<number, string> = {
  0: '#FFD700',
  1: '#4A90D9',
  2: '#27AE60',
  3: '#C0C0C0',
  4: '#8B7D6B'
};

const RECENT_MATCHES_COUNT = 15;

class AddMatchPage extends Component {
  private editingMatchId: number | null = null;

  async render(): Promise<string> {
    const players = [...getAllPlayers()].sort((a, b) => a.name.localeCompare(b.name));
    const matches = getAllMatches();
    const recentMatches = matches.slice(-RECENT_MATCHES_COUNT).reverse();

    return `
      <div class="space-y-5 md:space-y-6" id="add-match-page">

        ${this.renderPageHeader()}

        <div class="flex flex-col lg:grid lg:grid-cols-[1fr_1fr] gap-5 md:gap-6">
          ${this.renderFormCard(players)}
          ${this.renderPreviewCard()}
        </div>

        ${this.renderRecentMatches(recentMatches)}
      </div>
    `;
  }

  override mount(): void {
    refreshIcons();

    // Bind form submit
    const form = this.$('#add-match-form') as HTMLFormElement | null;
    form?.addEventListener('submit', e => this.handleSubmit(e));

    // Bind select changes for live expected score preview
    const selects = ['teamA-defence', 'teamA-attack', 'teamB-defence', 'teamB-attack'];
    for (const id of selects) {
      this.$id(id)?.addEventListener('change', () => this.updatePreview());
    }

    // Bind reset button
    this.$('#reset-form-btn')?.addEventListener('click', () => this.resetForm());

    // Bind edit buttons on existing match rows
    this.bindEditButtons();

    // GSAP animations
    gsap.from('.form-card', { opacity: 0, y: 20, duration: 0.4, ease: 'power2.out' });
    gsap.from('.match-row', {
      opacity: 0, x: -10, stagger: 0.03, duration: 0.25, ease: 'power2.out', delay: 0.2
    });
  }

  override destroy(): void { }

  // ── Section Renderers ──────────────────────────────────────

  private renderPageHeader(): string {
    return `
      <div class="flex items-center gap-3">
        <i data-lucide="swords" class="text-(--color-gold)"
           style="width:26px;height:26px"></i>
        <div>
          <h1 class="text-white font-display"
              style="font-size:clamp(28px,6vw,42px); letter-spacing:0.12em; line-height:1">
            AGGIUNGI PARTITA
          </h1>
          <p class="font-ui"
             style="font-size:12px; color:rgba(255,255,255,0.5); letter-spacing:0.1em">
            INSERISCI I DETTAGLI DELLA PARTITA
          </p>
        </div>
      </div>
    `;
  }

  private renderFormCard(players: IPlayer[]): string {
    const options = players.map(p =>
      `<option value="${p.id}">${p.name} (${Math.round(p.elo)})</option>`
    ).join('');
    const selectOptions = `<option value="">-- seleziona --</option>${options}`;

    return `
      <div class="form-card glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center gap-2"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <i data-lucide="plus-circle" style="width:14px;height:14px;color:var(--color-gold)"></i>
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
            DETTAGLI PARTITA
          </span>
        </div>

        <form id="add-match-form" class="p-4 md:p-5 space-y-5">
          <!-- Team A (Red) -->
          <div>
            <div class="flex items-center gap-2 mb-3">
              <div class="w-3 h-3 rounded-full" style="background:var(--color-team-red)"></div>
              <span class="font-ui" style="font-size:12px; color:var(--color-team-red); letter-spacing:0.1em">
                TEAM ROSSO
              </span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="font-body text-xs block mb-1" style="color:rgba(255,255,255,0.4)">Difesa</label>
                <select id="teamA-defence" class="w-full px-3 py-2.5 rounded-lg font-ui text-sm text-white"
                        style="background:rgba(229,62,62,0.12); border:1px solid rgba(229,62,62,0.3);
                               outline:none; appearance:none">
                  ${selectOptions}
                </select>
              </div>
              <div>
                <label class="font-body text-xs block mb-1" style="color:rgba(255,255,255,0.4)">Attacco</label>
                <select id="teamA-attack" class="w-full px-3 py-2.5 rounded-lg font-ui text-sm text-white"
                        style="background:rgba(229,62,62,0.12); border:1px solid rgba(229,62,62,0.3);
                               outline:none; appearance:none">
                  ${selectOptions}
                </select>
              </div>
            </div>
          </div>

          <!-- VS Divider -->
          <div class="flex items-center gap-3">
            <div class="flex-1 h-px" style="background:rgba(255,255,255,0.1)"></div>
            <div class="px-3 py-1 rounded-full font-display"
                 style="font-size:16px; color:var(--color-gold); letter-spacing:0.1em;
                        background:rgba(255,215,0,0.1); border:1px solid rgba(255,215,0,0.3)">
              VS
            </div>
            <div class="flex-1 h-px" style="background:rgba(255,255,255,0.1)"></div>
          </div>

          <!-- Team B (Blue) -->
          <div>
            <div class="flex items-center gap-2 mb-3">
              <div class="w-3 h-3 rounded-full" style="background:var(--color-team-blue)"></div>
              <span class="font-ui" style="font-size:12px; color:var(--color-team-blue); letter-spacing:0.1em">
                TEAM BLU
              </span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="font-body text-xs block mb-1" style="color:rgba(255,255,255,0.4)">Difesa</label>
                <select id="teamB-defence" class="w-full px-3 py-2.5 rounded-lg font-ui text-sm text-white"
                        style="background:rgba(49,130,206,0.12); border:1px solid rgba(49,130,206,0.3);
                               outline:none; appearance:none">
                  ${selectOptions}
                </select>
              </div>
              <div>
                <label class="font-body text-xs block mb-1" style="color:rgba(255,255,255,0.4)">Attacco</label>
                <select id="teamB-attack" class="w-full px-3 py-2.5 rounded-lg font-ui text-sm text-white"
                        style="background:rgba(49,130,206,0.12); border:1px solid rgba(49,130,206,0.3);
                               outline:none; appearance:none">
                  ${selectOptions}
                </select>
              </div>
            </div>
          </div>

          <!-- Score -->
          <div>
            <div class="font-ui mb-3" style="font-size:12px; color:var(--color-gold); letter-spacing:0.1em">
              PUNTEGGIO
            </div>
            <div class="flex items-center justify-center gap-4">
              <div class="text-center">
                <label class="font-body text-xs block mb-1" style="color:rgba(229,62,62,0.7)">Rosso</label>
                <input id="scoreA" type="number" min="0" max="8" value=""
                       class="w-20 h-16 text-center rounded-lg font-display text-white"
                       style="font-size:32px; background:rgba(229,62,62,0.12);
                              border:1px solid rgba(229,62,62,0.3); outline:none" />
              </div>
              <span class="font-display text-2xl" style="color:rgba(255,255,255,0.3)">—</span>
              <div class="text-center">
                <label class="font-body text-xs block mb-1" style="color:rgba(49,130,206,0.7)">Blu</label>
                <input id="scoreB" type="number" min="0" max="8" value=""
                       class="w-20 h-16 text-center rounded-lg font-display text-white"
                       style="font-size:32px; background:rgba(49,130,206,0.12);
                              border:1px solid rgba(49,130,206,0.3); outline:none" />
              </div>
            </div>
          </div>

          <!-- Message -->
          <div id="form-message" class="font-body text-sm text-center" style="min-height:1.25rem"></div>

          <!-- Buttons -->
          <div class="flex gap-3">
            <button type="submit"
                    class="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-display text-lg transition-all"
                    style="letter-spacing:0.12em; background:linear-gradient(135deg,#FFD700,#F0A500);
                           color:#0F2A20; border:none; cursor:pointer">
              SALVA PARTITA
            </button>
            <button type="button" id="reset-form-btn"
                    class="px-4 py-3 rounded-xl flex items-center justify-center transition-all"
                    style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); cursor:pointer">
              <i data-lucide="rotate-ccw" style="width:16px;height:16px;color:rgba(255,255,255,0.5)"></i>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  private renderPreviewCard(): string {
    return `
      <div class="form-card glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center gap-2"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <i data-lucide="swords" style="width:14px;height:14px;color:var(--color-gold)"></i>
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
            ANTEPRIMA
          </span>
        </div>
        <div id="match-preview" class="p-4 md:p-5">
          <div class="flex items-center justify-center py-10">
            <span class="font-ui" style="font-size:12px; color:rgba(255,255,255,0.25); letter-spacing:0.1em">
              SELEZIONA 4 GIOCATORI PER L'ANTEPRIMA
            </span>
          </div>
        </div>
      </div>
    `;
  }

  private renderRecentMatches(matches: IMatch[]): string {
    if (matches.length === 0) return '';

    const rows = matches.map(m => this.renderMatchRow(m)).join('');

    return `
      <div class="glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center justify-between"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <div class="flex items-center gap-2">
            <i data-lucide="edit-3" style="width:14px;height:14px;color:var(--color-gold)"></i>
            <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
              ULTIME PARTITE
            </span>
          </div>
          <span class="font-ui" style="font-size:11px; color:rgba(255,255,255,0.4)">
            ${matches.length} partite
          </span>
        </div>
        <div id="recent-matches-list" class="p-3 space-y-2 overflow-y-auto" style="max-height:500px">
          ${rows}
        </div>
      </div>
    `;
  }

  private renderMatchRow(match: IMatch): string {
    const ad = getPlayerById(match.teamA.defence);
    const aa = getPlayerById(match.teamA.attack);
    const bd = getPlayerById(match.teamB.defence);
    const ba = getPlayerById(match.teamB.attack);

    const teamANames = `${ad?.name ?? '?'} / ${aa?.name ?? '?'}`;
    const teamBNames = `${bd?.name ?? '?'} / ${ba?.name ?? '?'}`;
    const scoreA = match.score[0];
    const scoreB = match.score[1];
    const aWon = scoreA > scoreB;

    return `
      <div class="match-row flex items-center justify-between p-2.5 md:p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
           style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06)"
           data-match-id="${match.id}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-ui text-xs truncate" style="color:${aWon ? 'var(--color-team-red)' : 'rgba(229,62,62,0.5)'}">
              ${teamANames}
            </span>
            <span class="font-display text-sm" style="color:rgba(255,255,255,0.6)">
              ${scoreA} - ${scoreB}
            </span>
            <span class="font-ui text-xs truncate" style="color:${!aWon ? 'var(--color-team-blue)' : 'rgba(49,130,206,0.5)'}">
              ${teamBNames}
            </span>
          </div>
          <div class="font-body mt-0.5" style="font-size:10px; color:rgba(255,255,255,0.3)">
            ${formatDate(match.createdAt)}
          </div>
        </div>
        <button class="edit-match-btn ml-2 px-2 py-1 rounded font-ui text-xs transition-colors"
                style="color:var(--color-gold-dim); background:rgba(255,215,0,0.08); border:1px solid rgba(255,215,0,0.2)"
                data-match-id="${match.id}">
          EDIT
        </button>
      </div>
    `;
  }

  // ── Form Logic ─────────────────────────────────────────────

  private updatePreview(): void {
    const preview = this.$id('match-preview');
    if (!preview) return;

    const adId = Number((this.$id('teamA-defence') as HTMLSelectElement)?.value);
    const aaId = Number((this.$id('teamA-attack') as HTMLSelectElement)?.value);
    const bdId = Number((this.$id('teamB-defence') as HTMLSelectElement)?.value);
    const baId = Number((this.$id('teamB-attack') as HTMLSelectElement)?.value);

    if (!adId || !aaId || !bdId || !baId) {
      preview.innerHTML = `
        <div class="flex items-center justify-center py-10">
          <span class="font-ui" style="font-size:12px; color:rgba(255,255,255,0.25); letter-spacing:0.1em">
            SELEZIONA 4 GIOCATORI PER L'ANTEPRIMA
          </span>
        </div>
      `;
      return;
    }

    const ad = getPlayerById(adId);
    const aa = getPlayerById(aaId);
    const bd = getPlayerById(bdId);
    const ba = getPlayerById(baId);
    if (!ad || !aa || !bd || !ba) return;

    const eloA = (ad.elo + aa.elo) / 2;
    const eloB = (bd.elo + ba.elo) / 2;
    const expA = expectedScore(eloA, eloB);
    const expB = 1 - expA;

    const renderPlayer = (p: IPlayer, role: string): string => {
      const color = CLASS_COLORS[p.class] ?? '#8B7D6B';
      return `
        <div class="flex items-center gap-2">
          ${renderPlayerAvatar({ initials: getInitials(p.name), color, size: 'sm', playerId: p.id })}
          <div class="min-w-0">
            <div class="text-white font-ui text-xs truncate">${p.name}</div>
            <div class="font-body" style="font-size:10px; color:rgba(255,255,255,0.4)">${role} · ${Math.round(p.elo)}</div>
          </div>
        </div>
      `;
    };

    preview.innerHTML = `
      <div class="space-y-4">
        <!-- Team A -->
        <div class="p-3 rounded-lg" style="background:rgba(229,62,62,0.1); border:1px solid rgba(229,62,62,0.25)">
          <div class="font-ui text-xs mb-2" style="color:var(--color-team-red); letter-spacing:0.1em">TEAM ROSSO</div>
          <div class="space-y-2">
            ${renderPlayer(ad, 'DIF')}
            ${renderPlayer(aa, 'ATT')}
          </div>
          <div class="mt-2 font-ui text-xs" style="color:rgba(255,255,255,0.4)">
            ELO medio: <span style="color:var(--color-team-red)">${Math.round(eloA)}</span>
          </div>
        </div>

        <!-- Expected Score -->
        <div class="p-3 rounded-lg" style="background:rgba(10,25,18,0.6)">
          <div class="font-ui text-xs mb-2" style="color:var(--color-gold); letter-spacing:0.1em">PROBABILIT&Agrave;</div>
          <div class="flex justify-between font-display text-lg">
            <span style="color:var(--color-team-red)">${(expA * 100).toFixed(1)}%</span>
            <span style="color:var(--color-team-blue)">${(expB * 100).toFixed(1)}%</span>
          </div>
          <div class="flex rounded-full overflow-hidden h-2 mt-2">
            <div style="width:${expA * 100}%; background:var(--color-team-red)"></div>
            <div style="width:${expB * 100}%; background:var(--color-team-blue)"></div>
          </div>
        </div>

        <!-- Team B -->
        <div class="p-3 rounded-lg" style="background:rgba(49,130,206,0.1); border:1px solid rgba(49,130,206,0.25)">
          <div class="font-ui text-xs mb-2" style="color:var(--color-team-blue); letter-spacing:0.1em">TEAM BLU</div>
          <div class="space-y-2">
            ${renderPlayer(bd, 'DIF')}
            ${renderPlayer(ba, 'ATT')}
          </div>
          <div class="mt-2 font-ui text-xs" style="color:rgba(255,255,255,0.4)">
            ELO medio: <span style="color:var(--color-team-blue)">${Math.round(eloB)}</span>
          </div>
        </div>
      </div>
    `;
  }

  private async handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const messageEl = this.$id('form-message');
    if (messageEl) messageEl.textContent = '';

    try {
      const adId = Number((this.$id('teamA-defence') as HTMLSelectElement)?.value);
      const aaId = Number((this.$id('teamA-attack') as HTMLSelectElement)?.value);
      const bdId = Number((this.$id('teamB-defence') as HTMLSelectElement)?.value);
      const baId = Number((this.$id('teamB-attack') as HTMLSelectElement)?.value);

      if (!adId || !aaId || !bdId || !baId) {
        throw new Error('Seleziona tutti e 4 i giocatori.');
      }

      const ids = [adId, aaId, bdId, baId];
      if (new Set(ids).size !== 4) {
        throw new Error('Ogni giocatore deve essere diverso.');
      }

      const scoreA = Number((this.$id('scoreA') as HTMLInputElement)?.value);
      const scoreB = Number((this.$id('scoreB') as HTMLInputElement)?.value);

      if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
        throw new Error('Inserisci punteggi validi.');
      }

      if (scoreA === scoreB) {
        throw new Error('Il pareggio non è consentito.');
      }

      if (Math.max(scoreA, scoreB) > 8 || Math.min(scoreA, scoreB) < 0) {
        throw new Error('Punteggio deve essere tra 0 e 8.');
      }

      const teamA: ITeam = { defence: adId, attack: aaId };
      const teamB: ITeam = { defence: bdId, attack: baId };

      if (this.editingMatchId) {
        const dto = editMatch(this.editingMatchId, teamA, teamB, [scoreA, scoreB]);
        await saveMatch(dto, true);
        if (messageEl) {
          messageEl.style.color = 'var(--color-win)';
          messageEl.textContent = 'Partita aggiornata con successo.';
        }
      } else {
        const dto = addMatch(teamA, teamB, [scoreA, scoreB]);
        await saveMatch(dto);
        if (messageEl) {
          messageEl.style.color = 'var(--color-win)';
          messageEl.textContent = 'Partita salvata con successo.';
        }
      }

      this.editingMatchId = null;
      this.resetForm();

      // Re-render recent matches
      const matches = getAllMatches().slice(-RECENT_MATCHES_COUNT).reverse();
      const listEl = this.$('#recent-matches-list');
      if (listEl) {
        listEl.innerHTML = matches.map(m => this.renderMatchRow(m)).join('');
        this.bindEditButtons();
      }
    } catch (error) {
      console.error(error);
      if (messageEl) {
        messageEl.style.color = 'var(--color-loss)';
        messageEl.textContent = error instanceof Error ? error.message : 'Errore nel salvare la partita.';
      }
    }
  }

  private resetForm(): void {
    const form = this.$('#add-match-form') as HTMLFormElement | null;
    form?.reset();
    this.editingMatchId = null;
    this.updatePreview();
    const messageEl = this.$id('form-message');
    if (messageEl) messageEl.textContent = '';
  }

  private startEditing(matchId: number): void {
    const match = getAllMatches().find(m => m.id === matchId);
    if (!match) return;

    this.editingMatchId = matchId;

    (this.$id('teamA-defence') as HTMLSelectElement).value = String(match.teamA.defence);
    (this.$id('teamA-attack') as HTMLSelectElement).value = String(match.teamA.attack);
    (this.$id('teamB-defence') as HTMLSelectElement).value = String(match.teamB.defence);
    (this.$id('teamB-attack') as HTMLSelectElement).value = String(match.teamB.attack);
    (this.$id('scoreA') as HTMLInputElement).value = String(match.score[0]);
    (this.$id('scoreB') as HTMLInputElement).value = String(match.score[1]);

    this.updatePreview();

    const messageEl = this.$id('form-message');
    if (messageEl) {
      messageEl.style.color = 'var(--color-gold)';
      messageEl.textContent = `Modificando partita #${matchId}...`;
    }

    // Scroll to form
    this.$('#add-match-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private bindEditButtons(): void {
    const buttons = this.$$('.edit-match-btn');
    for (const btn of buttons) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number((btn as HTMLElement).dataset.matchId);
        if (id) this.startEditing(id);
      });
    }
  }
}

export default AddMatchPage;
