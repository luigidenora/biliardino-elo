/**
 * History-based SPA router with lazy loading and auth guards.
 *
 * Routes use clean paths (e.g. /profile/5)
 * Each page component is loaded via dynamic import() for code splitting.
 */

import gsap from 'gsap';
import { Component } from './components/component.base';
import { appState } from './state';
import errorTemplate from './templates/router-error.html?raw';
import { html } from './utils/html-template.util';

// ── Route definition ──────────────────────────────────────

interface RouteDefinition {
  /** Path pattern, e.g. '/profile/:id'. Leading slash required. */
  path: string;
  /** Lazy loader that returns a module with a default export of a Component class. */
  load: () => Promise<{ default: new () => Component }>;
  /** Page title suffix (appended to "CAlcio biliardino"). */
  title: string;
  /** Requires Firebase auth. */
  requireAuth?: boolean;
  /** Requires admin role (implies requireAuth). */
  requireAdmin?: boolean;
}

interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
}

// ── Route table ───────────────────────────────────────────

const routes: RouteDefinition[] = [
  {
    path: '/',
    load: () => import('./pages/leaderboard.page'),
    title: 'Classifica'
  },
  {
    path: '/profile/:id',
    load: () => import('./pages/player-profile.page'),
    title: 'Profilo'
  },
  {
    path: '/matchmaking',
    load: () => import('./pages/matchmaking.page'),
    title: 'Matchmaking',
    requireAdmin: true
  },
  {
    path: '/stats',
    load: () => import('./pages/stats.page'),
    title: 'Statistiche'
  },
  {
    path: '/lobby',
    load: () => import('./pages/lobby.page'),
    title: 'Lobby'
  },
  {
    path: '/add-match',
    load: () => import('./pages/add-match.page'),
    title: 'Aggiungi Partita',
    requireAdmin: true
  },
  {
    path: '/add-player',
    load: () => import('./pages/add-player.page'),
    title: 'Aggiungi Giocatore',
    requireAdmin: true
  }
];

// ── Router class ──────────────────────────────────────────

class Router {
  private currentComponent: Component | null = null;
  private contentEl: HTMLElement | null = null;
  private transitioning = false;

  /**
   * Initialize the router: normalize legacy hash URLs and bind popstate + link interception.
   */
  init(): void {
    this.contentEl = document.getElementById('app-content');
    if (!this.contentEl) {
      throw new Error('Router: #app-content element not found');
    }

    this.normalizeLegacyHashUrl();

    window.addEventListener('popstate', () => this.onPathChange());
    window.addEventListener('hashchange', () => {
      this.normalizeLegacyHashUrl();
      void this.onPathChange();
    });
    document.addEventListener('click', event => this.onDocumentClick(event));

    // Initial navigation
    this.onPathChange();
  }

  /**
   * Programmatic navigation.
   */
  navigate(path: string): void {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const targetUrl = normalizedPath;

    if (window.location.pathname === normalizedPath) {
      void this.onPathChange();
      return;
    }

    window.history.pushState(null, '', targetUrl);
    void this.onPathChange();
  }

  /**
   * Get the current path from the browser location.
   */
  getCurrentPath(): string {
    return window.location.pathname || '/';
  }

  // ── Internals ─────────────────────────────────────────────

  private async onPathChange(): Promise<void> {
    if (this.transitioning) return;

    const path = this.getCurrentPath();
    const match = this.matchRoute(path);

    if (!match) {
      // 404: redirect to leaderboard
      this.navigate('/');
      return;
    }

    // Auth guard
    if (match.route.requireAdmin || match.route.requireAuth) {
      const authorized = await this.checkAuth(match.route.requireAdmin ?? false);
      if (!authorized) return;
    }

    await this.renderRoute(match);
  }

  private normalizeLegacyHashUrl(): void {
    const hash = window.location.hash;
    if (!hash.startsWith('#/')) return;

    const path = hash.slice(1);
    window.history.replaceState(null, '', path);
  }

  private onDocumentClick(event: MouseEvent): void {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a') as HTMLAnchorElement | null;
    if (!anchor) return;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.hasAttribute('download')) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    if (href.startsWith('#/')) {
      event.preventDefault();
      this.navigate(href.slice(1));
      return;
    }

    if (!href.startsWith('/')) return;
    if (anchor.origin !== window.location.origin) return;

    event.preventDefault();
    this.navigate(href);
  }

  private matchRoute(path: string): RouteMatch | null {
    for (const route of routes) {
      const params = this.matchPath(route.path, path);
      if (params !== null) {
        return { route, params };
      }
    }
    return null;
  }

  /**
   * Match a route pattern against a path. Returns params or null.
   * Supports :param segments (e.g. '/profile/:id' matches '/profile/5').
   */
  private matchPath(pattern: string, path: string): Record<string, string> | null {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) return null;

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }

    return params;
  }

  private async checkAuth(requireAdmin: boolean): Promise<boolean> {
    try {
      const { withAuthentication } = await import('@/utils/auth.util');
      return new Promise<boolean>((resolve) => {
        withAuthentication(
          () => {
            appState.isAuthenticated = true;
            if (requireAdmin) appState.isAdmin = true;
            resolve(true);
          },
          requireAdmin
        );
      });
    } catch {
      this.navigate('/');
      return false;
    }
  }

  private async renderRoute(match: RouteMatch): Promise<void> {
    this.transitioning = true;

    try {
      // 1. Destroy previous component
      if (this.currentComponent) {
        this.currentComponent.destroy();
      }

      // 2. Fade out current content
      if (this.contentEl && this.contentEl.children.length > 0) {
        await gsap.to(this.contentEl, { opacity: 0, y: -10, duration: 0.15, ease: 'power2.in' });
      }

      // 3. Load and instantiate new component
      const module = await match.route.load();
      const PageComponent = module.default;
      const component = new PageComponent();
      component.setParams(match.params);

      // 4. Render HTML
      const renderHtml = await component.render();
      if (this.contentEl) {
        this.contentEl.innerHTML = renderHtml;
        this.contentEl.style.opacity = '0';
        this.contentEl.style.transform = 'translateY(10px)';
      }

      // 5. Mount (bind events)
      component.setElement(this.contentEl);
      component.mount();
      this.currentComponent = component;

      // 6. Update page title
      document.title = `${match.route.title} — CAlcio biliardino`;

      // 7. Fade in
      if (this.contentEl) {
        gsap.to(this.contentEl, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
      }

      // 8. Notify state
      appState.emit('route-change', match.route.path);
    } catch (error) {
      console.error('[Router] Error rendering route:', error);
      if (this.contentEl) {
        this.contentEl.innerHTML = html(errorTemplate);
        this.contentEl.style.opacity = '1';
        this.contentEl.style.transform = '';
      }
    } finally {
      this.transitioning = false;
    }
  }
}

export const router = new Router();
