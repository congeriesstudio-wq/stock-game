import type { SupabaseClient } from '@supabase/supabase-js';

export type MarketStatus = 'open' | 'closed' | 'unknown';
export interface PriceQuote { symbol: string; price: string; quotedAt: string; source: string }
export interface HistoricalPrice { symbol: string; price: string; observedAt: string; source: string }

// Provider boundary: swap this implementation without changing trade/API code.
export interface StockPriceProvider {
  getCurrentPrice(symbol: string): Promise<PriceQuote>;
  getHistoricalPrices(symbol: string, from: string, to: string): Promise<HistoricalPrice[]>;
  getMarketStatus(): Promise<MarketStatus>;
}

// Initial simulated-feed adapter. Quotes are written by trusted seed/admin jobs only.
export class SupabaseQuoteProvider implements StockPriceProvider {
  constructor(private readonly admin: SupabaseClient, private readonly maxAgeSeconds = 900) {}

  async getCurrentPrice(symbol: string): Promise<PriceQuote> {
    const { data, error } = await this.admin.from('asset_quotes')
      .select('symbol,price,quoted_at,source').eq('symbol', symbol).maybeSingle();
    if (error || !data) throw new Error('quote_unavailable');
    const age = (Date.now() - new Date(data.quoted_at).getTime()) / 1000;
    if (!Number.isFinite(age) || age < -30 || age > this.maxAgeSeconds) throw new Error('quote_stale');
    return { symbol: data.symbol, price: String(data.price), quotedAt: data.quoted_at, source: data.source };
  }

  async getHistoricalPrices(symbol: string, from: string, to: string): Promise<HistoricalPrice[]> {
    const { data, error } = await this.admin.from('price_history').select('symbol,price,observed_at,source')
      .eq('symbol', symbol).gte('observed_at', from).lte('observed_at', to)
      .order('observed_at', { ascending: true }).limit(5000);
    if (error) throw new Error('history_unavailable');
    return (data ?? []).map((row) => ({ symbol: row.symbol, price: String(row.price), observedAt: row.observed_at, source: row.source }));
  }

  async getMarketStatus(): Promise<MarketStatus> {
    // Simulated game markets are always tradable while their season is active.
    return 'open';
  }
}
