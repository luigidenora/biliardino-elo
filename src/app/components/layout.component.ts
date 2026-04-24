/**
 * Layout — Root shell wrapping the entire SPA.
 * Contains: FieldBackground, Header, main content area, footer.
 * The login dialog has been replaced by the UserDropdown singleton.
 */

import { html, rawHtml } from '../utils/html-template.util';
import { renderFieldBackground } from './field-background.component';
import { HeaderComponent } from './header.component';
import template from './layout.component.html?raw';
import { bottomNav } from './bottom-nav.component';
import { mobileDrawer } from './mobile-drawer.component';

declare const __SW_VERSION__: string;

export class LayoutComponent {
  private header = new HeaderComponent();

  render(): string {
    return html(template, {
      fieldBackground: rawHtml(renderFieldBackground()),
      headerHtml: rawHtml(this.header.render())
    });
  }

  mount(): void {
    const versionEl = document.getElementById('pwa-version');
    if (versionEl) versionEl.textContent = __SW_VERSION__;

    this.header.mount();
    mobileDrawer.mount();
    bottomNav.mount();
  }

  destroy(): void {
    this.header.destroy();
    mobileDrawer.destroy();
    bottomNav.destroy();
  }
}
