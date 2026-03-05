/**
 * FieldBackground — SVG foosball field backdrop.
 * Ported from Figma: FieldBackground.tsx
 * Pure static SVG, rendered once in the Layout.
 */

import { html } from '../utils/html-template.util';
import template from './field-background.component.html?raw';

export function renderFieldBackground(): string {
  return html(template);
}
