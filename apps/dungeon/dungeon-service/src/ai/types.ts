import type { Entity, Grid, RunConfig } from '@org/shared';

export interface AiContext {
  self: Entity;
  player: Entity;
  grid: Grid;
  entities: Entity[];  // all living entities including player
  overclock: number;
  config: RunConfig;
}

export interface Intent {
  type: 'move' | 'none';
  dx?: number;
  dy?: number;
  meta?: unknown;
}

export type AiBehavior = (ctx: AiContext) => Intent;
