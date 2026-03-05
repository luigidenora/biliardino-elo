/**
 * FoosballLogo — SVG circular logo with foosball player figure.
 * Ported from Figma: FoosballLogo.tsx
 */

import { html } from '../utils/html-template.util';
import template from './foosball-logo.component.html?raw';

export function renderFoosballLogo(size: number = 44, color: string = '#FFD700'): string {
  return html(template, { size, color });
}
