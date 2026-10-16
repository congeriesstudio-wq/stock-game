import { describe, expect, it } from 'vitest';
import { maxAffordableQuantity, orderTotal } from '../src/lib/money.js';

describe('order totals', () => {
  it('rounds buys up and sells down to the cent', () => {
    expect(orderTotal('buy', 1, 1.001)).toBe(1.01);
    expect(orderTotal('sell', 1, 1.009)).toBe(1);
    expect(orderTotal('buy', 0.000001, 100)).toBe(0.01);
    expect(orderTotal('sell', 0.000001, 100)).toBe(0);
  });
  it('lets a full dust liquidation settle at one cent', () => {
    expect(orderTotal('sell', 0.000001, 100, true)).toBe(0.01);
  });
  it('max buy uses a fraction when a whole share does not fit', () => {
    expect(maxAffordableQuantity(10, 15)).toBeGreaterThan(0);
    expect(maxAffordableQuantity(10, 15)).toBeLessThan(1);
    expect(orderTotal('buy', maxAffordableQuantity(10, 15), 15)).toBeLessThanOrEqual(10);
  });
});
