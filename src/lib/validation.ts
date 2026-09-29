import { z } from 'zod';

const uuid = z.string().uuid();
const decimalQuantity = z.union([z.string(), z.number()]).transform(String)
  .refine((v) => /^\d+(\.\d{1,6})?$/.test(v), 'Quantity must be a positive decimal with at most 6 decimal places.')
  .refine((v) => Number(v) > 0 && Number(v) <= 1_000_000_000, 'Quantity is outside the supported range.');

export const tradeRequestSchema = z.object({
  seasonId: uuid,
  symbol: z.string().regex(/^[A-Z][A-Z0-9.]{0,9}$/),
  side: z.enum(['buy', 'sell']),
  quantity: decimalQuantity,
  idempotencyKey: uuid,
}).strict();

export const joinSeasonSchema = z.object({ seasonId: uuid }).strict();
