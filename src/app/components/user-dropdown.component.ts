/**
 * UserDropdownComponent — Pannello utente unificato.
 *
 * Si apre dal click sul user-pill nell'header (desktop e mobile).
 * Gestisce in un'unica dropdown:
 *   1. Identità giocatore  — scelta/cambio da localStorage, no BE call
 *   2. Notifiche push      — stato da localStorage + PushManager async; 1 POST/DELETE al BE
 *   3. Accesso Admin       — form inline Firebase, animazione GSAP
 *
 * Events emessi su window:
 *   'user-dropdown:login-success'  dopo login admin riuscito
 *   'user-dropdown:login-cancel'   dopo chiusura senza login
 *
 * Events ascoltati su window:
 *   'user-dropdown:open-login'     apre il pannello con il form admin espanso
 */

import { API_BASE_URL, VAPID_PUBLIC_KEY } from '@/config/env.config';
import { subscribeToPushNotifications } from '@/notifications';
import { getAllPlayers, getPlayerById } from '@/services/player.service';
import { AUTH } from '@/utils/firebase.util';
import { getClassName } from '@/utils/get-class-name.util';
import { getDisplayElo } from '@/utils/get-display-elo.util';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import gsap from 'gsap';
import { html, rawHtml } from '../utils/html-template.util';
import { CLASS_COLORS, getInitials, renderPlayerAvatar } from './player-avatar.component';
import skeletonTemplate from './user-dropdown-skeleton.component.html?raw';
import panelTemplate from './user-dropdown.component.html?raw';

/* ── Keys localStorage ─────────────────────────────────────── */
const PLAYER_ID_KEY = 'biliardino_player_id';
const PLAYER_NAME_KEY = 'biliardino_player_name';
const SUBSCRIPTION_KEY = 'biliardino_subscription';
const SUBSCRIPTION_VERIFIED_KEY = 'biliardino_subscription_verified';
const ADMIN_TOKEN_KEY = 'biliardino_admin_token';

/* ── Stato notifiche ───────────────────────────────────────── */
type NotifState
  = | 'checking'
    | 'unsupported'
    | 'blocked'
    | 'no-player'
    | 'inactive'
    | 'active'
    | 'active-unverified'
    | 'loading'
    | 'error';

const NOTIF_DOT: Record<NotifState, string | null> = {
  checking: '#60A5FA',
  unsupported: null,
  blocked: '#EF4444',
  'no-player': null,
  inactive: '#6B7280',
  active: '#4ADE80',
  'active-unverified': '#F59E0B',
  loading: '#60A5FA',
  error: '#EF4444'
};

