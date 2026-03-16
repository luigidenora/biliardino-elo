import { refreshCurrentView } from '@/services/app-refresh.service';
import { appState } from '../state';
import { html } from '../utils/html-template.util';
import { Component } from './component.base';
import template from './pull-to-refresh.component.html?raw';

type PullRefreshState = 'idle' | 'pulling' | 'armed' | 'refreshing' | 'success' | 'error';

const HEADER_GAP_PX = 8;
const ARM_THRESHOLD_PX = 68;
const MAX_PULL_PX = 96;
const HOLD_VISIBLE_PX = 74;
const SUCCESS_VISIBLE_MS = 920;

class PullToRefreshComponent extends Component {
  private shellEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;

  private state: PullRefreshState = 'idle';
  private startY = 0;
  private activeTouchId: number | null = null;
  private pullDistance = 0;
  private tracking = false;
  private isRefreshing = false;
  private resetTimer: number | null = null;

  private onTouchStartBound = (event: TouchEvent): void => this.onTouchStart(event);
  private onTouchMoveBound = (event: TouchEvent): void => this.onTouchMove(event);
  private onTouchEndBound = (): void => this.onTouchEnd();
  private onRouteChangeBound = (): void => this.syncHeaderOffset();
  private onResizeBound = (): void => this.syncHeaderOffset();
  private onRefreshStartBound = (): void => this.showRefreshingState();
  private onRefreshSuccessBound = (): void => this.showResultState('success');
  private onRefreshErrorBound = (): void => this.showResultState('error');

  override render(): string {
    return html(template, {
      label: 'Tira per aggiornare',
      hint: 'Nuovi dati senza ricaricare la pagina'
    });
  }

