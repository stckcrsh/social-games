import { z } from 'zod';

export const GrantItemsBodySchema = z.object({
  playerId: z.string().uuid(),
  items: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('stack'), defId: z.string(), qty: z.number().int().positive() }),
      z.object({ kind: z.literal('instance'), defId: z.string(), qty: z.number().int().positive() }),
    ])
  ).min(1),
});

export const BurnItemsBodySchema = z.object({
  playerId: z.string().uuid(),
  items: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('stack'), defId: z.string(), qty: z.number().int().positive() }),
      z.object({ kind: z.literal('instance'), itemId: z.string().uuid() }),
    ])
  ).min(1),
});

export const TransferItemsBodySchema = z.object({
  fromPlayerId: z.string().uuid(),
  toPlayerId: z.string().uuid(),
  items: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('stack'), defId: z.string(), qty: z.number().int().positive() }),
      z.object({ kind: z.literal('instance'), itemId: z.string().uuid() }),
    ])
  ).min(1),
});

export type GrantItemsBody = z.infer<typeof GrantItemsBodySchema>;
export type BurnItemsBody = z.infer<typeof BurnItemsBodySchema>;
export type TransferItemsBody = z.infer<typeof TransferItemsBodySchema>;
