/**
 * Abstract base class for SPA components.
 *
 * Every page and reusable component extends this and implements
 * `render()` (returns an HTML string) and optionally `mount()` / `destroy()`.
 */
export abstract class Component {
  /** Root element in the DOM after the component is mounted. */
  protected el: HTMLElement | null = null;

  /** Route parameters (e.g. { id: '5' } for /profile/:id). */
  protected params: Record<string, string> = {};

  /** Inject route params before rendering. */
  setParams(params: Record<string, string>): void {
    this.params = params;
  }

  /** Inject root element before mount lifecycle. */
  setElement(el: HTMLElement | null): void {
    this.el = el;
  }

  /**
   * Return the component's HTML markup.
   * May be async if data fetching is needed before rendering.
   */
  abstract render(): string | Promise<string>;

  /**
   * Called after the HTML has been inserted into the DOM.
   * Bind event listeners, start timers, connect WebSockets here.
   */
  mount(): void { }

  /**
   * Called before navigating away from this component.
   * Remove listeners, clear intervals, close sockets, destroy charts here.
   */
  destroy(): void { }

  // ── DOM helpers (scoped to the component's container) ────

  protected $(selector: string): HTMLElement | null {
    return this.el?.querySelector(selector) ?? document.querySelector(selector);
  }

  protected $$(selector: string): HTMLElement[] {
    return Array.from(
      this.el?.querySelectorAll(selector) ?? document.querySelectorAll(selector)
    );
  }

  protected $id(id: string): HTMLElement | null {
    return document.getElementById(id);
  }
}
