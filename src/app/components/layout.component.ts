/**
 * Layout — Root shell wrapping the entire SPA.
 * Contains: FieldBackground, Header, main content area, footer.
 * The login dialog has been replaced by the UserDropdown singleton.
 */

import { bindHtml, rawHtml } from '../utils/html-template.util';
import { renderFieldBackground } from './field-background.component';
import { HeaderComponent } from './header.component';
import template from './layout.component.html?raw';

export class LayoutComponent {
  private header = new HeaderComponent();

  render(): string {
    return bindHtml(template)`${{
      fieldBackground: rawHtml(renderFieldBackground()),
      headerHtml: rawHtml(this.header.render())
    }}`;
  }

  mount(): void {
    this.header.mount();
  }

  destroy(): void {
    this.header.destroy();
  }
}
