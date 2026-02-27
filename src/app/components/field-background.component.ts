/**
 * FieldBackground — SVG foosball field backdrop.
 * Ported from Figma: FieldBackground.tsx
 * Pure static SVG, rendered once in the Layout.
 */

import { bindHtml } from '../utils/html-template.util';
import template from './field-background.component.html?raw';

export function renderFieldBackground(): string {
  return bindHtml(template)`${{}}`;
}
