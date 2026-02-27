/**
 * Admin Config — Unit Tests
 */
import { describe, expect, it } from 'vitest';
import { isPlayerAdmin } from '../../src/config/admin.config';

describe('isPlayerAdmin', () => {
  it('riconosce gli admin configurati', () => {
    expect(isPlayerAdmin(25)).toBe(true);  // Andrea Gargaro
    expect(isPlayerAdmin(18)).toBe(true);  // Francesco Molinari
    expect(isPlayerAdmin(22)).toBe(true);  // Michele Sette
    expect(isPlayerAdmin(13)).toBe(true);  // Michele Lillo
  });

  it('rifiuta ID non admin', () => {
    expect(isPlayerAdmin(1)).toBe(false);
    expect(isPlayerAdmin(99)).toBe(false);
    expect(isPlayerAdmin(999)).toBe(false);
    expect(isPlayerAdmin(12)).toBe(false);
    expect(isPlayerAdmin(26)).toBe(false);
  });

  it('gestisce null e undefined', () => {
    expect(isPlayerAdmin(null)).toBe(false);
    expect(isPlayerAdmin(undefined)).toBe(false);
  });

  it('gestisce 0 (falsy)', () => {
    expect(isPlayerAdmin(0)).toBe(false);
  });

  it('gestisce numeri negativi', () => {
    expect(isPlayerAdmin(-1)).toBe(false);
    expect(isPlayerAdmin(-25)).toBe(false);
  });
});
