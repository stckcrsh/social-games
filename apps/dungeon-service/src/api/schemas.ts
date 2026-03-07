import { z } from 'zod';

const DirectionSchema = z.enum(['N', 'E', 'S', 'W']);

export const PlayerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'),       dir: DirectionSchema }),
  z.object({ type: z.literal('attack'),     dir: DirectionSchema }),
  z.object({ type: z.literal('dash'),       dir: DirectionSchema }),
  z.object({ type: z.literal('useActive'),  dir: DirectionSchema }),
  z.object({ type: z.literal('switchSlot') }),
  z.object({ type: z.literal('interact') }),
  z.object({ type: z.literal('wait') }),
]);

export const RunConfigSchema = z.object({
  width:                      z.number().int().min(5).max(100).optional(),
  height:                     z.number().int().min(5).max(100).optional(),
  allowDiagonalCornerCutting: z.boolean().optional(),
  dashDistance:               z.number().int().min(1).max(10).optional(),
  chargerDashDistance:        z.number().int().min(1).max(10).optional(),
});

export const ProfileSchema = z.object({
  inventory: z.record(z.string(), z.number().int().min(0)).default({}),
  loadout: z.object({
    slotA: z.string().nullable().default(null),
    slotB: z.string().nullable().default(null),
    activeSlot: z.enum(['A', 'B']).default('A'),
  }).default({ slotA: null, slotB: null, activeSlot: 'A' }),
}).default({ inventory: {}, loadout: { slotA: null, slotB: null, activeSlot: 'A' } });

export const CreateRunSchema = z.object({
  preset: z.enum(['default', 'open', 'maze', 'oil_trap', 'terminal_door',
                  'fire_stress', 'mine_chain', 'ai_maze_regression',
                  'kill_room', 'exit_room']).optional(),
  config: RunConfigSchema.optional(),
  profile: ProfileSchema,
  debug: z.boolean().optional(),
  metaMode: z.enum(['bypass', 'strict']).optional(),
  playerId: z.string().optional(),
  escrowId: z.string().optional(),
});

export const TickSchema = z.object({
  action: PlayerActionSchema.optional(),
});

export const DebugOilSchema = z.object({ x: z.number().int(), y: z.number().int() });
export const DebugExplodeSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  radius: z.number().int().min(1).max(10).optional(),
});
