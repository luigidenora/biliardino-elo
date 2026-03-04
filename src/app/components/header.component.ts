/**
 * Header — Responsive navigation header with mobile menu.
 * Ported from Figma: Header.tsx
 *
 * La user pill (desktop) e l'avatar (mobile) aprono la UserDropdown
 * che gestisce identità, notifiche e login admin.
 */

import gsap from 'gsap';
import { LobbyService } from '../../services/lobby.service';
import { getPlayerById } from '../../services/player.service';
import { refreshIcons } from '../icons';
import { router } from '../router';
import { appState } from '../state';
import { bindHtml, rawHtml } from '../utils/html-template.util';
import { Component } from './component.base';
import template from './header.component.html?raw';
import { CLASS_COLORS, getInitials, renderPlayerAvatar } from './player-avatar.component';
import { userDropdown } from './user-dropdown.component';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Classifica', icon: 'trophy' },
  { path: '/matchmaking', label: 'Matchmaking', icon: 'swords', adminOnly: true },
  { path: '/lobby', label: 'Lobby', icon: 'users' },
  { path: '/stats', label: 'Stats', icon: 'bar-chart-3' },
  { path: '/add-match', label: 'Partita', icon: 'plus-circle', adminOnly: true },
  { path: '/add-player', label: 'Giocatore', icon: 'user-plus', adminOnly: true }
];

const LOBBY_POLL_MS = 50_000;

export class HeaderComponent extends Component {
  private adminActive = false;
  private menuOpen = false;
  private handleRouteChange: (() => void) | null = null;
  private handleLobbyChange: (() => void) | null = null;

  override render(): string {
    const currentPath = router.getCurrentPath();
    const playerName = appState.currentPlayerName ?? 'Guest';

    const playerId = appState.currentPlayerId ?? undefined;
    const player = playerId ? getPlayerById(playerId) : null;
    const initials = getInitials(player?.name ?? playerName) || 'G';
    const color = player ? (CLASS_COLORS[player.class] ?? '#E8A020') : '#E8A020';
    const avatarHtml = renderPlayerAvatar({ initials, color, size: 'xs', playerId: player?.id, playerClass: player?.class });

    return bindHtml(template)`${{
      desktopNav: rawHtml(this.renderDesktopNav(currentPath)),
      mobileNav: rawHtml(this.renderMobileNav(currentPath)),
      userAvatarDesktop: rawHtml(avatarHtml),
      userAvatarMobile: rawHtml(avatarHtml),
      userAvatarMobileMenu: rawHtml(avatarHtml),
      playerName
    }}`;
  }

  private renderDesktopNav(currentPath: string): string {
    return navItems.map((item) => {
      const isActive = this.isActive(item.path, currentPath);
      const hiddenClass = item.adminOnly ? 'data-admin-only' : '';
      return `
        <a
          href="${item.path}"
          ${hiddenClass}
          class="nav-link flex items-center gap-1.5 px-3 py-2 rounded-md transition-all duration-200 ${isActive
              ? 'text-(--color-gold) bg-[rgba(255,215,0,0.12)]'
              : 'text-white/90 hover:text-white hover:bg-white/8'
          }"
          style="font-family: var(--font-ui); font-size: 13px; letter-spacing: 0.08em"
        >
          <i data-lucide="${item.icon}" style="width:15px;height:15px"></i>
          ${item.label}
        </a>
      `;
    }).join('');
  }

  private renderMobileNav(currentPath: string): string {
    return navItems.map((item) => {
      const isActive = this.isActive(item.path, currentPath);
      const hiddenAttr = item.adminOnly ? 'data-admin-only' : '';
      return `
        <a
          href="${item.path}"
          ${hiddenAttr}
          class="mobile-nav-link flex items-center gap-3 px-4 py-3.5 rounded-lg transition-all duration-200 ${isActive
              ? 'text-(--color-gold) bg-[rgba(255,215,0,0.12)]'
              : 'text-white/70 hover:text-white hover:bg-white/6'
          }"
          style="font-family: var(--font-ui); font-size: 15px; letter-spacing: 0.08em"
        >
          <i data-lucide="${item.icon}" style="width:18px;height:18px"></i>
          ${item.label}
          ${isActive ? '<div class="ml-auto w-1.5 h-1.5 rounded-full bg-(--color-gold)"></div>' : ''}
        </a>
      `;
    }).join('');
  }

