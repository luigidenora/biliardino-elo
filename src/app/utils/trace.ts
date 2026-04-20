/**
 * Runtime tracing utility — enabled by default, disabilitabile via console.
 *
 * Disable: window.disableTracing()
 * Enable:  window.enableTracing()
 *
 * Usage: trace('Router', 'onPathChange', { path })
 */

const LS_KEY = 'biliardino_tracing';
const LS_DISABLED_KEY = 'biliardino_tracing_disabled';

// ON by default — opt-out via window.disableTracing()
let _enabled = localStorage.getItem(LS_DISABLED_KEY) !== '1';

declare global {
  interface Window {
    enableTracing: () => void;
    disableTracing: () => void;
  }
}

window['enableTracing'] = () => {
  _enabled = true;
  localStorage.removeItem(LS_DISABLED_KEY);
  localStorage.setItem(LS_KEY, '1');
  console.info('[Trace] Tracing ENABLED.');
};

window['disableTracing'] = () => {
  _enabled = false;
  localStorage.setItem(LS_DISABLED_KEY, '1');
  localStorage.removeItem(LS_KEY);
  console.info('[Trace] Tracing DISABLED. Use window.enableTracing() to re-enable.');
};

console.info(`[Trace] Tracing is ${_enabled ? 'ON' : 'OFF'}. Use window.${_enabled ? 'disableTracing' : 'enableTracing'}() to toggle.`);

// ── Global error catchers — catch silent crashes anywhere in the app ──────────
// These fire even for module-evaluation errors and unhandled promise rejections.

window.addEventListener('error', (event) => {
  const ts = performance.now().toFixed(1);
  console.error(
    `[Trace +${ts}ms] [GLOBAL] Unhandled error — message: "${event.message}" | file: ${event.filename}:${event.lineno}:${event.colno}`,
    event.error
  );
});

window.addEventListener('unhandledrejection', (event) => {
  const ts = performance.now().toFixed(1);
  console.error(
    `[Trace +${ts}ms] [GLOBAL] Unhandled promise rejection`,
    event.reason
  );
});

/**
 * Emit a trace log. No-op when tracing is disabled.
 * Uses console.info so the messages are always visible in DevTools
 * without enabling Verbose level (important for prod debugging).
 * @param module  Short module name, e.g. 'Router', 'Bootstrap', 'State'
 * @param step    Human-readable step label
 * @param data    Optional extra data to log
 */
export function trace(module: string, step: string, data?: unknown): void {
  if (!_enabled) return;
  const ts = performance.now().toFixed(1);
  if (data !== undefined) {
    console.info(`[Trace +${ts}ms] [${module}] ${step}`, data);
  } else {
    console.info(`[Trace +${ts}ms] [${module}] ${step}`);
  }
}
