import type { Pos } from '@org/shared';
import type { Phase } from './eventToPhase.js';

/** Entity sliding or lunging between tile positions. */
export interface EntityPositionAnim {
  entityId: string;
  kind: 'slide' | 'lunge';
  from: Pos;
  to: Pos;
  startTime: number;  // performance.now() when this anim started
  duration: number;   // ms
}

/** Color flash overlay on an entity. */
export interface EntityFlashAnim {
  entityId: string;
  rgbColor: string;   // e.g. '220,50,50'
  startTime: number;
  duration: number;
}

/** Entity scaling (collapse for death). */
export interface EntityScaleAnim {
  entityId: string;
  kind: 'collapse';
  startTime: number;
  duration: number;
}

/** Tile color overlay. */
export interface TileFlashAnim {
  key: string;        // 'x,y'
  rgbColor: string;
  peakAlpha?: number; // default 0.7
  startTime: number;
  duration: number;
}

/** Expanding burst circle (explosion, mine detonation). */
export interface BurstAnim {
  x: number;
  y: number;
  tileRadiusPx: number;
  startTime: number;
  duration: number;
}

/** Traveling projectile between two tile positions. */
export interface ProjectileAnim {
  from: Pos;
  to: Pos;
  startTime: number;
  duration: number;
}

/** Miss indicator at a tile (X mark / fade). */
export interface MissAnim {
  at: Pos;
  startTime: number;
  duration: number;
}

export interface AnimationState {
  entityPositions: EntityPositionAnim[];
  entityFlashes:   EntityFlashAnim[];
  entityScales:    EntityScaleAnim[];
  tileFlashes:     TileFlashAnim[];
  bursts:          BurstAnim[];
  projectiles:     ProjectileAnim[];
  missIndicators:  MissAnim[];
  activePhase:     Phase | null;
  done:            boolean;
}

export function emptyAnimationState(): AnimationState {
  return {
    entityPositions: [],
    entityFlashes:   [],
    entityScales:    [],
    tileFlashes:     [],
    bursts:          [],
    projectiles:     [],
    missIndicators:  [],
    activePhase:     null,
    done:            false,
  };
}