  override mount(): void {
    refreshIcons();
    // Gestione visibilità admin
    this.updateAdminVisibility();
    window.addEventListener('user-dropdown:login-success', this._onAdminLoginSuccess);
    window.addEventListener('user-dropdown:logout', this._onAdminLogout);

    /* ── User pill / avatar → open dropdown ─── */
    document.getElementById('user-pill')?.addEventListener('click', () => userDropdown.toggle());
    document.getElementById('user-pill-mobile')?.addEventListener('click', () => {
      userDropdown.toggle();
    });
    document.getElementById('mobile-menu-user')?.addEventListener('click', () => {
      /* Close mobile nav first, then open dropdown */
      const mobileMenu = document.getElementById('mobile-menu');
      if (mobileMenu) {
        this.menuOpen = false;
        mobileMenu.style.display = 'none';
        const iconOpen = document.getElementById('menu-icon-open');
        const iconClose = document.getElementById('menu-icon-close');
        if (iconOpen) iconOpen.style.display = 'block';
        if (iconClose) iconClose.style.display = 'none';
      }
      setTimeout(() => userDropdown.open(), 50);
    });

    /* ── Mobile hamburger ─── */
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const iconOpen = document.getElementById('menu-icon-open');
    const iconClose = document.getElementById('menu-icon-close');

    toggleBtn?.addEventListener('click', () => {
      this.menuOpen = !this.menuOpen;
      if (this.menuOpen && mobileMenu) {
        mobileMenu.style.display = 'block';
        gsap.fromTo(mobileMenu, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.18 });
        if (iconOpen) iconOpen.style.display = 'none';
        if (iconClose) iconClose.style.display = 'block';
      } else if (mobileMenu) {
        gsap.to(mobileMenu, {
          opacity: 0, y: -10, duration: 0.15,
          onComplete: () => { mobileMenu.style.display = 'none'; }
        });
        if (iconOpen) iconOpen.style.display = 'block';
        if (iconClose) iconClose.style.display = 'none';
      }
    });

    mobileMenu?.querySelectorAll('.mobile-nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        this.menuOpen = false;
        if (mobileMenu) mobileMenu.style.display = 'none';
        if (iconOpen) iconOpen.style.display = 'block';
        if (iconClose) iconClose.style.display = 'none';
      });
    });

    /* ── Active state on route change ─── */
    this.handleRouteChange = () => this.updateActiveStates();
    window.addEventListener('popstate', this.handleRouteChange);
    appState.on('route-change', this.handleRouteChange);

    /* ── Lobby active indicator ─── */
    this.handleLobbyChange = () => this.updateLobbyIndicator();
    appState.on('lobby-change', this.handleLobbyChange);
    // Initialize LobbyService (lazy — first consumer triggers WS + fetch)
    LobbyService.init().then(() => this.updateLobbyIndicator());
  }

  override destroy(): void {
    if (this.handleRouteChange) {
      window.removeEventListener('popstate', this.handleRouteChange);
      appState.off('route-change', this.handleRouteChange);
    }
    window.removeEventListener('user-dropdown:login-success', this._onAdminLoginSuccess);
    window.removeEventListener('user-dropdown:logout', this._onAdminLogout);

    if (this.handleLobbyChange) {
      appState.off('lobby-change', this.handleLobbyChange);
    }
    LobbyService.release();
  }

  private updateAdminVisibility(): void {
    document.querySelectorAll('[data-admin-only]').forEach((el) => {
      (el as HTMLElement).style.display = this.adminActive ? '' : 'none';
    });
  }

  // Event handler per login/logout admin
  private _onAdminLoginSuccess = (): void => {
    this.updateAdminVisibility();
  };

  private _onAdminLogout = (): void => {
    this.updateAdminVisibility();
  };

  private updateActiveStates(): void {
    const currentPath = router.getCurrentPath();
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      const isActive = this.isActive(href, currentPath);
      const isMobile = link.classList.contains('mobile-nav-link');
      const inactiveTextClass = isMobile ? 'text-white/70' : 'text-white/90';

      link.classList.toggle('text-(--color-gold)', isActive);
      link.classList.toggle('bg-[rgba(255,215,0,0.12)]', isActive);
      link.classList.toggle(inactiveTextClass, !isActive);

      // Remove conflicting text class
      if (isActive) {
        link.classList.remove(inactiveTextClass);
      } else {
        link.classList.remove('text-(--color-gold)');
      }

      // Update active dot for mobile
      if (isMobile) {
        const dot = link.querySelector('.bg-\\(--color-gold\\)');
        if (isActive && !dot) {
          link.insertAdjacentHTML('beforeend', '<div class="ml-auto w-1.5 h-1.5 rounded-full bg-(--color-gold)"></div>');
        } else if (!isActive && dot) {
          dot.remove();
        }
      }
    });
  }

  private isActive(itemPath: string, currentPath: string): boolean {
    if (itemPath === '/') return currentPath === '/';
    return currentPath.startsWith(itemPath);
  }

  // ── Lobby active indicator ──────────────────────────────────

  private updateLobbyIndicator(): void {
    const header = document.getElementById('app-header-inner');
    const goldLine = header?.querySelector('.gold-line');

    // Toggle header glow
    header?.classList.toggle('lobby-active', appState.lobbyActive);
    goldLine?.classList.toggle('lobby-active-line', appState.lobbyActive);

    // Toggle pulsing dots on lobby nav links
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach((link) => {
      const href = link.getAttribute('href');
      if (href !== '/lobby') return;

      const existing = link.querySelector('.lobby-live-dot');
      if (appState.lobbyActive && !existing) {
        const dot = document.createElement('span');
        dot.className = 'lobby-live-dot';
        link.appendChild(dot);
      } else if (!appState.lobbyActive && existing) {
        existing.remove();
      }
    });
  }
}
