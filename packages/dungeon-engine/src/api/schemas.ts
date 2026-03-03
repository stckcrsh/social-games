import { z } from 'zod';

const DirectionSchema = z.enum(['N', 'E', 'S', 'W']);

export const PlayerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'),     dir: DirectionSchema }),
  z.object({ type: z.literal('attack'),   dir: DirectionSchema }),
  z.object({ type: z.literal('dash'),     dir: DirectionSchema }),
  z.object({ type: z.literal('useItem'),  itemId: z.string() }),
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

export const CreateRunSchema = z.object({
  preset: z.enum(['default', 'open', 'maze']).optional(),
  config: RunConfigSchema.optional(),
});
