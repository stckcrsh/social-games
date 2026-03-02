import { z } from 'zod';

export const PurchaseBodySchema = z.object({
  offerId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(128),
});

export type PurchaseBody = z.infer<typeof PurchaseBodySchema>;
