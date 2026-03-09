import { z } from 'zod';

export const ReconcilePatchSchema = z.object({
  runId: z.string(),
  escrowId: z.string().optional(),
  playerId: z.string().optional(),
  result: z.enum(['extracted', 'dead', 'abandoned']),
  createdAt: z.number(),
  consume: z.object({
    instances: z.array(z.string()),
    stacks: z.record(z.string(), z.number()),
  }),
  grant: z.object({
    instances: z.array(z.object({ defId: z.string(), qty: z.number().optional() })),
    stacks: z.record(z.string(), z.number()),
  }),
  durabilityUpdates: z.array(z.object({ itemId: z.string(), durability: z.number() })),
  debug: z.object({ notes: z.string().optional() }).optional(),
});

export type ReconcilePatchInput = z.infer<typeof ReconcilePatchSchema>;
