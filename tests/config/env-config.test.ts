import { beforeEach, describe, expect, it, vi } from 'vitest';

// helper to clear module cache and re-import env.config
async function reloadEnv(): Promise<typeof import('../../src/config/env.config')> {
  vi.resetModules();
  return import('../../src/config/env.config');
}

describe('env.config API_BASE_URL', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // reset all environment variables between runs
    process.env = { ...originalEnv };
  });

  it('defaults to /api when no VERCEL_URL is present', async () => {
    delete process.env.VERCEL_URL;

    const { API_BASE_URL } = await reloadEnv();
    expect(API_BASE_URL).toBe('/api');
  });

  it('uses VERCEL_URL when provided', async () => {
    process.env.VERCEL_URL = 'preview-branch--myapp.vercel.app';

    const { API_BASE_URL } = await reloadEnv();
    expect(API_BASE_URL).toBe('https://preview-branch--myapp.vercel.app/api');
  });
});
