import { describe, expect, it } from 'vitest';
import { buildPortfolioHistory } from '../src/lib/portfolioHistory.js';
import { axisLabels, linePath, sliceSeries } from '../src/components/chartGeometry.js';

describe('portfolio history', () => {
  it('marks the book to quote history instead of a two-point line', () => {
    const series = buildPortfolioHistory({
      startingCash: 100, seasonStart: '2026-10-01T00:00:00.000Z', now: '2026-10-03T00:00:00.000Z',
      cash: 90, holdings: [{ symbol: 'AAPL', quantity: 1 }], prices: { AAPL: 12 },
      trades: [{ symbol: 'AAPL', side: 'buy', quantity: 1, price: 10, total: 10, at: '2026-10-01T12:00:00.000Z' }],
      quotes: [
        { symbol: 'AAPL', price: 10, at: '2026-10-01T12:00:00.000Z' },
        { symbol: 'AAPL', price: 11, at: '2026-10-02T00:00:00.000Z' },
        { symbol: 'AAPL', price: 12, at: '2026-10-03T00:00:00.000Z' },
      ],
    });
    expect(series.values.length).toBeGreaterThan(2);
    expect(series.values.at(-1)).toBe(102);
    expect(series.dates).toHaveLength(series.values.length);
  });
});

describe('chart geometry', () => {
  it('draws a one-point series without NaN', () => {
    const path = linePath([42], 100, 40, 2);
    expect(path).not.toContain('NaN');
    expect(path.startsWith('M ')).toBe(true);
  });
  it('slices a dated series for the selected range and labels real dates', () => {
    const dates = ['2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z', '2026-10-16T00:00:00.000Z'];
    const sliced = sliceSeries([1, 2, 3], dates, '1D');
    expect(sliced.values).toEqual([2, 3]);
    expect(axisLabels(sliced.dates, sliced.values.length).join(' ')).not.toContain('Sep 23');
    expect(axisLabels(undefined, 4).join(' ')).not.toContain('Sep 23');
  });
});
