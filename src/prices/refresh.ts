import type { SupabaseClient } from '@supabase/supabase-js';

/** Bounded random walk used by the scheduler and by a stale-quote retry inside trades. */
export async function refreshSimulatedQuotes(admin: SupabaseClient) {
  const { data: quotes, error: readError } = await admin.from('asset_quotes').select('symbol,price');
  if (readError || !quotes?.length) return { ok: false as const, reason: 'quote_unavailable' as const };
  const quotedAt = new Date().toISOString();
  const updates = quotes.map((quote) => {
    const next = Math.max(0.01, Number(quote.price) * (1 + (Math.random() - 0.5) * 0.004));
    return { symbol: quote.symbol, price: next.toFixed(6), quoted_at: quotedAt, source: 'simulated' };
  });
  const { data, error } = await admin.rpc('publish_quotes', { p_quotes: updates });
  if (error) return { ok: false as const, reason: 'quote_publish_failed' as const, error };
  return { ok: true as const, updated: data, quotedAt };
}
