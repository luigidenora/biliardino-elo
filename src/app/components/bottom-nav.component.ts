/**
 * BottomNavComponent — Sticky bottom tab bar for mobile navigation.
 *
 * Primary tabs (Classifica, Lobby, Stats) are always visible.
 * "Menu" tab appears only when the user is admin — it opens the
 * MobileDrawerComponent to access admin-only pages.
 * Hidden entirely on md+ breakpoint via Tailwind's md:hidden class.
 */

import { refreshIcons } from '../icons';
import { router } from '../router';
import { appState } from '../state';
import { html, rawHtml } from '../utils/html-template.util';
import template from './bottom-nav.component.html?raw';
import { mobileDrawer } from './mobile-drawer.component';

interface TabItem {
  icon: string;
  label: string;
  path: string | null;
  id: string;
  adminOnly?: boolean;
}

const TABS: TabItem[] = [
  { icon: 'trophy', label: 'Classifica', path: '/', id: 'tab-classifica' },
  { icon: 'users', label: 'Lobby', path: '/lobby', id: 'tab-lobby' },
  { icon: 'bar-chart-3', label: 'Stats', path: '/stats', id: 'tab-stats' },
  { icon: 'menu', label: 'Menu', path: null, id: 'tab-menu', adminOnly: true },
];

class BottomNavComponent {
  private navEl: HTMLElement | null = null;
  private handleRouteChange: (() => void) | null = null;
  private onAdminChange: (() => void) | null = null;

  /* ── Mount / Destroy ─────────────────────────────────────── */

  mount(): void {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html(template, {
      tabs: rawHtml(this.renderTabs(router.getCurrentPath())),
    });
    document.body.appendChild(wrapper.firstElementChild!);
    this.navEl = document.getElementById('bottom-nav');

    refreshIcons();
    this.bindClicks();
    this.updateMenuVisibility();

    this.handleRouteChange = () => this.updateActiveStates();
    appState.on('route-change', this.handleRouteChange);
    window.addEventListener('popstate', this.handleRouteChange);

    this.onAdminChange = () => this.updateMenuVisibility();
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
    this.navEl?.remove();
  }

  /* ── Private ─────────────────────────────────────────────── */

  private renderTabs(currentPath: string): string {
    return TABS.map(tab => {
      const isActive = tab.path !== null && (
        tab.path === '/' ? currentPath === '/' : currentPath.startsWith(tab.path)
      );
      return `
        <button id="${tab.id}"
          class="relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${isActive ? 'text-(--color-gold)' : 'text-white/40 hover:text-white/70'}"
          style="font-family:var(--font-ui);font-size:9px;letter-spacing:0.08em${tab.adminOnly ? ';display:none' : ''}">
          ${isActive ? '<div class="bottom-tab-indicator"></div>' : ''}
          <i data-lucide="${tab.icon}" style="width:20px;height:20px"></i>
          <span>${tab.label.toUpperCase()}</span>
        </button>
      `;
    }).join('');
  }

  private bindClicks(): void {
    TABS.forEach(tab => {
      document.getElementById(tab.id)?.addEventListener('click', () => {
        if (tab.path === null) {
          mobileDrawer.toggle();
        } else {
          router.navigate(tab.path);
        }
      });
    });
  }

  private updateActiveStates(): void {
    const currentPath = router.getCurrentPath();
    TABS.filter(tab => !tab.adminOnly).forEach(tab => {
      const btn = document.getElementById(tab.id);
      if (!btn) return;
      const isActive = tab.path !== null && (
        tab.path === '/' ? currentPath === '/' : currentPath.startsWith(tab.path)
      );
      btn.classList.toggle('text-(--color-gold)', isActive);
      btn.classList.toggle('text-white/40', !isActive);

      const indicator = btn.querySelector('.bottom-tab-indicator');
      if (isActive && !indicator) {
        btn.insertAdjacentHTML('afterbegin', '<div class="bottom-tab-indicator"></div>');
      } else if (!isActive && indicator) {
        indicator.remove();
      }
    });
  }

  private updateMenuVisibility(): void {
    const menuBtn = document.getElementById('tab-menu');
    if (!menuBtn) return;
    menuBtn.style.display = appState.isAdmin ? '' : 'none';
  }
}

export const bottomNav = new BottomNavComponent();
