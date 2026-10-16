export type HistoryTrade = {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  at: string;
};

export type HistoryQuote = { symbol: string; price: number; at: string };

export type PortfolioHistoryInput = {
  startingCash: number;
  seasonStart: string;
  trades: HistoryTrade[];
  quotes: HistoryQuote[];
  now: string;
  cash: number;
  holdings: { symbol: string; quantity: number }[];
  prices: Record<string, number>;
};

const cents = (value: number) => Math.round(value * 100) / 100;

function downsample<T>(rows: T[], limit: number): T[] {
  if (rows.length <= limit) return rows;
  const out: T[] = [];
  const last = rows.length - 1;
  for (let i = 0; i < limit; i++) out.push(rows[Math.round((i * last) / (limit - 1))]!);
  return out;
}

/** Replay fills against quote history so the chart is more than [start, now]. */
export function buildPortfolioHistory(input: PortfolioHistoryInput): { values: number[]; dates: string[] } {
  const trades = [...input.trades].sort((a, b) => a.at.localeCompare(b.at));
  const quotesByTime = new Map<string, { symbol: string; price: number }[]>();
  for (const quote of input.quotes) {
    if (quote.at < input.seasonStart) continue;
    const bucket = quotesByTime.get(quote.at) ?? [];
    bucket.push({ symbol: quote.symbol, price: quote.price });
    quotesByTime.set(quote.at, bucket);
  }
  const quoteTimes = [...quotesByTime.keys()].sort();
  let cash = input.startingCash;
  const qty = new Map<string, number>();
  const last = new Map<string, number>();
  let ti = 0;
  const samples: { at: string; value: number }[] = [];

  const mark = (at: string) => {
    let value = cash;
    for (const [symbol, quantity] of qty) {
      const price = last.get(symbol);
      if (quantity > 0 && price != null) value += quantity * price;
    }
    samples.push({ at, value: cents(value) });
  };
  const apply = (trade: HistoryTrade) => {
    const held = qty.get(trade.symbol) ?? 0;
    if (trade.side === 'buy') {
      cash -= trade.total;
      qty.set(trade.symbol, held + trade.quantity);
    } else {
      cash += trade.total;
      const next = held - trade.quantity;
      if (next <= 1e-8) qty.delete(trade.symbol);
      else qty.set(trade.symbol, next);
    }
    last.set(trade.symbol, trade.price);
  };

  mark(input.seasonStart);
  for (const at of quoteTimes) {
    while (ti < trades.length && trades[ti].at <= at) apply(trades[ti++]!);
    for (const quote of quotesByTime.get(at) ?? []) last.set(quote.symbol, quote.price);
    mark(at);
  }
  while (ti < trades.length) apply(trades[ti++]!);

  const live = cents(input.cash + input.holdings.reduce((sum, holding) => sum + holding.quantity * (input.prices[holding.symbol] ?? 0), 0));
  const tail = samples[samples.length - 1];
  if (!tail || tail.at !== input.now) samples.push({ at: input.now, value: live });
  else tail.value = live;

  const compact = downsample(samples, 48);
  return { values: compact.map((sample) => sample.value), dates: compact.map((sample) => sample.at) };
}
