/**
 * AddPlayerPage — Form for adding new players.
 *
 * Route: /add-player (admin only)
 *
 * Ports business logic from add-player.view.ts with new Figma-style design.
 */

import { createPlayerDTO, getAllPlayers } from '@/services/player.service';
import { savePlayer } from '@/services/repository.service';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import gsap from 'gsap';
import { animateVisible } from '@/utils/animate-visible.util';
import { Component } from '../components/component.base';
import { getInitials, renderPlayerAvatar } from '../components/player-avatar.component';
import { refreshIcons } from '../icons';

import type { IPlayer } from '@/models/player.interface';

const CLASS_COLORS: Record<number, string> = {
  0: '#FFD700',
  1: '#4A90D9',
  2: '#27AE60',
  3: '#C0C0C0',
  4: '#8B7D6B'
};

class AddPlayerPage extends Component {
  private cleanupObserver: (() => void) | null = null;
  async render(): Promise<string> {
    const players = [...getAllPlayers()].sort((a, b) => a.name.localeCompare(b.name));

    return `
      <div class="space-y-5 md:space-y-6" id="add-player-page">

        ${this.renderPageHeader()}

        <div class="flex flex-col lg:grid lg:grid-cols-[400px_1fr] gap-5 md:gap-6">
          ${this.renderFormCard()}
          ${this.renderPlayersList(players)}
        </div>
      </div>
    `;
  }

  override mount(): void {
    refreshIcons();

    // Bind form submit
    const form = this.$('#add-player-form') as HTMLFormElement | null;
    form?.addEventListener('submit', e => this.handleSubmit(e));

    // Bind defence slider to update display
    const slider = this.$id('player-defence') as HTMLInputElement | null;
    slider?.addEventListener('input', () => this.updateDefenceDisplay());

    // Bind ELO radio buttons to update visual state on selection
    for (const radio of this.$$('input[name="player-elo"]') as HTMLInputElement[]) {
      radio.addEventListener('change', () => this.updateEloLabels());
    }

    // GSAP animations
    gsap.from('.form-card', { y: 20, duration: 0.4, ease: 'power2.out' });
    this.cleanupObserver = animateVisible({
      selector: '.player-row',
      vars: { x: -10, duration: 0.25, ease: 'power2.out', delay: 0.2 },
      stagger: 0.03
    });
  }

  override destroy(): void {
    this.cleanupObserver?.();
    this.cleanupObserver = null;
  }

  // ── Section Renderers ──────────────────────────────────────

  private renderPageHeader(): string {
    return `
      <div class="flex items-center gap-3">
        <i data-lucide="user-plus" class="text-(--color-gold)"
           style="width:26px;height:26px"></i>
        <div>
          <h1 class="text-white font-display"
              style="font-size:clamp(28px,6vw,42px); letter-spacing:0.12em; line-height:1">
            AGGIUNGI GIOCATORE
          </h1>
          <p class="font-ui"
             style="font-size:12px; color:rgba(255,255,255,0.5); letter-spacing:0.1em">
            REGISTRA UN NUOVO GIOCATORE
          </p>
        </div>
      </div>
    `;
  }

