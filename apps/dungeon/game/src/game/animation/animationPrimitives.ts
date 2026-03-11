import type { Pos } from '@org/shared';

/** Linear interpolation between two tile positions. */
export function slide(from: Pos, to: Pos, progress: number): Pos {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

/**
 * Nudge attacker 30% toward target then snap back.
 * progress 0→0.5 = extend; 0.5→1 = retract.
 */
export function lunge(origin: Pos, toward: Pos, progress: number): Pos {
  const t = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
  const amount = 0.3 * t;
  return {
    x: origin.x + (toward.x - origin.x) * amount,
    y: origin.y + (toward.y - origin.y) * amount,
  };
}

/**
 * Returns a CSS rgba string for an entity flash overlay.
 * rgbColor e.g. '255,0,0'. Alpha fades from 1 → 0.
 */
export function flash(rgbColor: string, progress: number): string {
  const alpha = Math.max(0, 1 - progress);
  return `rgba(${rgbColor},${alpha.toFixed(2)})`;
}

/**
 * Miss indicator alpha: ramps up quickly to peak at progress=0.2, then fades.
 */
export function missIndicator(progress: number): { alpha: number } {
  let alpha: number;
  if (progress < 0.2) {
    alpha = progress / 0.2;
  } else {
    // Decay from peak at 0.2 to 0 at progress 1
    const decay = (progress - 0.2) / (1 - 0.2);
    alpha = (1 - decay) * (1 - decay);
  }
  return { alpha: Math.max(0, alpha) };
}

export interface BurstFrame {
  radiusPx: number;
  alpha: number;
}

/**
 * Expanding circle with fade. tileRadiusPx = max pixel radius.
 */
export function burst(tileRadiusPx: number, progress: number): BurstFrame {
  return {
    radiusPx: tileRadiusPx * progress,
    alpha: Math.max(0, 1 - progress),
  };
}

/**
 * Tile color overlay. rgbColor e.g. '255,255,0'. Fades from peakAlpha → 0.
 */
export function tileFlash(rgbColor: string, progress: number, peakAlpha = 0.7): string {
  const alpha = Math.max(0, peakAlpha * (1 - progress));
  return `rgba(${rgbColor},${alpha.toFixed(2)})`;
}

/** Entity shrinks and fades to zero. */
export function collapse(progress: number): { scale: number; alpha: number } {
  return { scale: 1 - progress, alpha: 1 - progress };
}

/** Board object scales up from 0. */
export function appear(progress: number): { scale: number } {
  return { scale: progress };
}

/** Traveling projectile: simple linear interpolation between two tile positions. */
export function projectile(from: Pos, to: Pos, progress: number): Pos {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}
