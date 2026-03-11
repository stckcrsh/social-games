import { describe, it, expect } from 'vitest';
import {
  slide, lunge, flash, missIndicator, burst, tileFlash, collapse, appear, projectile,
} from './animationPrimitives.js';

function parseAlpha(rgba: string): number {
  const m = rgba.match(/rgba\(\d+,\d+,\d+,([\d.]+)\)/);
  return m ? parseFloat(m[1]) : -1;
}

describe('slide', () => {
  it('returns from at progress=0', () => {
    expect(slide({ x: 0, y: 0 }, { x: 4, y: 2 }, 0)).toEqual({ x: 0, y: 0 });
  });
  it('returns to at progress=1', () => {
    expect(slide({ x: 0, y: 0 }, { x: 4, y: 2 }, 1)).toEqual({ x: 4, y: 2 });
  });
  it('returns midpoint at progress=0.5', () => {
    expect(slide({ x: 0, y: 0 }, { x: 4, y: 2 }, 0.5)).toEqual({ x: 2, y: 1 });
  });
});

describe('lunge', () => {
  const origin = { x: 0, y: 0 };
  const toward = { x: 4, y: 0 };
  it('stays at origin at progress=0', () => {
    const r = lunge(origin, toward, 0);
    expect(r.x).toBeCloseTo(0);
  });
  it('is 30% toward target at progress=0.5 (peak extend)', () => {
    const r = lunge(origin, toward, 0.5);
    expect(r.x).toBeCloseTo(1.2); // 4 * 0.3
  });
  it('returns to origin at progress=1', () => {
    const r = lunge(origin, toward, 1);
    expect(r.x).toBeCloseTo(0);
  });
});

describe('flash', () => {
  it('full alpha at progress=0', () => {
    expect(parseAlpha(flash('255,0,0', 0))).toBeCloseTo(1);
  });
  it('zero alpha at progress=1', () => {
    expect(parseAlpha(flash('255,0,0', 1))).toBeCloseTo(0);
  });
  it('alpha decreases as progress increases', () => {
    expect(parseAlpha(flash('255,0,0', 0.3))).toBeGreaterThan(
      parseAlpha(flash('255,0,0', 0.7)),
    );
  });
});

describe('missIndicator', () => {
  it('alpha is ~1 at progress=0.2 (peak)', () => {
    expect(missIndicator(0.2).alpha).toBeCloseTo(1);
  });
  it('alpha is 0 at progress=1', () => {
    expect(missIndicator(1).alpha).toBeCloseTo(0);
  });
  it('alpha at 0.6 is less than at 0.1', () => {
    expect(missIndicator(0.6).alpha).toBeLessThan(missIndicator(0.1).alpha);
  });
});

describe('burst', () => {
  it('radiusPx is 0 at progress=0', () => {
    expect(burst(100, 0).radiusPx).toBe(0);
  });
  it('radiusPx reaches tileRadiusPx at progress=1', () => {
    expect(burst(100, 1).radiusPx).toBe(100);
  });
  it('alpha starts at 1, ends at 0', () => {
    expect(burst(100, 0).alpha).toBe(1);
    expect(burst(100, 1).alpha).toBe(0);
  });
  it('radius at 0.5 is greater than at 0.25', () => {
    expect(burst(100, 0.5).radiusPx).toBeGreaterThan(burst(100, 0.25).radiusPx);
  });
});

describe('tileFlash', () => {
  it('alpha at progress=0 equals peakAlpha', () => {
    expect(parseAlpha(tileFlash('255,255,255', 0, 0.7))).toBeCloseTo(0.7);
  });
  it('alpha at progress=1 is 0', () => {
    expect(parseAlpha(tileFlash('255,255,255', 1, 0.7))).toBeCloseTo(0);
  });
});

describe('collapse', () => {
  it('scale=1, alpha=1 at progress=0', () => {
    expect(collapse(0)).toEqual({ scale: 1, alpha: 1 });
  });
  it('scale=0, alpha=0 at progress=1', () => {
    expect(collapse(1)).toEqual({ scale: 0, alpha: 0 });
  });
});

describe('appear', () => {
  it('scale=0 at progress=0', () => {
    expect(appear(0)).toEqual({ scale: 0 });
  });
  it('scale=1 at progress=1', () => {
    expect(appear(1)).toEqual({ scale: 1 });
  });
});

describe('projectile', () => {
  it('returns from at progress=0', () => {
    expect(projectile({ x: 0, y: 0 }, { x: 4, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
  });
  it('returns to at progress=1', () => {
    expect(projectile({ x: 0, y: 0 }, { x: 4, y: 0 }, 1)).toEqual({ x: 4, y: 0 });
  });
  it('returns midpoint at progress=0.5', () => {
    expect(projectile({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.5)).toEqual({ x: 2, y: 0 });
  });
});