/* ── SVG inline icons ──────────────────────────────────────── */
const BELL_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
const BELL_OFF_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.9 17.9 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" x2="23" y1="1" y2="23"/></svg>`;
const CHECK_CIRCLE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;
const ALERT_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;
const LOCK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const SPINNER_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
const USER_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`;
const SHIELD_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

/* ── Component ─────────────────────────────────────────────── */
class UserDropdownComponent {
  private panelEl: HTMLElement | null = null;
  private backdropEl: HTMLElement | null = null;
  private isOpen = false;
  private notifState: NotifState = 'checking';
  private isAuthenticated = false;
  private isLoadingNotif = false;
  private showingPlayerList = false;
  private showingAdminTokenForm = false;
  private loginError = '';
  private adminTokenFeedback = '';

  private authUnsubscribe: (() => void) | null = null;
  private onEsc: ((e: KeyboardEvent) => void) | null = null;
  private onOpenLogin: (() => void) | null = null;

  /* ── Mount / Destroy ───────────────────────────────────────── */

  mount(): void {
    /* Panel */
    this.panelEl = document.createElement('div');
    this.panelEl.id = 'user-dropdown-panel';
    this.panelEl.className = [
      'fixed left-3 right-3',
      'md:left-auto md:right-4 md:w-80',
      'top-14 md:top-16',
      'z-[99]'
    ].join(' ');
    this.panelEl.style.cssText = [
      'display:none',
      'background:var(--color-bg-overlay)',
      'border:1px solid rgba(255,215,0,0.22)',
      'border-radius:16px',
      'box-shadow:0 24px 64px rgba(0,0,0,0.7),0 4px 20px rgba(255,215,0,0.1)',
      'backdrop-filter:blur(24px)',
      'overflow:hidden'
    ].join(';');
    this.panelEl.innerHTML = this.renderPanelSkeleton();
    document.body.appendChild(this.panelEl);

    /* Backdrop */
    this.backdropEl = document.createElement('div');
    this.backdropEl.id = 'user-dropdown-backdrop';
    this.backdropEl.style.cssText = 'display:none;position:fixed;inset:0;z-index:98';
    this.backdropEl.addEventListener('click', () => this.close());
    document.body.appendChild(this.backdropEl);

    /* Event delegation on panel */
    this.panelEl.addEventListener('click', e => this.handleClick(e));
    this.panelEl.addEventListener('submit', e => this.handleSubmit(e));

    /* Keyboard */
    this.onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.isOpen) this.close(); };
    document.addEventListener('keydown', this.onEsc);

    /* External trigger (from auth.util.ts promptLogin) */
    this.onOpenLogin = () => this.open(true);
    window.addEventListener('user-dropdown:open-login', this.onOpenLogin);

    /* Firebase auth state */
    this.authUnsubscribe = onAuthStateChanged(AUTH, (user) => {
      this.isAuthenticated = !!user;
      if (this.isOpen) this.updateAdminSection();
      this.updateHeader();
    }) as unknown as () => void;

    /* Initial pill dot from localStorage */
    this.notifState = this.getQuickNotifState();
    this.updatePillDot();

    /* Re-render header avatar once player data is available */
    this.updateHeader();
  }

  destroy(): void {
    if (this.onEsc) document.removeEventListener('keydown', this.onEsc);
    if (this.onOpenLogin) window.removeEventListener('user-dropdown:open-login', this.onOpenLogin);
    if (this.authUnsubscribe) this.authUnsubscribe();
    this.panelEl?.remove();
    this.backdropEl?.remove();
  }

  /* ── Toggle / Open / Close ─────────────────────────────────── */

  toggle(): void {
    if (this.isOpen) this.close(); else this.open();
  }

  open(showLogin = false): void {
    if (!this.panelEl || !this.backdropEl) return;
    this.isOpen = true;
    this.showingPlayerList = false;
    this.showingAdminTokenForm = false;
    this.loginError = '';

    /* Align panel to the user-pill on desktop */
    const pill = document.getElementById('user-pill');
    if (pill && window.innerWidth >= 768) {
      const pillRect = pill.getBoundingClientRect();
      this.panelEl.style.right = `${window.innerWidth - pillRect.right}px`;
      this.panelEl.style.left = 'auto';
    } else {
      this.panelEl.style.right = '';
      this.panelEl.style.left = '';
    }

    /* Render fresh content */
    this.panelEl.innerHTML = this.renderPanelContent();

    /* Show + animate */
    this.backdropEl.style.display = 'block';
    gsap.fromTo(
      this.panelEl,
      { display: 'block', opacity: 0, y: -10, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'power3.out' }
    );
    gsap.to('#user-pill-chevron, #user-pill-chevron-mobile', {
      rotation: 180, duration: 0.22, ease: 'power2.out'
    });

    /* Async PushManager check */
    void this.checkNotifStateAsync();

    /* Auto-open login form */
    if (showLogin) {
      setTimeout(() => this.expandLoginForm(), 280);
    }
  }

  close(): void {
    if (!this.panelEl || !this.backdropEl || !this.isOpen) return;
    this.isOpen = false;
    this.backdropEl.style.display = 'none';

    gsap.to(this.panelEl, {
      opacity: 0, y: -10, scale: 0.97, duration: 0.17, ease: 'power2.in',
      onComplete: () => { if (this.panelEl) this.panelEl.style.display = 'none'; }
    });
    gsap.to('#user-pill-chevron, #user-pill-chevron-mobile', {
      rotation: 0, duration: 0.17, ease: 'power2.in'
    });

    /* Emit cancel if login was pending */
    window.dispatchEvent(new CustomEvent('user-dropdown:login-cancel'));
  }

  /* ── Notification state ─────────────────────────────────────── */

  private getQuickNotifState(): NotifState {
    if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY || !('Notification' in window)) {
      return 'unsupported';
    }
    if (Notification.permission === 'denied') return 'blocked';
    const playerId = localStorage.getItem(PLAYER_ID_KEY);
    if (!playerId) return 'no-player';
    if (Notification.permission !== 'granted') return 'inactive';
    const hasSub = !!localStorage.getItem(SUBSCRIPTION_KEY);
    if (!hasSub) return 'inactive';
    return localStorage.getItem(SUBSCRIPTION_VERIFIED_KEY) === 'true' ? 'active' : 'active-unverified';
  }

  private async checkNotifStateAsync(): Promise<void> {
    const quick = this.getQuickNotifState();
    if (quick === 'unsupported' || quick === 'blocked' || quick === 'no-player' || quick === 'inactive') {
      this.notifState = quick;
      this.updateNotifSection();
      this.updatePillDot();
      return;
    }
    this.notifState = 'checking';
    this.updateNotifSection();
    try {
      const reg = await navigator.serviceWorker.ready;
      const pmSub = await reg.pushManager.getSubscription();
      if (!pmSub) {
        localStorage.removeItem(SUBSCRIPTION_KEY);
        localStorage.removeItem(SUBSCRIPTION_VERIFIED_KEY);
        this.notifState = 'inactive';
      } else {
        try { localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(pmSub)); } catch { /* no-op */ }
        this.notifState = localStorage.getItem(SUBSCRIPTION_VERIFIED_KEY) === 'true'
          ? 'active'
          : 'active-unverified';
      }
    } catch {
      this.notifState = quick !== 'checking' ? quick : 'inactive';
    }
    this.updateNotifSection();
    this.updatePillDot();
  }

  private async handleSubscribe(): Promise<void> {
    const playerId = Number(localStorage.getItem(PLAYER_ID_KEY));
    const playerName = localStorage.getItem(PLAYER_NAME_KEY) ?? '';
    if (!playerId || !playerName) return;

    this.isLoadingNotif = true;
    this.notifState = 'loading';
    this.updateNotifSection();

    try {
      await subscribeToPushNotifications(playerId, playerName);
      this.notifState = 'active';
    } catch (err) {
      console.error('[UserDropdown] subscribe error', err);
      this.notifState = 'error';
    } finally {
      this.isLoadingNotif = false;
    }
    this.updateNotifSection();
    this.updatePillDot();
  }

  private async handleUnsubscribe(): Promise<void> {
    this.isLoadingNotif = true;
    this.notifState = 'loading';
    this.updateNotifSection();

    const savedSub = localStorage.getItem(SUBSCRIPTION_KEY);
    const savedPlayerId = localStorage.getItem(PLAYER_ID_KEY);

    try {
      /* Unsubscribe from PushManager */
      let endpoint: string | undefined;
      try {
        const reg = await navigator.serviceWorker.ready;
        const pmSub = await reg.pushManager.getSubscription();
        if (pmSub) {
          endpoint = pmSub.endpoint;
          await pmSub.unsubscribe();
        }
      } catch { /* ignore */ }

      const subObj = savedSub ? JSON.parse(savedSub) : null;
      endpoint = endpoint ?? (subObj?.endpoint as string | undefined);

      /* Notify backend */
      const resp = await fetch(`${API_BASE_URL}/subscription`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: Number(savedPlayerId), endpoint, subscription: subObj })
      });

      if (!resp.ok && resp.status !== 404) throw new Error(`DELETE failed: ${resp.status}`);
    } catch (err) {
      console.warn('[UserDropdown] unsubscribe error', err);
    } finally {
      localStorage.removeItem(SUBSCRIPTION_KEY);
      localStorage.removeItem(SUBSCRIPTION_VERIFIED_KEY);
      this.isLoadingNotif = false;
      this.notifState = 'inactive';
    }
    this.updateNotifSection();
    this.updatePillDot();
  }

  private async handleVerify(): Promise<void> {
    this.isLoadingNotif = true;
    this.notifState = 'loading';
    this.updateNotifSection();

    const playerId = localStorage.getItem(PLAYER_ID_KEY);
    const subStr = localStorage.getItem(SUBSCRIPTION_KEY);
    if (!playerId || !subStr) {
      this.notifState = 'inactive';
      this.isLoadingNotif = false;
      this.updateNotifSection();
      this.updatePillDot();
      return;
    }

    try {
      const sub = JSON.parse(subStr);
      const resp = await fetch(`${API_BASE_URL}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verify: true, playerId: Number(playerId), subscription: sub })
      });
      if (!resp.ok) throw new Error(`verify failed: ${resp.status}`);
      const data = await resp.json() as { exists?: boolean };
      if (data.exists) {
        localStorage.setItem(SUBSCRIPTION_VERIFIED_KEY, 'true');
        this.notifState = 'active';
      } else {
        localStorage.removeItem(SUBSCRIPTION_VERIFIED_KEY);
        this.notifState = 'inactive';
      }
    } catch {
      this.notifState = 'error';
    } finally {
      this.isLoadingNotif = false;
    }
    this.updateNotifSection();
    this.updatePillDot();
  }

  /* ── Player selection ───────────────────────────────────────── */

  private selectPlayer(id: number): void {
    const p = getPlayerById(id);
    if (!p) return;
    localStorage.setItem(PLAYER_ID_KEY, String(p.id));
    localStorage.setItem(PLAYER_NAME_KEY, p.name);
    this.showingPlayerList = false;
    this.updateIdentitySection();
    this.updateNotifSection();
    this.notifState = this.getQuickNotifState();
    this.updateNotifSection();
    this.updatePillDot();
    this.updateHeader();
  }

  /* ── Admin login / logout ───────────────────────────────────── */

  private expandLoginForm(): void {
    const form = document.getElementById('dd-login-form');
    if (!form) return;
    form.style.display = 'block';
    form.style.overflow = 'hidden';
    gsap.fromTo(form,
      { height: 0, opacity: 0 },
      { height: 'auto', opacity: 1, duration: 0.28, ease: 'power2.out' }
    );
    (document.getElementById('dd-email') as HTMLInputElement)?.focus();
  }

  private collapseLoginForm(): void {
    const form = document.getElementById('dd-login-form');
    if (!form) return;
    gsap.to(form, {
      height: 0, opacity: 0, duration: 0.2, ease: 'power2.in',
      onComplete: () => { form.style.display = 'none'; }
    });
  }

  private async submitLogin(email: string, password: string): Promise<void> {
    const submitBtn = document.getElementById('dd-login-submit') as HTMLButtonElement | null;
    const errorEl = document.getElementById('dd-login-error');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const { login } = await import('@/utils/firebase.util');
      await login(email, password);
      this.loginError = '';
      this.adminTokenFeedback = '';
      this.showingAdminTokenForm = false;
      this.collapseLoginForm();
      this.updateAdminSection();
      window.dispatchEvent(new CustomEvent('user-dropdown:login-success'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Credenziali non valide';
      this.loginError = msg.includes('invalid') || msg.includes('wrong')
        ? 'Email o password errata'
        : msg;
      if (errorEl) {
        errorEl.textContent = this.loginError;
        errorEl.style.display = 'block';
        gsap.fromTo(errorEl, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.2 });
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  private async handleLogout(): Promise<void> {
    if (AUTH) {
      try { await signOut(AUTH); } catch { /* ignore */ }
    }
    this.isAuthenticated = false;
    this.showingAdminTokenForm = false;
    this.adminTokenFeedback = '';
    this.updateAdminSection();
    this.updateHeader();
  }

  private saveAdminToken(rawToken: string): void {
    const token = rawToken.trim();
    if (!token) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      this.adminTokenFeedback = 'Token rimosso';
      this.showingAdminTokenForm = false;
      this.updateAdminSection();
      return;
    }
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    this.adminTokenFeedback = 'Token API salvato';
    this.showingAdminTokenForm = false;
    this.updateAdminSection();
  }

  /* ── Event delegation ───────────────────────────────────────── */

  private handleClick(e: Event): void {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    const action = target.dataset.action;
    switch (action) {
      case 'show-player-list':
        this.showingPlayerList = true;
        this.updateIdentitySection();
        setTimeout(() => {
          gsap.from('#dd-player-list .dd-player-option', {
            x: -8, stagger: 0.04, duration: 0.2, ease: 'power2.out'
          });
        }, 0);
        break;
      case 'cancel-player-list':
        this.showingPlayerList = false;
        this.updateIdentitySection();
        break;
      case 'select-player':
        this.selectPlayer(Number(target.dataset.id));
        break;
      case 'notif-subscribe':
        void this.handleSubscribe();
        break;
      case 'notif-unsubscribe':
        void this.handleUnsubscribe();
        break;
      case 'notif-verify':
        void this.handleVerify();
        break;
      case 'toggle-login-form':
        this.expandLoginForm();
        break;
      case 'cancel-login':
        this.collapseLoginForm();
        break;
      case 'admin-logout':
        void this.handleLogout();
        break;
      case 'toggle-admin-token-form':
        this.showingAdminTokenForm = !this.showingAdminTokenForm;
        this.adminTokenFeedback = '';
        this.updateAdminSection();
        break;
    }
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    if (form.id === 'dd-login-form-inner') {
      const email = (document.getElementById('dd-email') as HTMLInputElement)?.value ?? '';
      const password = (document.getElementById('dd-password') as HTMLInputElement)?.value ?? '';
      void this.submitLogin(email, password);
      return;
    }

    if (form.id === 'dd-admin-token-form') {
      const token = (document.getElementById('dd-admin-token') as HTMLInputElement)?.value ?? '';
      this.saveAdminToken(token);
    }
  }

  /* ── Section updaters ──────────────────────────────────────── */

  private updateIdentitySection(): void {
    const el = document.getElementById('dd-identity');
    if (el) el.innerHTML = this.renderIdentitySection();
  }

  private updateNotifSection(): void {
    const el = document.getElementById('dd-notif');
    if (el) el.innerHTML = this.renderNotifSection();
  }

  private updateAdminSection(): void {
    const el = document.getElementById('dd-admin');
    if (el) el.innerHTML = this.renderAdminSection();
  }

  private updatePillDot(): void {
    const color = NOTIF_DOT[this.notifState];
    ['notif-state-dot', 'notif-state-dot-mobile', 'drawer-notif-dot'].forEach((id) => {
      const dot = document.getElementById(id);
      if (!dot) return;
      if (color === null) {
        dot.style.background = 'transparent';
        dot.style.boxShadow = 'none';
      } else {
        dot.style.background = color;
        dot.style.boxShadow = this.notifState === 'active'
          ? `0 0 6px ${color}88`
          : 'none';
        dot.style.display = 'block';
      }
    });
  }

  private updateHeader(): void {
    /* Update the name shown in the user pill */
    const playerId = Number(localStorage.getItem(PLAYER_ID_KEY) ?? 0) || undefined;
    const player = playerId ? getPlayerById(playerId) : null;
    const name = player?.name ?? localStorage.getItem(PLAYER_NAME_KEY) ?? 'Guest';
    const initials = getInitials(name) || 'G';
    const color = player ? (CLASS_COLORS[player.class] ?? '#E8A020') : '#E8A020';

    document.querySelectorAll('[data-user-name]').forEach((el) => {
      el.textContent = name;
    });

    const avatarHtml = renderPlayerAvatar({ initials, color, size: 'xs', playerId: player?.id, hideFrame: true });
    ['user-avatar-desktop', 'user-avatar-mobile', 'user-avatar-mobile-menu'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = avatarHtml;
    });
  }

  /* ── Render ────────────────────────────────────────────────── */

  private renderPanelSkeleton(): string {
    return html(skeletonTemplate);
  }

  private renderPanelContent(): string {
    return html(panelTemplate, {
      identitySection: rawHtml(this.renderIdentitySection()),
      notifSection: rawHtml(this.renderNotifSection()),
      adminSection: rawHtml(this.renderAdminSection())
    });
  }

  /* ── Identity section ──────────────────────────────────────── */

  private renderIdentitySection(): string {
    const playerId = Number(localStorage.getItem(PLAYER_ID_KEY) ?? 0);
    const player = playerId ? getPlayerById(playerId) : null;

    if (this.showingPlayerList) return this.renderPlayerList();

    if (player) {
      const color = CLASS_COLORS[player.class] ?? '#8B7D6B';
      const initials = getInitials(player.name);
      const elo = getDisplayElo(player);
      const className = getClassName(player.class);

      return `
        <div class="flex items-center gap-3">
          ${renderPlayerAvatar({ initials, color, size: 'sm', playerId: player.id, playerClass: player.class })}
          <div class="flex-1 min-w-0">
            <div class="font-ui text-sm text-white leading-tight truncate">${player.name}</div>
            <div class="font-body flex items-center gap-1.5 mt-0.5" style="font-size:11px;color:rgba(255,255,255,0.4)">
              <span style="color:var(--color-gold)">${elo}</span>
              <span>·</span>
              <span style="color:${color}">${className}</span>
            </div>
          </div>
          <button data-action="show-player-list"
                  class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all duration-150 hover:bg-white/10"
                  style="font-family:var(--font-ui);font-size:11px;color:rgba(255,255,255,0.5);letter-spacing:0.06em;border:1px solid rgba(255,255,255,0.1)">
            ${USER_SVG} cambia
          </button>
        </div>
      `;
    }

    /* No player selected */
    return `
      <div class="mb-2.5 flex items-center gap-2">
        <span style="font-family:var(--font-ui);font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:0.1em">CHI SEI?</span>
      </div>
      ${this.renderPlayerList(true)}
    `;
  }

  private renderPlayerList(compact = false): string {
    const players = [...getAllPlayers()].sort((a, b) => a.name.localeCompare(b.name));

    const items = players.map((p) => {
      const color = CLASS_COLORS[p.class] ?? '#8B7D6B';
      const initials = getInitials(p.name);
      const elo = getDisplayElo(p);
      return `
        <button class="dd-player-option w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 hover:bg-white/[0.07] active:scale-[0.98]"
                data-action="select-player" data-id="${p.id}">
          ${renderPlayerAvatar({ initials, color, size: 'xs', playerId: p.id, hideFrame: true })}
          <div class="flex-1 text-left min-w-0">
            <div class="font-ui text-xs text-white truncate">${p.name}</div>
          </div>
          <div class="font-display text-sm shrink-0" style="color:var(--color-gold)">${elo}</div>
        </button>
      `;
    }).join('');

    return `
      <div id="dd-player-list" style="max-height:200px;overflow-y:auto;margin:0 -4px">
        ${items}
      </div>
      ${!compact
        ? `
        <button data-action="cancel-player-list"
                class="mt-2 w-full py-1.5 rounded-lg text-center transition-colors hover:bg-white/5"
                style="font-family:var(--font-ui);font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.06em">
          annulla
        </button>
      `
        : ''}
    `;
  }

  /* ── Notifications section ─────────────────────────────────── */

  private renderNotifSection(): string {
    const playerName = localStorage.getItem(PLAYER_NAME_KEY);

    const stateConfig: Record<NotifState, {
      icon: string; color: string; label: string; sub?: string;
    }> = {
      checking: {
        icon: SPINNER_SVG, color: '#60A5FA',
        label: 'Verifica in corso…'
      },
      unsupported: {
        icon: BELL_OFF_SVG, color: '#6B7280',
        label: 'Non supportate',
        sub: 'Il tuo browser non supporta le notifiche push'
      },
      blocked: {
        icon: LOCK_SVG, color: '#EF4444',
        label: 'Bloccate dal browser',
        sub: 'Abilita le notifiche nelle impostazioni del browser'
      },
      'no-player': {
        icon: BELL_OFF_SVG, color: '#6B7280',
        label: 'Seleziona prima il tuo giocatore'
      },
      inactive: {
        icon: BELL_SVG, color: 'rgba(255,255,255,0.35)',
        label: 'Non attive'
      },
      active: {
        icon: CHECK_CIRCLE_SVG, color: '#4ADE80',
        label: 'Attive',
        sub: playerName ? `Per: ${playerName}` : undefined
      },
      'active-unverified': {
        icon: ALERT_SVG, color: '#F59E0B',
        label: 'Attive · non verificate',
        sub: 'Non ancora confermate dal server'
      },
      loading: {
        icon: SPINNER_SVG, color: '#60A5FA',
        label: 'Operazione in corso…'
      },
      error: {
        icon: ALERT_SVG, color: '#EF4444',
        label: 'Errore',
        sub: 'Si è verificato un problema'
      }
    };

    const cfg = stateConfig[this.notifState];

    let action = '';
    if (this.notifState === 'inactive' || this.notifState === 'error') {
      action = `
        <button data-action="notif-subscribe"
                class="w-full mt-3 py-2 rounded-xl font-ui text-xs text-center transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
          style="background:linear-gradient(135deg,#FFD700,#F0A500);color:var(--color-bg-deep);letter-spacing:0.08em">
          Attiva notifiche
        </button>
      `;
    } else if (this.notifState === 'active-unverified') {
      action = `
        <div class="flex gap-2 mt-3">
          <button data-action="notif-verify"
                  class="flex-1 py-1.5 rounded-xl font-ui text-xs text-center transition-all hover:bg-white/10"
                  style="border:1px solid rgba(245,158,11,0.4);color:#F59E0B;letter-spacing:0.07em">
            Verifica serverside
          </button>
          <button data-action="notif-unsubscribe"
                  class="px-3 py-1.5 rounded-xl font-ui text-xs transition-all hover:bg-white/10"
                  style="border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.4);letter-spacing:0.07em">
            Disattiva
          </button>
        </div>
      `;
    } else if (this.notifState === 'active') {
      action = `
        <button data-action="notif-unsubscribe"
                class="flex mt-1.5 mb-1.5 px-3 py-1.5 rounded-xl font-ui text-xs transition-all hover:bg-white/10 float-right"
                style="border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.35);letter-spacing:0.07em">
          Disattiva
        </button>
      `;
    }

    return `
      <div class="flex items-start gap-2.5 mb-0.5">
        <span style="color:${cfg.color};flex-shrink:0;margin-top:1px">${cfg.icon}</span>
        <div class="flex-1 min-w-0">
          <div class="font-ui text-sm"
               style="color:${this.notifState === 'active' ? '#4ADE80' : 'rgba(255,255,255,0.85)'}">
            ${cfg.label}
          </div>
          ${cfg.sub ? `<div class="font-body mt-0.5" style="font-size:10px;color:rgba(255,255,255,0.35)">${cfg.sub}</div>` : ''}
        </div>
      </div>
      ${action}
    `;
  }

  /* ── Admin section ─────────────────────────────────────────── */

  private renderAdminSection(): string {
    if (this.isAuthenticated) {
      const hasToken = !!localStorage.getItem(ADMIN_TOKEN_KEY);
      const placeholder = hasToken ? 'Nuovo token per aggiornare' : 'Incolla token admin API';
      const tokenButtonLabel = hasToken ? 'Aggiorna token' : 'Aggiungi token';
      return `
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span style="color:#4ADE80">${SHIELD_SVG}</span>
              <span class="font-ui text-xs" style="color:rgba(255,255,255,0.7);letter-spacing:0.08em">ADMIN ATTIVO</span>
            </div>
            <button data-action="admin-logout"
                    class="px-2.5 py-1 rounded-lg font-ui text-xs transition-all hover:bg-white/10"
                    style="font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:0.07em;border:1px solid rgba(255,255,255,0.08)">
              Esci
            </button>
          </div>

          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span style="color:${hasToken ? '#4ADE80' : 'rgba(255,255,255,0.35)'}">${CHECK_CIRCLE_SVG}</span>
              <span class="font-ui text-xs truncate" style="color:rgba(255,255,255,0.7);letter-spacing:0.08em">
                ${hasToken ? 'TOKEN API ATTIVO' : 'TOKEN API NON IMPOSTATO'}
              </span>
            </div>
            <button data-action="toggle-admin-token-form"
                    class="px-2.5 py-1 rounded-lg font-ui text-xs transition-all hover:bg-white/10 shrink-0"
                    style="font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:0.07em;border:1px solid rgba(255,255,255,0.08)">
              ${tokenButtonLabel}
            </button>
          </div>

          ${this.showingAdminTokenForm
            ? `
            <form id="dd-admin-token-form" class="space-y-2">
              <label for="dd-admin-token" class="font-ui text-xs block"
                     style="color:rgba(255,255,255,0.5);letter-spacing:0.07em">
                TOKEN API NOTIFICHE
              </label>
              <div class="flex items-center gap-2">
                <input type="password" id="dd-admin-token"
                       placeholder="${placeholder}"
                       value=""
                       autocomplete="off"
                       class="w-full px-3 py-2 rounded-xl font-body text-sm text-white placeholder:text-white/25 outline-none transition-all"
                       style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);font-size:12px"
                       onfocus="this.style.borderColor='rgba(255,215,0,0.4)'"
                       onblur="this.style.borderColor='rgba(255,255,255,0.1)'" />
                <button type="submit"
                        class="px-3 py-2 rounded-xl font-ui text-xs transition-all hover:brightness-110 active:scale-[0.98]"
                        style="background:linear-gradient(135deg,#FFD700,#F0A500);color:var(--color-bg-deep);letter-spacing:0.08em">
                  Salva
                </button>
              </div>
            </form>
          `
            : ''}

          ${this.adminTokenFeedback
            ? `<div class="font-body" style="font-size:10px;color:rgba(74,222,128,0.95)">${this.adminTokenFeedback}</div>`
            : ''}
        </div>
      `;
    }
    return `
      <div>
        <button data-action="toggle-login-form"
                class="flex items-center gap-2 w-full transition-all duration-150 hover:text-white/70"
                style="color:rgba(255,255,255,0.4)">
          ${SHIELD_SVG}
          <span class="font-ui text-xs" style="letter-spacing:0.08em">ACCEDI COME ADMIN</span>
          <svg class="ml-auto" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div id="dd-login-form" style="display:none;overflow:hidden">
                <form id="dd-login-form-inner" class="pt-3 pb-1 space-y-2">
                  <input type="email" id="dd-email" placeholder="Email admin"
                         autocomplete="username"
                         class="w-full px-3 py-2.5 rounded-xl font-body text-sm text-white placeholder:text-white/25 outline-none transition-all"
                         style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);font-size:13px"
                            onfocus="this.style.borderColor='rgba(255,215,0,0.4)'"
                   onblur="this.style.borderColor='rgba(255,255,255,0.1)'" />
            <input type="password" id="dd-password" placeholder="Password"
                   autocomplete="current-password"
                   class="w-full px-3 py-2.5 rounded-xl font-body text-sm text-white placeholder:text-white/25 outline-none transition-all"
                   style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);font-size:13px"
                   onfocus="this.style.borderColor='rgba(255,215,0,0.4)'"
                   onblur="this.style.borderColor='rgba(255,255,255,0.1)'" />
            <div id="dd-login-error" style="display:none;font-size:11px;color:#EF4444;font-family:var(--font-body)"></div>
            <div class="flex gap-2 pt-1">
                  <button type="submit" id="dd-login-submit"
                    class="px-3 py-2 rounded-xl font-ui text-xs text-center transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                    style="background:linear-gradient(135deg,#FFD700,#F0A500);color:var(--color-bg-deep);letter-spacing:0.08em">
                    Accedi
                  </button>
                  <button type="button" data-action="cancel-login"
                    class="px-3 py-2 rounded-xl font-ui text-xs transition-all hover:bg-white/10"
                    style="border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.4)">
                    Annulla
                  </button>
                </form>
              </div>
            </div>
          `;
  }
}

/* ── Singleton export ──────────────────────────────────────── */
export const userDropdown = new UserDropdownComponent();
