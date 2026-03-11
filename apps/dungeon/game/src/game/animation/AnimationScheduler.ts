import type { GameEvent, RunState, Pos } from '@org/shared';
import { ANIMATION_CONFIG } from './animationConfig.js';
import { EVENT_PHASE, type Phase } from './eventToPhase.js';
import type { AnimationState } from './AnimationState.js';

export type HudSignal =
  | { type: 'slotFlash' }
  | { type: 'itemFail'; reason: string }
  | { type: 'itemWhiff' };

export type HudSignalHandler = (signal: HudSignal) => void;

export interface RunOptions {
  instant?: boolean;
}

const DIR_DELTA: Record<string, Pos> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
};

const PHASES: Phase[] = ['action', 'impact', 'consequence', 'cleanup'];

export class AnimationScheduler {
  private timeouts: ReturnType<typeof setTimeout>[] = [];

  run(
    events: GameEvent[],
    animState: AnimationState,
    runState: RunState,
    onComplete: () => void,
    onHudSignal: HudSignalHandler,
    options?: RunOptions,
  ): void {
    this.cancel();

    if (options?.instant) {
      animState.done = true;
      onComplete();
      return;
    }

    // Emit HUD signals immediately (always, regardless of phase timing)
    for (const event of events) {
      if (event.type === 'slot_switched') onHudSignal({ type: 'slotFlash' });
      if (event.type === 'item_fail')     onHudSignal({ type: 'itemFail', reason: event.reason });
      if (event.type === 'item_whiff')    onHudSignal({ type: 'itemWhiff' });
    }

    // Bucket events by phase
    const byPhase = new Map<Phase, GameEvent[]>(PHASES.map(p => [p, []]));
    for (const event of events) {
      const p = EVENT_PHASE[event.type];
      if (p !== 'skip') byPhase.get(p)!.push(event);
    }

    const hasEvents = PHASES.some(p => byPhase.get(p)!.length > 0);
    if (!hasEvents) {
      animState.done = true;
      onComplete();
      return;
    }

    // Populate animState synchronously for all phases (animations start immediately).
    // Timers only control activePhase indicator and onComplete signal.
    const now = performance.now();
    let cumulativeDelay = 0;
    let lastEndTime = 0;
    let firstPhase = true;

    for (const phase of PHASES) {
      const phaseEvents = byPhase.get(phase)!;
      if (phaseEvents.length === 0) continue;

      const { duration, leadTime } = ANIMATION_CONFIG.phases[phase];
      const startDelay = cumulativeDelay;
      const endTime = startDelay + duration;
      if (endTime > lastEndTime) lastEndTime = endTime;

      // Populate animation state synchronously
      this.applyPhase(phaseEvents, animState, runState, events, now + startDelay, duration);

      // Set first phase active immediately (sync), subsequent phases via timer
      if (firstPhase) {
        animState.activePhase = phase;
        firstPhase = false;
      } else {
        const delay = startDelay;
        this.timeouts.push(setTimeout(() => {
          animState.activePhase = phase;
        }, delay));
      }

      cumulativeDelay += leadTime;
    }

    // Mark done after the last phase's duration expires
    this.timeouts.push(setTimeout(() => {
      animState.done = true;
      onComplete();
    }, lastEndTime));
  }

  cancel(): void {
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
  }

