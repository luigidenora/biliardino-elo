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
import { renderRoleBadge } from '../components/role-badge.component';
import { refreshIcons } from '../icons';

import type { IPlayer } from '@/models/player.interface';

const ROLE_OPTIONS = [
  { value: '-1', icon: 'shield', label: 'DIFENSORE', color: '#60a5fa', bg: '96,165,250' },
  { value: '0', icon: 'scale', label: 'ENTRAMBI', color: '#FFD700', bg: '255,215,0' },
  { value: '1', icon: 'sword', label: 'ATTACCANTE', color: '#f87171', bg: '248,113,113' }
] as const;

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

    // Bind role radio buttons to update visual state on selection
    for (const radio of this.$$('input[name="player-role"]') as HTMLInputElement[]) {
      radio.addEventListener('change', () => this.updateRoleLabels());
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

          <!-- Role -->
          <div>
            <label class="font-ui text-xs block mb-2" style="color:rgba(255,255,255,0.5); letter-spacing:0.1em">
              RUOLO
            </label>
            <div class="grid grid-cols-3 gap-2">
              ${ROLE_OPTIONS.map(r => `
                <label class="role-label flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg cursor-pointer transition-all"
                       style="background:rgba(${r.bg},${r.value === '0' ? '0.15' : '0.05'});
                              border:1px solid rgba(${r.bg},${r.value === '0' ? '0.4' : '0.15'});
                              box-shadow:${r.value === '0' ? `0 0 0 2px ${r.color}` : 'none'}">
                  <input type="radio" name="player-role" value="${r.value}"
                         ${r.value === '0' ? 'checked' : ''}
                         class="sr-only" />
                  <i data-lucide="${r.icon}" style="width:16px;height:16px;color:${r.color}"></i>
                  <span class="font-ui text-[9px]" style="color:${r.color}; letter-spacing:0.08em">${r.label}</span>
                </label>
              `).join('')}
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
    const classIdx = Array.isArray(player.class) ? player.class[2] ?? player.class[0] : player.class as number;
    const color = CLASS_COLORS[classIdx] ?? '#8B7D6B';
    const initials = getInitials(player.name);
    const elo = getDisplayElo(player);
    const className = classIdx >= 0 ? getClassName(classIdx) : 'Non classificato';
    const roleBadge = renderRoleBadge({ playerRole: player.role, size: 'sm' });

    return `
      <a href="/profile/${player.id}"
         class="player-row flex items-center justify-between p-2.5 md:p-3 rounded-lg hover:bg-white/5 transition-colors"
         style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06)">
        <div class="flex items-center gap-3 min-w-0">
          ${renderPlayerAvatar({ initials, color, size: 'sm', playerId: player.id, playerClass: classIdx })}
          <div class="min-w-0">
            <div class="text-white font-ui text-sm truncate">${player.name}</div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="font-ui text-xs" style="color:${color}">${className}</span>
              <span style="color:rgba(255,255,255,0.2)">&middot;</span>
              ${roleBadge}
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

  private updateRoleLabels(): void {
    for (const label of this.$$('.role-label') as HTMLElement[]) {
      const input = label.querySelector<HTMLInputElement>('input[type="radio"]');
      if (!input) continue;
      const checked = input.checked;
      const cfg = ROLE_OPTIONS.find(r => r.value === input.value);
      if (!cfg) continue;
      label.style.background = `rgba(${cfg.bg},${checked ? '0.15' : '0.05'})`;
      label.style.border = `1px solid rgba(${cfg.bg},${checked ? '0.4' : '0.15'})`;
      label.style.boxShadow = checked ? `0 0 0 2px ${cfg.color}` : 'none';
    }
  }

  private async handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const messageEl = this.$id('form-message');
    if (messageEl) messageEl.textContent = '';

    try {
      const name = (this.$id('player-name') as HTMLInputElement)?.value?.trim();
      if (!name) throw new Error('Inserisci un nome.');

      const roleRadio = this.$$('input[name="player-role"]').find(el => (el as HTMLInputElement).checked) as HTMLInputElement | undefined;
      if (!roleRadio) throw new Error('Seleziona un ruolo.');
      const role = Number(roleRadio.value) as -1 | 0 | 1;

      const newPlayer = createPlayerDTO(name, role);
      await savePlayer(newPlayer);

      if (messageEl) {
        messageEl.style.color = 'var(--color-win)';
        messageEl.textContent = `${name} aggiunto con successo!`;
      }

      // Reset form
      const form = this.$('#add-player-form') as HTMLFormElement | null;
      form?.reset();
      this.updateRoleLabels();

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