  private renderFormCard(): string {
    return `
      <div class="form-card glass-card-gold rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center gap-2"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <i data-lucide="user-plus" style="width:14px;height:14px;color:var(--color-gold)"></i>
          <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
            NUOVO GIOCATORE
          </span>
        </div>

        <form id="add-player-form" class="p-4 md:p-5 space-y-5">

          <!-- Name -->
          <div>
            <label class="font-ui text-xs block mb-2" style="color:rgba(255,255,255,0.5); letter-spacing:0.1em">
              NOME
            </label>
            <input id="player-name" type="text" placeholder="Nome e Cognome"
                   class="w-full px-4 py-3 rounded-lg font-ui text-sm text-white placeholder:text-white/25"
                   style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); outline:none"
                   required />
          </div>

          <!-- ELO -->
          <div>
            <label class="font-ui text-xs block mb-2" style="color:rgba(255,255,255,0.5); letter-spacing:0.1em">
              ELO INIZIALE
            </label>
            <div class="grid grid-cols-3 gap-2">
              ${[1000, 1100, 1200].map(elo => `
                <label class="elo-label flex items-center justify-center px-3 py-2.5 rounded-lg cursor-pointer transition-all
                              ${elo === 1200 ? 'ring-2 ring-(--color-gold)' : ''}"
                       style="background:rgba(255,215,0,${elo === 1200 ? '0.15' : '0.05'});
                              border:1px solid rgba(255,215,0,${elo === 1200 ? '0.4' : '0.15'})">
                  <input type="radio" name="player-elo" value="${elo}"
                         ${elo === 1200 ? 'checked' : ''}
                         class="sr-only" />
                  <span class="font-display text-lg" style="color:var(--color-gold); letter-spacing:0.05em">
                    ${elo}
                  </span>
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Defence Ratio -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="font-ui text-xs" style="color:rgba(255,255,255,0.5); letter-spacing:0.1em">
                RAPPORTO DIFESA
              </label>
              <span id="defence-display" class="font-display text-sm" style="color:var(--color-gold)">
                50%
              </span>
            </div>
            <input id="player-defence" type="range" min="0" max="100" value="50" step="5"
                   class="w-full h-2 rounded-full appearance-none cursor-pointer"
                   style="background:linear-gradient(90deg, var(--color-team-blue) 0%, rgba(255,255,255,0.15) 50%, var(--color-team-red) 100%)" />
            <div class="flex justify-between mt-1">
              <span class="font-body text-xs" style="color:rgba(49,130,206,0.6)">ATT</span>
              <span class="font-body text-xs" style="color:rgba(255,255,255,0.3)">50/50</span>
              <span class="font-body text-xs" style="color:rgba(229,62,62,0.6)">DIF</span>
            </div>
          </div>

          <!-- Message -->
          <div id="form-message" class="font-body text-sm text-center" style="min-height:1.25rem"></div>

          <!-- Submit -->
          <button type="submit"
                  class="w-full py-3.5 rounded-xl flex items-center justify-center gap-2 font-display text-lg transition-all"
                  style="letter-spacing:0.12em; background:linear-gradient(135deg,#FFD700,#F0A500);
                         color:var(--color-bg-deep); border:none; cursor:pointer;
                         box-shadow:0 0 20px rgba(255,215,0,0.2)">
            AGGIUNGI GIOCATORE
          </button>
        </form>
      </div>
    `;
  }

  private renderPlayersList(players: IPlayer[]): string {
    const rows = players.map(p => this.renderPlayerRow(p)).join('');

    return `
      <div class="form-card glass-card rounded-xl overflow-hidden">
        <div class="px-4 md:px-5 py-3 flex items-center justify-between"
             style="background:rgba(10,25,18,0.8); border-bottom:1px solid var(--glass-border-gold)">
          <div class="flex items-center gap-2">
            <i data-lucide="users" style="width:14px;height:14px;color:var(--color-gold)"></i>
            <span class="font-ui" style="font-size:13px; color:var(--color-gold); letter-spacing:0.1em">
              GIOCATORI REGISTRATI
            </span>
          </div>
          <span class="font-ui" style="font-size:11px; color:rgba(255,255,255,0.4)">
            ${players.length} giocatori
          </span>
        </div>
        <div id="players-list" class="p-3 space-y-2 overflow-y-auto" style="max-height:600px">
          ${rows}
        </div>
      </div>
    `;
  }

  private renderPlayerRow(player: IPlayer): string {
    const color = CLASS_COLORS[player.class] ?? '#8B7D6B';
    const initials = getInitials(player.name);
    const elo = getDisplayElo(player);
    const className = player.class >= 0 ? getClassName(player.class) : 'Non classificato';
    const defPct = Math.round(player.defence * 100);

    return `
      <a href="/profile/${player.id}"
         class="player-row flex items-center justify-between p-2.5 md:p-3 rounded-lg hover:bg-white/5 transition-colors"
         style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06)">
        <div class="flex items-center gap-3 min-w-0">
          ${renderPlayerAvatar({ initials, color, size: 'sm', playerId: player.id, playerClass: player.class })}
          <div class="min-w-0">
            <div class="text-white font-ui text-sm truncate">${player.name}</div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="font-ui text-xs" style="color:${color}">${className}</span>
              <span style="color:rgba(255,255,255,0.2)">&middot;</span>
              <span class="font-ui text-xs" style="color:rgba(255,255,255,0.4)">
                DIF ${defPct}%
              </span>
            </div>
          </div>
        </div>
        <div class="text-right shrink-0 ml-2">
          <div class="font-display text-lg" style="color:var(--color-gold); line-height:1">${elo}</div>
          <div class="font-ui" style="font-size:10px; color:rgba(255,255,255,0.35)">ELO</div>
        </div>
      </a>
    `;
  }

  // ── Form Logic ─────────────────────────────────────────────

  private updateEloLabels(): void {
    for (const label of this.$$('.elo-label') as HTMLElement[]) {
      const input = label.querySelector<HTMLInputElement>('input[type="radio"]');
      if (!input) continue;
      const checked = input.checked;
      label.style.background = `rgba(255,215,0,${checked ? '0.15' : '0.05'})`;
      label.style.border = `1px solid rgba(255,215,0,${checked ? '0.4' : '0.15'})`;
      if (checked) {
        label.classList.add('ring-2', 'ring-(--color-gold)');
      } else {
        label.classList.remove('ring-2', 'ring-(--color-gold)');
      }
    }
  }

  private updateDefenceDisplay(): void {
    const slider = this.$id('player-defence') as HTMLInputElement | null;
    const display = this.$id('defence-display');
    if (slider && display) {
      display.textContent = `${slider.value}%`;
    }
  }

  private async handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const messageEl = this.$id('form-message');
    if (messageEl) messageEl.textContent = '';

    try {
      const name = (this.$id('player-name') as HTMLInputElement)?.value?.trim();
      if (!name) throw new Error('Inserisci un nome.');

      const eloRadio = document.querySelector<HTMLInputElement>('input[name="player-elo"]:checked');
      if (!eloRadio) throw new Error('Seleziona un ELO iniziale.');
      const elo = Number(eloRadio.value);

      const defenceSlider = this.$id('player-defence') as HTMLInputElement;
      const defence = Number(defenceSlider?.value ?? 50) / 100;

      const newPlayer = createPlayerDTO(name, elo, defence);
      await savePlayer(newPlayer);

      if (messageEl) {
        messageEl.style.color = 'var(--color-win)';
        messageEl.textContent = `${name} aggiunto con successo!`;
      }

      // Reset form
      const form = this.$('#add-player-form') as HTMLFormElement | null;
      form?.reset();
      this.updateDefenceDisplay();

      // Re-render players list
      const players = [...getAllPlayers()].sort((a, b) => a.name.localeCompare(b.name));
      const listEl = this.$('#players-list');
      if (listEl) {
        listEl.innerHTML = players.map(p => this.renderPlayerRow(p)).join('');
      }
    } catch (error) {
      console.error(error);
      if (messageEl) {
        messageEl.style.color = 'var(--color-loss)';
        messageEl.textContent = error instanceof Error ? error.message : 'Errore nel salvare.';
      }
    }
  }
}

export default AddPlayerPage;
