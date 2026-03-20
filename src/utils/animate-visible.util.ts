/**
 * Animate elements only when they become visible in the viewport.
 *
 * Uses IntersectionObserver to defer GSAP `.from()` animations for off-screen
 * elements, preventing unnecessary GPU/CPU work on long lists.
 *
 * On-screen elements animate immediately (preserving original UX).
 * Off-screen elements wait until they scroll into view.
 */
import gsap from 'gsap';

interface AnimateVisibleOptions {
  /** CSS selector for the elements to animate */
  selector: string;
  /** GSAP .from() vars — `stagger` is ignored (handled per-intersection) */
  vars: gsap.TweenVars;
  /** Root element to scope the selector query (defaults to document) */
  root?: Element | null;
  /** Per-element stagger delay in seconds (replaces gsap stagger). Default: 0 */
  stagger?: number;
}

/**
 * Observes elements matching `selector`. Each element that enters the
 * viewport gets a `gsap.from()` call with a small sequential delay.
 *
 * Returns a cleanup function that disconnects the observer.
 */
export function animateVisible(opts: AnimateVisibleOptions): () => void {
  const { selector, vars, root, stagger = 0 } = opts;
  const parent = root ?? document;
  const elements = Array.from(parent.querySelectorAll<HTMLElement>(selector));

  if (elements.length === 0) return () => {};

  // Strip stagger from vars — we handle it ourselves per-intersection batch
  const { stagger: _ignored, ...cleanVars } = vars;

  let batchIndex = 0;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const el = entry.target as HTMLElement;
        gsap.from(el, {
          ...cleanVars,
          delay: (cleanVars.delay as number ?? 0) + batchIndex * stagger
        });
        batchIndex++;
      }
    },
    { threshold: 0.15 }
  );

  for (const el of elements) observer.observe(el);

  return () => observer.disconnect();
}
