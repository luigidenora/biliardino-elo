/**
 * MobileDrawerComponent — Bottom-sheet navigation drawer for mobile.
 *
 * Slides up from the bottom, replacing the old hamburger dropdown.
 * Contains: user identity strip (tap → opens userDropdown),
 * and navigation links for all pages.
 *
 * Opened by the "Menu" tab in BottomNavComponent.
 */

import { getPlayerById } from '@/services/player.service';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import haptics from '@/utils/haptics.util';
import gsap from 'gsap';
import { refreshIcons } from '../icons';
import { router } from '../router';
import { appState } from '../state';
import { html, rawHtml } from '../utils/html-template.util';
import template from './mobile-drawer.component.html?raw';
import { CLASS_COLORS, getInitials, renderPlayerAvatar } from './player-avatar.component';
import { userDropdown } from './user-dropdown.component';

const PLAYER_ID_KEY = 'biliardino_player_id';
const PLAYER_NAME_KEY = 'biliardino_player_name';

interface DrawerNavItem {
  path: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: DrawerNavItem[] = [
  { path: '/matchmaking', label: 'Matchmaking', icon: 'swords', adminOnly: true },
  { path: '/add-match', label: 'Aggiungi Partita', icon: 'plus-circle', adminOnly: true },
  { path: '/add-player', label: 'Aggiungi Giocatore', icon: 'user-plus', adminOnly: true }
];

class MobileDrawerComponent {
  private drawerEl: HTMLElement | null = null;
  private backdropEl: HTMLElement | null = null;
  private isOpen = false;
  private handleRouteChange: (() => void) | null = null;
  private onAdminChange: (() => void) | null = null;

  /* ── Mount / Destroy ─────────────────────────────────────── */

  mount(): void {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html(template, {
      userAvatar: rawHtml(this.buildUserAvatar()),
      playerName: this.getPlayerName(),
      playerElo: this.getPlayerEloLabel(),
      navLinks: rawHtml(this.renderNavLinks())
    });
    // template produces backdrop + drawer as two sibling root elements
    while (wrapper.firstChild) {
      document.body.appendChild(wrapper.firstChild);
    }

    this.backdropEl = document.getElementById('mobile-drawer-backdrop');
    this.drawerEl = document.getElementById('mobile-drawer');

    refreshIcons();
    this.updateAdminVisibility();

    this.backdropEl?.addEventListener('click', () => this.close());

    document.getElementById('drawer-user-strip')?.addEventListener('click', () => {
      haptics.trigger('selection');
      this.close();
      setTimeout(() => userDropdown.open(), 260);
    });

    this.drawerEl?.querySelectorAll<HTMLElement>('[data-drawer-link]').forEach((link) => {
      link.addEventListener('click', () => {
        haptics.trigger('selection');
        this.close();
      });
    });

    this.handleRouteChange = () => {
      this.updateActiveStates();
      if (this.isOpen) this.close();
    };
    appState.on('route-change', this.handleRouteChange);
    window.addEventListener('popstate', this.handleRouteChange);

    this.onAdminChange = () => this.updateAdminVisibility();
    window.addEventListener('user-dropdown:login-success', this.onAdminChange);
    window.addEventListener('user-dropdown:logout', this.onAdminChange);
  }

  destroy(): void {
    if (this.handleRouteChange) {
      appState.off('route-change', this.handleRouteChange);
      window.removeEventListener('popstate', this.handleRouteChange);
    }
    if (this.onAdminChange) {
      window.removeEventListener('user-dropdown:login-success', this.onAdminChange);
      window.removeEventListener('user-dropdown:logout', this.onAdminChange);
    }
    this.drawerEl?.remove();
    this.backdropEl?.remove();
  }

  /* ── Toggle / Open / Close ───────────────────────────────── */

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (!this.drawerEl || !this.backdropEl) return;
    this.isOpen = true;
    this.refreshUserStrip();
    this.updateActiveStates();

    gsap.set(this.backdropEl, { display: 'block', opacity: 0 });
    gsap.set(this.drawerEl, { display: 'block', y: '100%' });
    gsap.to(this.backdropEl, { opacity: 1, duration: 0.25 });
    gsap.to(this.drawerEl, { y: 0, duration: 0.32, ease: 'power3.out' });
    refreshIcons();
  }

