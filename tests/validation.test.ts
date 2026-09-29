import { describe, expect, it } from 'vitest';
import { joinSeasonSchema, tradeRequestSchema } from '../src/lib/validation.js';

const valid = {
  seasonId: '00000000-0000-4000-8000-000000000001',
  symbol: 'AAPL', side: 'buy', quantity: '0.125',
  idempotencyKey: '00000000-0000-4000-8000-000000000002',
};

describe('trade request validation', () => {
  it('accepts well-formed fractional share orders', () => {
    expect(tradeRequestSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects zero, negative, excessive precision, and huge quantities', () => {
    for (const quantity of ['0', '-1', '0.0000001', '1000000001', 'Infinity']) {
      expect(tradeRequestSchema.safeParse({ ...valid, quantity }).success).toBe(false);
    }
  });
  it('rejects unknown fields and malformed symbols / idempotency keys', () => {
    expect(tradeRequestSchema.safeParse({ ...valid, price: 1 }).success).toBe(false);
    expect(tradeRequestSchema.safeParse({ ...valid, symbol: 'aapl' }).success).toBe(false);
    expect(tradeRequestSchema.safeParse({ ...valid, idempotencyKey: 'nope' }).success).toBe(false);
  });
  it('accepts a valid season join request only', () => {
    expect(joinSeasonSchema.safeParse({ seasonId: valid.seasonId }).success).toBe(true);
    expect(joinSeasonSchema.safeParse({ seasonId: valid.seasonId, startingCash: 999999 }).success).toBe(false);
  });
});
