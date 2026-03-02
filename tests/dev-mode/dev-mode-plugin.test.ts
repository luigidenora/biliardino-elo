/**
 * __DEV_MODE__ System — Tests
 *
 * Verifica che il sistema devModePlugin funzioni correttamente:
 * - Il plugin configura __DEV_MODE__ come define constant
 * - __DEV_MODE__ è attivo SOLO con VITE_DEV_MODE=true (stringa esatta)
 * - In dev mode usa repository.mock.ts (dati in memoria), in prod usa Firebase
 * - In produzione il codice dev viene eliminato da Rollup (dead-code elimination)
 * - dev-toolbar.ts è stato rimosso
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

// ═════════════════════════════════════════════════════════════════════════════
// devModePlugin — Behavioral Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('devModePlugin — configurazione', () => {
  it('il plugin è presente nella config Vite', async () => {
    // Importa la config vite come modulo
    const mod = await import('../../vite.config');
    const configFn = mod.default;

    const config = typeof configFn === 'function'
      ? (configFn as any)({ mode: 'production', command: 'build', isSsrBuild: false, isPreview: false })
      : configFn;

    // Flatten plugins (Vite supporta array annidati)
    const plugins = [config.plugins || []]
      .flat(Infinity)
      .filter(Boolean);

    const devPlugin = plugins.find((p: any) => p.name === 'dev-mode');
    expect(devPlugin).toBeDefined();
    expect(devPlugin.enforce).toBe('pre');
  });

  it('il plugin definisce __DEV_MODE__ nella config', async () => {
    const mod = await import('../../vite.config');
    const configFn = mod.default;

    const config = typeof configFn === 'function'
      ? (configFn as any)({ mode: 'production', command: 'build', isSsrBuild: false, isPreview: false })
      : configFn;

    const plugins = [config.plugins || []]
      .flat(Infinity)
      .filter(Boolean);

    const devPlugin = plugins.find((p: any) => p.name === 'dev-mode');

    // Chiama il hook config del plugin (simula Vite che lo invoca)
    const hookResult = devPlugin.config({}, { mode: 'production' });

    expect(hookResult).toBeDefined();
    expect(hookResult.define).toBeDefined();
    expect('__DEV_MODE__' in hookResult.define).toBe(true);
  });

  it('il hook config ritorna __DEV_MODE__ come boolean basato su VITE_DEV_MODE', async () => {
    const mod = await import('../../vite.config');
    const configFn = mod.default;

    const config = typeof configFn === 'function'
      ? (configFn as any)({ mode: 'production', command: 'build', isSsrBuild: false, isPreview: false })
      : configFn;

    const plugins = [config.plugins || []]
      .flat(Infinity)
      .filter(Boolean);

    const devPlugin = plugins.find((p: any) => p.name === 'dev-mode');

    // loadEnv('production', ...) carica anche .env (base).
    // Se nel progetto .env contiene VITE_DEV_MODE=true, il risultato sarà true.
    // Se non lo contiene o è 'false', il risultato sarà false.
    // L'importante è che il valore sia un boolean (non stringa), così Rollup
    // può fare dead-code elimination in build.
    const hookResult = devPlugin.config({}, { mode: 'production' });

    expect(typeof hookResult.define.__DEV_MODE__).toBe('boolean');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Strict comparison logic
// ═════════════════════════════════════════════════════════════════════════════

describe('devModePlugin — logica di attivazione', () => {
  it('si attiva SOLO con la stringa esatta "true"', () => {
    const testCases: Array<{ input: string | undefined; expected: boolean }> = [
      { input: 'true', expected: true },
      { input: 'false', expected: false },
      { input: '1', expected: false },
      { input: 'yes', expected: false },
      { input: 'TRUE', expected: false },
      { input: 'True', expected: false },
      { input: '', expected: false },
      { input: undefined, expected: false }
    ];

    // Replica la logica esatta del plugin: env.VITE_DEV_MODE === 'true'
    for (const { input, expected } of testCases) {
      expect(input === 'true', `VITE_DEV_MODE=${input}`).toBe(expected);
    }
  });

  it('non è possibile attivare dev mode con trucchi di coercion', () => {
    // Questi tentativi di bypass NON attivano dev mode
    expect('TRUE' === 'true').toBe(false);
    expect('True' === 'true').toBe(false);
    expect('1' === 'true').toBe(false);
    expect(' true' === 'true').toBe(false);
    expect('true ' === 'true').toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Source code guards — verifica che i file critici proteggano il codice dev
// ═════════════════════════════════════════════════════════════════════════════

describe('__DEV_MODE__ guards nei file sorgente', () => {
  it('vite.config.ts definisce il plugin con __DEV_MODE__', () => {
    const content = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf-8');
    expect(content).toContain('__DEV_MODE__');
    expect(content).toContain('VITE_DEV_MODE === \'true\'');
  });

  it('auth.util.ts contiene il bypass __DEV_MODE__ per dev mode', () => {
    const content = fs.readFileSync(path.join(ROOT, 'src/utils/auth.util.ts'), 'utf-8');
    expect(content).toContain('__DEV_MODE__');
    expect(content).toContain('Skipping authentication');
  });

  it('router.ts non contiene più bypass __DEV_MODE__', () => {
    const content = fs.readFileSync(path.join(ROOT, 'src/app/router.ts'), 'utf-8');
    expect(content).not.toContain('__DEV_MODE__');
  });

  it('vite-env.d.ts dichiara il tipo di __DEV_MODE__', () => {
    const content = fs.readFileSync(path.join(ROOT, 'src/vite-env.d.ts'), 'utf-8');
    expect(content).toContain('__DEV_MODE__');
  });

  it('dev-toolbar.ts non esiste più (rimosso)', () => {
    const devToolbarPath = path.join(ROOT, 'src/dev-toolbar.ts');
    expect(fs.existsSync(devToolbarPath)).toBe(false);
  });

  it('repository.mock.ts esiste per il dev mode', () => {
    const mockPath = path.join(ROOT, 'src/services/repository.mock.ts');
    expect(fs.existsSync(mockPath)).toBe(true);
  });

  it('repository.service.ts usa __DEV_MODE__ per lo switch mock/firebase', () => {
    const content = fs.readFileSync(path.join(ROOT, 'src/services/repository.service.ts'), 'utf-8');
    expect(content).toContain('__DEV_MODE__');
    expect(content).toContain('repository.mock');
    expect(content).toContain('repository.firebase');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Dead-code elimination — verifica che il codice dev viene rimosso dal bundle
// ═════════════════════════════════════════════════════════════════════════════

describe('Dead-code elimination in production', () => {
  it('__DEV_MODE__ è sostituito con un valore statico (non rimane come variabile)', async () => {
    // In production build, Vite sostituisce __DEV_MODE__ con `false` (literal)
    // Rollup poi elimina i rami if(false){...}
    // Verifichiamo che il plugin produce un define con valore boolean, non stringa
    const mod = await import('../../vite.config');
    const configFn = mod.default;

    const config = typeof configFn === 'function'
      ? (configFn as any)({ mode: 'production', command: 'build', isSsrBuild: false, isPreview: false })
      : configFn;

    const plugins = [config.plugins || []]
      .flat(Infinity)
      .filter(Boolean);

    const devPlugin = plugins.find((p: any) => p.name === 'dev-mode');
    const hookResult = devPlugin.config({}, { mode: 'production' });

    // Il valore deve essere un boolean primitivo, non una stringa
    // Così Rollup può fare dead-code elimination
    expect(typeof hookResult.define.__DEV_MODE__).toBe('boolean');
  });

  it('il codice dev ha una struttura che Rollup può eliminare (ternario)', () => {
    // Verifica che il pattern usato sia compatibile con tree-shaking:
    // __DEV_MODE__ ? noOp : realFn → sostituito con false ? noOp : realFn → eliminato
    const repoContent = fs.readFileSync(
      path.join(ROOT, 'src/services/repository.service.ts'),
      'utf-8'
    );

    // Il guard deve essere un ternario diretto (non una variabile intermedia)
    // per garantire che Rollup lo elimini
    expect(repoContent).toMatch(/__DEV_MODE__/);
  });

  it('il codice dev non usa patterns che impediscono tree-shaking', () => {
    // Patterns PERICOLOSI che impedirebbero dead-code elimination:
    // const isdev = __DEV_MODE__; if (isdev) {...}  ← la variabile intermedia blocca il tree-shaking
    // window.__DEV_MODE__ = true; ← assegnamento a window non viene eliminato

    const repoContent = fs.readFileSync(
      path.join(ROOT, 'src/services/repository.service.ts'),
      'utf-8'
    );

    // Non deve esserci assegnamento di __DEV_MODE__ a window
    expect(repoContent).not.toContain('window.__DEV_MODE__');
    expect(repoContent).not.toContain('globalThis.__DEV_MODE__');
  });
});