  close(): void {
    if (!this.drawerEl || !this.backdropEl || !this.isOpen) return;
    this.isOpen = false;
    gsap.to(this.drawerEl, {
      y: '100%', duration: 0.26, ease: 'power2.in',
      onComplete: () => { if (this.drawerEl) this.drawerEl.style.display = 'none'; }
    });
    gsap.to(this.backdropEl, {
      opacity: 0, duration: 0.22,
      onComplete: () => { if (this.backdropEl) this.backdropEl.style.display = 'none'; }
    });
  }

  /* ── Private helpers ─────────────────────────────────────── */

  private getPlayerName(): string {
    const id = Number(localStorage.getItem(PLAYER_ID_KEY) ?? 0);
    const player = id ? getPlayerById(id) : null;
    return player?.name ?? localStorage.getItem(PLAYER_NAME_KEY) ?? '💀';
  }

  private getPlayerEloLabel(): string {
    const id = Number(localStorage.getItem(PLAYER_ID_KEY) ?? 0);
    const player = id ? getPlayerById(id) : null;
    if (!player) return 'Seleziona il tuo player';
    return `${getDisplayElo(player)} ELO · ${getClassName(player.class[player.bestRole])}`;
  }

  private buildUserAvatar(): string {
    const id = Number(localStorage.getItem(PLAYER_ID_KEY) ?? 0);
    const player = id ? getPlayerById(id) : null;
    const name = player?.name ?? localStorage.getItem(PLAYER_NAME_KEY) ?? '💀';
    const color = player ? (CLASS_COLORS[player.class[player.bestRole]] ?? '#E8A020') : '#E8A020';
    return renderPlayerAvatar({
      initials: getInitials(name) || '💀',
      color,
      size: 'sm',
      playerId: player?.id,
      playerClass: player ? player.class[player.bestRole] : undefined
    });
  }

  private renderNavLinks(): string {
    const currentPath = router.getCurrentPath();
    return NAV_ITEMS.map((item) => {
      const isActive = item.path === '/' ? currentPath === '/' : currentPath.startsWith(item.path);
      return `
        <a href="${item.path}" data-drawer-link
           ${item.adminOnly ? 'data-admin-only style="display:none"' : ''}
           class="group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${isActive
              ? 'text-(--color-gold) bg-[rgba(255,215,0,0.1)]'
              : 'text-[#9ca19f] hover:text-white hover:bg-white/6'}"
           style="font-family:var(--font-ui);font-size:14px;letter-spacing:0.07em">
          <i data-lucide="${item.icon}" style="width:18px;height:18px"></i>
          ${item.label}
          ${isActive ? '<div class="ml-auto w-1.5 h-1.5 rounded-full bg-(--color-gold)"></div>' : ''}
        </a>
      `;
    }).join('');
  }

  private refreshUserStrip(): void {
    const avatarEl = document.getElementById('drawer-user-avatar');
    if (avatarEl) avatarEl.innerHTML = this.buildUserAvatar();
    const nameEl = this.drawerEl?.querySelector('[data-drawer-user-name]');
    if (nameEl) nameEl.textContent = this.getPlayerName();
  }

  private updateActiveStates(): void {
    const currentPath = router.getCurrentPath();
    this.drawerEl?.querySelectorAll<HTMLElement>('a[href]').forEach((link) => {
      const path = link.getAttribute('href') ?? '';
      const isActive = path === '/' ? currentPath === '/' : currentPath.startsWith(path);
      link.classList.toggle('text-(--color-gold)', isActive);
      link.classList.toggle('bg-[rgba(255,215,0,0.1)]', isActive);
      link.classList.toggle('text-[#9ca19f]', !isActive);

      const dot = link.querySelector<HTMLElement>('.bg-\\(--color-gold\\)');
      if (isActive && !dot) {
        link.insertAdjacentHTML('beforeend', '<div class="ml-auto w-1.5 h-1.5 rounded-full bg-(--color-gold)"></div>');
      } else if (!isActive && dot) {
        dot.remove();
      }
    });
  }

  private updateAdminVisibility(): void {
    this.drawerEl?.querySelectorAll<HTMLElement>('[data-admin-only]').forEach((el) => {
      el.style.display = appState.isAdmin ? '' : 'none';
    });
  }
}

export const mobileDrawer = new MobileDrawerComponent();
