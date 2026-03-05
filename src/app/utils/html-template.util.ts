type Primitive = string | number | boolean | null | undefined;

interface RawHtmlValue {
  __rawHtml: string;
}

const RAW_HTML_KEY = '__rawHtml';

function isRawHtmlValue(value: unknown): value is RawHtmlValue {
  return Boolean(value) && typeof value === 'object' && RAW_HTML_KEY in (value as Record<string, unknown>);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function getBindingValue(bindings: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, bindings);
}

function toHtml(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (isRawHtmlValue(value)) return value.__rawHtml;
  if (Array.isArray(value)) return value.map(item => toHtml(item)).join('');

  if (typeof value === 'string') return escapeHtml(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  return escapeHtml(JSON.stringify(value));
}

export function rawHtml(value: string): RawHtmlValue {
  return { __rawHtml: value };
}

export function html(template: string, dict: Record<string, unknown> = {}): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    return toHtml(getBindingValue(dict, key));
  });
}