  private applyPhase(
    events: GameEvent[],
    animState: AnimationState,
    runState: RunState,
    allEvents: GameEvent[],
    now: number,
    duration: number,
  ): void {
    const player = runState.player;
    const isRangedActivate = allEvents.some(e => e.type === 'item_hit' || e.type === 'item_whiff');

    for (const event of events) {
      switch (event.type) {
        case 'move': {
          animState.entityPositions.push({
            entityId: event.entityId, kind: 'slide',
            from: event.from, to: event.to, startTime: now, duration,
          });
          break;
        }

        case 'attack':
        case 'collision_attack': {
          const targetPos = findPos(event.targetId, runState);
          const attackerPos = findPos(event.attackerId, runState) ?? player.pos;
          if (targetPos) {
            animState.entityPositions.push({
              entityId: event.attackerId, kind: 'lunge',
              from: attackerPos, to: targetPos, startTime: now, duration,
            });
          }
          animState.entityFlashes.push({
            entityId: event.targetId, rgbColor: '220,50,50',
            startTime: now, duration,
          });
          break;
        }

        case 'item_activate': {
          const delta = DIR_DELTA[event.dir] ?? { x: 0, y: 0 };
          const from = player.pos;
          if (isRangedActivate) {
            // Projectile travels 4 tiles in the given direction
            const to: Pos = { x: from.x + delta.x * 4, y: from.y + delta.y * 4 };
            animState.projectiles.push({ from, to, startTime: now, duration });
          } else {
            const to: Pos = { x: from.x + delta.x, y: from.y + delta.y };
            animState.entityPositions.push({
              entityId: player.id, kind: 'lunge',
              from, to, startTime: now, duration,
            });
          }
          break;
        }

        case 'item_hit': {
          if (event.entityId) {
            animState.entityFlashes.push({
              entityId: event.entityId, rgbColor: '220,140,50',
              startTime: now, duration,
            });
          } else {
            animState.tileFlashes.push({
              key: `${event.x},${event.y}`, rgbColor: '220,140,50',
              startTime: now, duration,
            });
          }
          break;
        }

        case 'item_whiff': {
          const activateEv = allEvents.find(
            (e): e is Extract<GameEvent, { type: 'item_activate' }> => e.type === 'item_activate',
          );
          if (activateEv) {
            const delta = DIR_DELTA[activateEv.dir] ?? { x: 0, y: 0 };
            const at: Pos = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
            animState.missIndicators.push({ at, startTime: now, duration });
          }
          break;
        }

        case 'mine_placed': {
          animState.tileFlashes.push({
            key: `${event.x},${event.y}`, rgbColor: '220,220,50',
            peakAlpha: 0.85, startTime: now, duration,
          });
          break;
        }

        case 'mine_detonated': {
          animState.bursts.push({
            x: event.x, y: event.y, tileRadiusPx: 48,
            startTime: now, duration,
          });
          break;
        }

        case 'explosion': {
          animState.bursts.push({
            x: event.x, y: event.y, tileRadiusPx: event.radius * 32,
            startTime: now, duration,
          });
          break;
        }

        case 'explosion_wall_destroyed': {
          animState.tileFlashes.push({
            key: `${event.x},${event.y}`, rgbColor: '255,255,255',
            peakAlpha: 0.9, startTime: now, duration,
          });
          break;
        }

        case 'explosion_entity_damage': {
          animState.entityFlashes.push({
            entityId: event.entityId, rgbColor: '220,140,50',
            startTime: now, duration,
          });
          break;
        }

        case 'fire_damage': {
          animState.entityFlashes.push({
            entityId: event.entityId, rgbColor: '220,80,30',
            startTime: now, duration,
          });
          break;
        }

        case 'fire_spread': {
          animState.tileFlashes.push({
            key: `${event.toX},${event.toY}`, rgbColor: '220,100,30',
            startTime: now, duration,
          });
          break;
        }

        case 'oil_ignited': {
          animState.tileFlashes.push({
            key: `${event.x},${event.y}`, rgbColor: '255,160,0',
            peakAlpha: 0.9, startTime: now, duration,
          });
          break;
        }

        case 'tile_changed': {
          animState.tileFlashes.push({
            key: `${event.x},${event.y}`, rgbColor: '255,255,255',
            peakAlpha: 0.6, startTime: now, duration,
          });
          break;
        }

        case 'mechanism_solved': {
          for (const pos of findMechanismTiles(event.mechanismId, runState)) {
            animState.tileFlashes.push({
              key: `${pos.x},${pos.y}`, rgbColor: '0,220,220',
              startTime: now, duration,
            });
          }
          break;
        }

        case 'mechanism_reset': {
          for (const pos of findMechanismTiles(event.mechanismId, runState)) {
            animState.tileFlashes.push({
              key: `${pos.x},${pos.y}`, rgbColor: '150,150,150',
              startTime: now, duration,
            });
          }
          break;
        }

        case 'interacted': {
          const pos = findInteractableTile(event.interactableId, runState);
          if (pos) {
            animState.tileFlashes.push({
              key: `${pos.x},${pos.y}`, rgbColor: '50,100,220',
              startTime: now, duration,
            });
          }
          break;
        }

        case 'death': {
          animState.entityScales.push({
            entityId: event.entityId, kind: 'collapse',
            startTime: now, duration,
          });
          break;
        }
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findPos(entityId: string, runState: RunState): Pos | undefined {
  if (entityId === 'player' || entityId === runState.player.id) return runState.player.pos;
  return runState.enemies.find(e => e.id === entityId)?.pos;
}

function findMechanismTiles(mechanismId: string, runState: RunState): Pos[] {
  const result: Pos[] = [];
  for (let y = 0; y < runState.grid.length; y++) {
    for (let x = 0; x < runState.grid[y].length; x++) {
      if (runState.grid[y][x].interactable?.id === mechanismId) {
        result.push({ x, y });
      }
    }
  }
  return result;
}

function findInteractableTile(interactableId: string, runState: RunState): Pos | undefined {
  for (let y = 0; y < runState.grid.length; y++) {
    for (let x = 0; x < runState.grid[y].length; x++) {
      if (runState.grid[y][x].interactable?.id === interactableId) return { x, y };
    }
  }
  return undefined;
}
