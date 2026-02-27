/**
 * FoosballLogo — SVG circular logo with foosball player figure.
 * Ported from Figma: FoosballLogo.tsx
 */

import { bindHtml } from '../utils/html-template.util';
import template from './foosball-logo.component.html?raw';

export function renderFoosballLogo(size: number = 44, color: string = '#FFD700'): string {
  return bindHtml(template)`${{ size, color }}`;
}
