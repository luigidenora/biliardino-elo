import haptics from '@/utils/haptics.util';
import { appState } from '../state';
import { html } from '../utils/html-template.util';
import { Component } from './component.base';
import template from './pull-to-refresh.component.html?raw';

const PREFLIGHT_HAPTIC = { duration: 20 };
const SUCCESS_HAPTIC = [{ duration: 50 }, { duration: 100, delay: 50 }];
const ERROR_HAPTIC = [{ duration: 100 }, { duration: 50, delay: 100 }];

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class LoadingBarComponent extends Component {
  private barEl: HTMLElement | null = null;
  private isRefreshing = false;

  private onRefreshStartBound = (): void => this.showLoading();
  private onRefreshSuccessBound = (): void => this.showSuccess();
  private onRefreshErrorBound = (): void => this.showError();
  private hideTimer: number | null = null;

  override render(): string {
    return html(template, {});
  }

  override mount(): void {
    // Create and append container to DOM
    const host = document.createElement('div');
    host.innerHTML = this.render();
    document.body.appendChild(host);
    this.el = host;

    // Get elements from the template
    this.barEl = this.$id('loading-bar');
    const containerEl = this.$id('loading-bar-container');

    if (!this.barEl || !containerEl) return;

    // Apply styles to container
    containerEl.style.cssText = `
      position: fixed;
      top: 56px;
      left: 0;
      right: 0;
      height: 2px;
      z-index: 48;
      background: transparent;
      overflow: hidden;
    `;

    // Apply styles to bar
    this.barEl.style.cssText = `
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, rgba(255, 215, 0, 0.3), rgba(255, 215, 0, 0.95));
      transition: width 0.3s ease;
      box-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
    `;

    // Inject CSS for shake animation
    if (!document.getElementById('loading-bar-styles')) {
      const style = document.createElement('style');
      style.id = 'loading-bar-styles';
      style.textContent = `
        @keyframes loading-bar-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes loading-bar-shake {
            0%, 100% { transform: translateX(0); }
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Listen to refresh events
    appState.on('app-refresh:start', this.onRefreshStartBound);
    appState.on('app-refresh:success', this.onRefreshSuccessBound);
    appState.on('app-refresh:error', this.onRefreshErrorBound);
  }

  override destroy(): void {
    appState.off('app-refresh:start', this.onRefreshStartBound);
    appState.off('app-refresh:success', this.onRefreshSuccessBound);
    appState.off('app-refresh:error', this.onRefreshErrorBound);

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.el?.remove();
    this.el = null;
    this.barEl = null;
  }

  private triggerHaptic(pattern: any): void {
    if (prefersReducedMotion) return;

    if ('vibrate' in navigator) {
      try {
        if (Array.isArray(pattern)) {
          navigator.vibrate(pattern);
        } else {
          navigator.vibrate(pattern.duration);
        }
      } catch (e) {
        // Silently fail
      }
    }

    try {
      if (Array.isArray(pattern)) {
        pattern.forEach((p: any) =>
          setTimeout(() => haptics.light(), p.delay ?? 0)
        );
      } else {
        haptics.light();
      }
    } catch (e) {
      // Silently fail
    }
  }

  private showLoading(): void {
    if (!this.barEl) return;

    this.isRefreshing = true;
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.triggerHaptic(PREFLIGHT_HAPTIC);

    // Indeterminate progress animation
    this.barEl.style.width = '30%';
    this.barEl.style.transition = 'width 0.5s ease';

    // Stagger animation
    this.hideTimer = window.setTimeout(() => {
      if (this.barEl) {
        this.barEl.style.width = '60%';
      }
    }, 500);
  }

  private showSuccess(): void {
    if (!this.barEl) return;

    this.isRefreshing = false;
    this.triggerHaptic(SUCCESS_HAPTIC);

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    // Complete the bar with green
    this.barEl.style.background = 'linear-gradient(90deg, rgba(74, 222, 128, 0.3), rgba(74, 222, 128, 0.95))';
    this.barEl.style.transition = 'width 0.2s ease';
    this.barEl.style.width = '100%';

    // Fade out
    this.hideTimer = window.setTimeout(() => {
      if (this.barEl) {
        this.barEl.style.transition = 'opacity 0.3s ease';
        this.barEl.style.opacity = '0';
        this.resetBar();
      }
    }, 800);
  }

  private showError(): void {
    if (!this.barEl) return;

    this.isRefreshing = false;
    this.triggerHaptic(ERROR_HAPTIC);

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    // Show error state in red
    this.barEl.style.background = 'linear-gradient(90deg, rgba(248, 113, 113, 0.3), rgba(248, 113, 113, 0.95))';
    this.barEl.style.transition = 'none';
    this.barEl.style.width = '100%';

    // Shake animation
    this.barEl.style.animation = 'loading-bar-shake 0.4s ease-in-out';

    // Fade out
    this.hideTimer = window.setTimeout(() => {
      if (this.barEl) {
        this.barEl.style.animation = 'none';
        this.barEl.style.transition = 'opacity 0.3s ease';
        this.barEl.style.opacity = '0';
        this.resetBar();
      }
    }, 1200);
  }

  private resetBar(): void {
    if (!this.barEl) return;

    this.hideTimer = window.setTimeout(() => {
      if (this.barEl) {
        this.barEl.style.width = '0%';
        this.barEl.style.opacity = '1';
        this.barEl.style.transition = 'width 0.3s ease';
        this.barEl.style.background = 'linear-gradient(90deg, rgba(255, 215, 0, 0.3), rgba(255, 215, 0, 0.95))';
        this.barEl.style.animation = 'none';
      }
      this.hideTimer = null;
    }, 100);
  }
}

export const pullToRefresh = new LoadingBarComponent();
