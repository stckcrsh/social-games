import { z } from 'zod';

const TradeItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stack'), defId: z.string(), qty: z.number().int().positive() }),
  z.object({ kind: z.literal('instance'), itemId: z.string().uuid() }),
]);

export const ProposeTradeSchema = z.object({
  targetPlayerId: z.string().uuid(),
  offerItems: z.array(TradeItemSchema).min(1),
});

export const CounterTradeSchema = z.object({
  counterItems: z.array(TradeItemSchema).min(1),
});

export type ProposeTradeBody = z.infer<typeof ProposeTradeSchema>;
export type CounterTradeBody = z.infer<typeof CounterTradeSchema>;
