import { createParticles, EmojiOption } from '@/app/particles/particles-manager';
import { refreshCurrentView } from '@/services/app-refresh.service';
import haptics from '@/utils/haptics.util';
import { Component } from './component.base';

// Each step = how many px of pull triggers a new burst + haptic
const STEP_PX = 18;
// Below this threshold the pull is ignored
const DEAD_ZONE_PX = 10;
// At this distance the gesture is "armed" — releasing will reload
const ARM_THRESHOLD_PX = 90;
// Touch movement is attenuated so it feels rubbery (iOS style)
const PULL_RESISTANCE = 0.55;

const FOOTBALL_EMOJIS: EmojiOption[] = [
  { emoji: '⚽', canFlip: true },
  { emoji: '♻️', canFlip: true },
  { emoji: '🦈', canFlip: true }
];

// ── Component ─────────────────────────────────────────────────────────────────

class PullToRefreshComponent extends Component {
  private isTrackingPull = false;
  private activeTouchId: number | null = null;
  private startY = 0;
  private pullDistance = 0;
  private lastBurstStep = 0;
  private lastSpawnTime = 0;
  private armed = false;
  private isRefreshing = false;

  private onTouchStartBound = (e: TouchEvent): void => this.onTouchStart(e);
  private onTouchMoveBound = (e: TouchEvent): void => this.onTouchMove(e);
  private onTouchEndBound = (): void => this.onTouchEnd();

  // Pull-to-refresh has no DOM output — particle canvas is managed by the
  // global ParticlesManager already on the page.
  override render(): string { return ''; }

  override mount(): void {
    if (!this.shouldHandlePullGesture()) return;
    window.addEventListener('touchstart', this.onTouchStartBound);
    window.addEventListener('touchmove', this.onTouchMoveBound);
    window.addEventListener('touchend', this.onTouchEndBound);
    window.addEventListener('touchcancel', this.onTouchEndBound);
  }

  override destroy(): void {
    window.removeEventListener('touchstart', this.onTouchStartBound);
    window.removeEventListener('touchmove', this.onTouchMoveBound);
    window.removeEventListener('touchend', this.onTouchEndBound);
    window.removeEventListener('touchcancel', this.onTouchEndBound);
  }

  // ── Gesture ───────────────────────────────────────────────────────────────

  private shouldHandlePullGesture(): boolean {
    return document.body.classList.contains('pwa') && 'ontouchstart' in window;
  }

  private getScrollTop(): number {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  private findTouch(touchList: TouchList, id: number): Touch | null {
    for (let i = 0; i < touchList.length; i++) {
      const t = touchList.item(i);
      if (t?.identifier === id) return t;
    }
    return null;
  }

  private onTouchStart(event: TouchEvent): void {
    if (this.isTrackingPull) return;
    if (event.touches.length !== 1) return;
    if (this.getScrollTop() > 2) return;

    const touch = event.touches[0];
    if (!touch) return;

    this.isTrackingPull = true;
    this.activeTouchId = touch.identifier;
    this.startY = touch.clientY;
    this.pullDistance = 0;
    this.lastBurstStep = 0;
    this.lastSpawnTime = 0;
    this.armed = false;
  }

  private onTouchMove(event: TouchEvent): void {
    if (!this.isTrackingPull || this.activeTouchId === null) return;

    const touch = this.findTouch(event.touches, this.activeTouchId)
      ?? this.findTouch(event.changedTouches, this.activeTouchId);
    if (!touch) return;

    const rawDelta = touch.clientY - this.startY;
    if (rawDelta <= DEAD_ZONE_PX) {
      this.pullDistance = 0;
      return;
    }

    event.preventDefault();
    this.pullDistance = Math.min(ARM_THRESHOLD_PX * 1.4, rawDelta * PULL_RESISTANCE);

    // Continuously spawn particles every 100ms while pulling
    const now = Date.now();
    if (now - this.lastSpawnTime > 100) {
      this.spawnBurst(1);
      this.lastSpawnTime = now;
    }

    // Vibrate on step changes (discrete intervals)
    const currentStep = Math.floor(this.pullDistance / STEP_PX);
    if (currentStep > this.lastBurstStep) {
      this.lastBurstStep = currentStep;
      this.vibrate(currentStep);
    }

    // First time we cross the threshold: strong "ready" buzz
    if (!this.armed && this.pullDistance >= ARM_THRESHOLD_PX) {
      this.armed = true;
      this.vibrate(99);
    }
  }

  private onTouchEnd(): void {
    if (!this.isTrackingPull) return;

    const shouldRefresh = this.armed;
    this.isTrackingPull = false;
    this.activeTouchId = null;
    this.pullDistance = 0;
    this.lastBurstStep = 0;
    this.armed = false;

    if (shouldRefresh) {
      void this.performRefresh();
    }
  }

  private async performRefresh(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      await refreshCurrentView('pull-to-refresh');
      haptics.trigger('success');
    } catch {
      haptics.trigger('error');
    } finally {
      this.isRefreshing = false;
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private spawnBurst(count: number): void {
    const headerEl = document.getElementById('app-header-inner');
    const headerBottom = (headerEl?.offsetTop ?? 0) + (headerEl?.offsetHeight ?? 56);
    const y = headerBottom + 8;

    for (let i = 0; i < count; i++) {
      const x = 40 + Math.random() * (window.innerWidth - 80);
      // Gravity downward so balls fall from the header edge
      createParticles(x, y, FOOTBALL_EMOJIS, 0, 0, 1.5);
    }
  }

  // ── Haptics ───────────────────────────────────────────────────────────────

  /**
   * Trigger discrete haptics during pull progression.
   * Keeps haptics brief and semantic for mobile UX.
   */
  private vibrate(step: number): void {
    if (step === 0) return;

    try {
      if (step === 99) {
        // Threshold reached: refresh is armed.
        haptics.trigger('medium');
      } else {
        // Step detents while dragging.
        haptics.trigger('selection');
      }
    } catch {
      // not supported
    }
  }
}

export const pullToRefresh = new PullToRefreshComponent();
