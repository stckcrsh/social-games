import { z } from 'zod';

export const ItemCategorySchema = z.enum(['consumable', 'gear', 'trinket', 'material', 'currency']);
export const ItemRaritySchema = z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']);

export const ItemDefSchema = z.object({
  defId: z.string().min(1),
  name: z.string().min(1),
  category: ItemCategorySchema,
  rarity: ItemRaritySchema,
  stackable: z.boolean(),
  maxStack: z.number().int().positive(),
  description: z.string(),
  effects: z.record(z.unknown()),
  tradeable: z.boolean(),
});

export const GrantEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stack'), defId: z.string(), qty: z.number().int().positive() }),
  z.object({ kind: z.literal('instance'), defId: z.string(), qty: z.number().int().positive() }),
]);

export const OfferStockSchema = z.union([
  z.literal('infinite'),
  z.object({ kind: z.literal('limited'), remaining: z.number().int().min(0) }),
]);

export const ShopOfferSchema = z.object({
  offerId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  price: z.array(z.object({ defId: z.string(), qty: z.number().int().positive() })),
  grant: z.array(GrantEntrySchema).min(1),
  stock: OfferStockSchema,
  limitPerPlayer: z.number().int().positive().optional(),
  availability: z.object({ kind: z.enum(['always', 'daily', 'weekly']) }).optional(),
  requires: z
    .array(z.object({ role: z.string().optional(), unlockFlag: z.string().optional() }))
    .optional(),
});

export const ItemDefsFileSchema = z.record(ItemDefSchema);
export const ShopOffersFileSchema = z.record(ShopOfferSchema);
