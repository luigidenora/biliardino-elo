/**
 * BroadcastKickComponent — Animated kick-to-start broadcast button.
 *
 * Shows a white ball labelled "INIZIA". On click a red foosball
 * player slides in, kicks the ball, then flies off-screen.
 * The host page supplies the click callback; all animation logic
 * lives inside this component.
 */
import haptics from '@/utils/haptics.util';
import gsap from 'gsap';
import { html, rawHtml } from '../utils/html-template.util';
import template from './broadcast-kick.component.html?raw';
import brodcustKickPlayerSVG from './brodcast-kick.svg?raw';

const SVG_ROTATION_ORIGIN = '62 88';
export class BroadcastKickComponent {
  private broadcasting = false;
  private idleTween: gsap.core.Tween | null = null;

  // ── Render ──────────────────────────────────────────────────

  render(): string {
    return html(template, { kickPlayerSvg: rawHtml(brodcustKickPlayerSVG) });
  }

  // ── Mount ───────────────────────────────────────────────────

  mount(onClick: () => void): void {
    const btn = document.getElementById('broadcast-btn');
    if (!btn) return;

    this.idleTween = gsap.to(btn, {
      scale: 1.05,
      duration: 1.4,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1
    });

    btn.addEventListener('click', onClick);
  }

  // ── Kick animation ─────────────────────────────────────────

  async playKick(): Promise<boolean> {
    if (this.broadcasting) return false;
    this.broadcasting = true;

    const ball = document.getElementById('broadcast-btn');
    const player = document.getElementById('kick-player');
    const body = document.getElementById('kick-player-body');

    if (!ball || !player || !body) {
      this.broadcasting = false;
      return false;
    }

    // Kill idle pulse
    if (this.idleTween) {
      this.idleTween.kill();
      this.idleTween = null;
    }
    gsap.set(ball, { scale: 1 });

    // Reset player off-screen right
    gsap.set(player, { x: 120, opacity: 0 });
    gsap.set(body, { rotation: 0, svgOrigin: SVG_ROTATION_ORIGIN });

    const tl = gsap.timeline();

    // 1. Player slides in
    tl.to(player, { x: 0, opacity: 1, duration: 0.25, ease: 'power3.out' });

    // 2. Wind-up — player leans back (anticipation)
    tl.to(body, {
      rotation: -30, duration: 0.25, ease: 'power2.inOut', svgOrigin: SVG_ROTATION_ORIGIN
    });

    // 3. Ball squash on impact (happens during kick motion)
    tl.to(ball, {
      scaleX: 0.8, scaleY: 1.2, duration: 0.08, ease: 'power2.out'
    }, '-=0.12');

    // 4. Kick! — controlled power kick (longer, more defined)
    tl.to(body, {
      rotation: 70, duration: 0.22, ease: 'power2.inOut', svgOrigin: SVG_ROTATION_ORIGIN
    }, '-=0.22');

    // 5. Ball flies away with arc trajectory
    tl.to(ball, {
      scaleX: 1, scaleY: 1, x: -240, rotation: 720, duration: 0.4, ease: 'power1.out'
    }, '-=0.1');

    // 6. Ball returns to center Y during flight (natural arc)
    tl.to(ball, {
      y: 0, duration: 0.35, ease: 'sine.inOut'
    }, '-=0.4');

    // 7. Player recovers and flies off-screen
    tl.to(player, {
      x: 300, opacity: 0, duration: 0.35, ease: 'power3.in'
    }, '-=0.2');

    // 8. Ball disappears after flying off-screen
    tl.to(ball, { opacity: 0, duration: 0.15 }, '-=0.1');

    haptics.trigger([
      { delay: 300, duration: 20 }
    ], { intensity: 1 });

    await tl.then();
    return true;
  }

  // ── Feedback ────────────────────────────────────────────────

  showFeedback(message: string, color: string): void {
    const el = document.getElementById('broadcast-feedback');
    if (!el) return;
    el.style.display = 'block';
    el.style.color = color;
    el.textContent = message;
  }

  reset(): void {
    this.broadcasting = false;
    const ball = document.getElementById('broadcast-btn');
    const player = document.getElementById('kick-player');
    const body = document.getElementById('kick-player-body');

    // Reset player
    if (player) gsap.set(player, { x: 120, opacity: 0 });
    if (body) gsap.set(body, { rotation: 0, svgOrigin: SVG_ROTATION_ORIGIN });

    // Reset ball
    if (ball) {
      gsap.set(ball, { x: 0, rotation: 0, opacity: 1 });
      gsap.to(ball, { opacity: 1, scale: 1, duration: 0.3 });
      // Restart idle pulse on ball
      this.idleTween = gsap.to(ball, {
        scale: 1.05,
        duration: 1.4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: 0.5
      });
    }
  }

  destroy(): void {
    if (this.idleTween) {
      this.idleTween.kill();
      this.idleTween = null;
    }
    gsap.killTweensOf('#broadcast-btn');
    gsap.killTweensOf('#kick-player');
    gsap.killTweensOf('#kick-player-body');
  }
}