  override mount(): void {
    if (this.el) return;

    const host = document.createElement('div');
    host.id = 'pull-refresh-host';
    host.innerHTML = this.render();
    document.body.appendChild(host);
    this.setElement(host);

    this.shellEl = this.$('#pull-refresh-shell');
    this.labelEl = this.$('#pull-refresh-label');
    this.hintEl = this.$('#pull-refresh-hint');

    this.syncHeaderOffset();
    this.setState('idle');

    if ('ontouchstart' in window) {
      window.addEventListener('touchstart', this.onTouchStartBound, { passive: true });
      window.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });
      window.addEventListener('touchend', this.onTouchEndBound, { passive: true });
      window.addEventListener('touchcancel', this.onTouchEndBound, { passive: true });
    }

    window.addEventListener('resize', this.onResizeBound);
    appState.on('route-change', this.onRouteChangeBound);
    appState.on('app-refresh:start', this.onRefreshStartBound);
    appState.on('app-refresh:success', this.onRefreshSuccessBound);
    appState.on('app-refresh:error', this.onRefreshErrorBound);
  }

  override destroy(): void {
    window.removeEventListener('touchstart', this.onTouchStartBound);
    window.removeEventListener('touchmove', this.onTouchMoveBound);
    window.removeEventListener('touchend', this.onTouchEndBound);
    window.removeEventListener('touchcancel', this.onTouchEndBound);
    window.removeEventListener('resize', this.onResizeBound);

    appState.off('route-change', this.onRouteChangeBound);
    appState.off('app-refresh:start', this.onRefreshStartBound);
    appState.off('app-refresh:success', this.onRefreshSuccessBound);
    appState.off('app-refresh:error', this.onRefreshErrorBound);

    if (this.resetTimer !== null) {
      window.clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    this.el?.remove();
    this.el = null;
    this.shellEl = null;
    this.labelEl = null;
    this.hintEl = null;
  }

  private onTouchStart(event: TouchEvent): void {
    if (this.isRefreshing || this.tracking) return;
    if (event.touches.length !== 1) return;
    if (window.scrollY > 2) return;

    const touch = event.touches[0];
    const target = event.target as HTMLElement | null;
    if (!touch || !target) return;
    if (this.isInteractiveTarget(target) || this.hasScrollableAncestor(target)) return;

    this.clearResetTimer();
    this.tracking = true;
    this.activeTouchId = touch.identifier;
    this.startY = touch.clientY;
    this.pullDistance = 0;
    this.setState('pulling');
  }

  private onTouchMove(event: TouchEvent): void {
    if (!this.tracking || this.activeTouchId === null) return;

    const touch = this.findTouch(event.changedTouches, this.activeTouchId)
      ?? this.findTouch(event.touches, this.activeTouchId);
    if (!touch) return;

    const deltaY = touch.clientY - this.startY;
    if (deltaY <= 0) {
      this.pullDistance = 0;
      this.updateVisualState();
      return;
    }

    event.preventDefault();
    this.pullDistance = Math.min(MAX_PULL_PX, deltaY * 0.58);
    this.setState(this.pullDistance >= ARM_THRESHOLD_PX ? 'armed' : 'pulling');
  }

  private onTouchEnd(): void {
    if (!this.tracking) return;

    this.tracking = false;
    this.activeTouchId = null;

    if (this.state === 'armed') {
      void refreshCurrentView();
      return;
    }

    this.pullDistance = 0;
    this.setState('idle');
  }

  private showRefreshingState(): void {
    this.isRefreshing = true;
    this.pullDistance = HOLD_VISIBLE_PX;
    this.setState('refreshing');
  }

  private showResultState(state: 'success' | 'error'): void {
    this.isRefreshing = false;
    this.pullDistance = HOLD_VISIBLE_PX;
    this.setState(state);
    this.clearResetTimer();
    this.resetTimer = window.setTimeout(() => {
      this.pullDistance = 0;
      this.setState('idle');
    }, SUCCESS_VISIBLE_MS);
  }

  private setState(nextState: PullRefreshState): void {
    this.state = nextState;
    this.updateVisualState();
  }

  private updateVisualState(): void {
    if (!this.shellEl || !this.labelEl || !this.hintEl) return;

    this.shellEl.dataset.state = this.state;
    const visibleOffset = this.state === 'idle'
      ? 0
      : this.state === 'refreshing' || this.state === 'success' || this.state === 'error'
        ? HOLD_VISIBLE_PX
        : this.pullDistance;
    const progress = this.state === 'refreshing' || this.state === 'success' || this.state === 'error'
      ? 1
      : Math.max(0.08, Math.min(1, this.pullDistance / ARM_THRESHOLD_PX));

    this.shellEl.style.setProperty('--ptr-offset', `${visibleOffset}px`);
    this.shellEl.style.setProperty('--ptr-progress', progress.toString());

    switch (this.state) {
      case 'armed':
        this.labelEl.textContent = 'Rilascia per aggiornare';
        this.hintEl.textContent = 'Aggiorniamo solo i dati nuovi';
        break;
      case 'refreshing':
        this.labelEl.textContent = 'Aggiornamento dati...';
        this.hintEl.textContent = 'La pagina resta stabile mentre sincronizziamo';
        break;
      case 'success':
        this.labelEl.textContent = 'Dati aggiornati';
        this.hintEl.textContent = 'La classifica e le sezioni visibili sono ora allineate';
        break;
      case 'error':
        this.labelEl.textContent = 'Aggiornamento non riuscito';
        this.hintEl.textContent = 'Riprova tirando di nuovo verso il basso';
        break;
      case 'pulling':
        this.labelEl.textContent = 'Tira per aggiornare';
        this.hintEl.textContent = 'Nuovi dati senza ricaricare la pagina';
        break;
      default:
        this.labelEl.textContent = 'Tira per aggiornare';
        this.hintEl.textContent = 'Nuovi dati senza ricaricare la pagina';
        break;
    }
  }

  private syncHeaderOffset(): void {
    if (!this.shellEl) return;

    const headerHeight = document.getElementById('app-header')?.getBoundingClientRect().height ?? 56;
    this.shellEl.style.setProperty('--ptr-header-offset', `${headerHeight + HEADER_GAP_PX}px`);
  }

  private isInteractiveTarget(target: HTMLElement): boolean {
    return !!target.closest('a, button, input, textarea, select, [role="button"], [data-nav]');
  }

  private hasScrollableAncestor(target: HTMLElement): boolean {
    let current: HTMLElement | null = target;

    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const scrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
        && current.scrollHeight > current.clientHeight;

      if (scrollable) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  private findTouch(touchList: TouchList, identifier: number): Touch | null {
    for (let index = 0; index < touchList.length; index++) {
      if (touchList[index].identifier === identifier) {
        return touchList[index];
      }
    }

    return null;
  }

  private clearResetTimer(): void {
    if (this.resetTimer !== null) {
      window.clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}

export const pullToRefresh = new PullToRefreshComponent();