import type { GameState, Holding, Player, PortfolioMetrics, Stock, Trade, TradeRequest, TradeResult } from '../types.js';
import { apiFetch } from './apiClient.js';
import { supabase } from './supabaseClient.js';

const COLORS = ['#8b79ff', '#67c6ff', '#ff776f', '#58d8ad', '#ffbc66', '#4f9cff', '#f09bd2'];
const colorFor = (symbol: string) => COLORS[[...symbol].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const must = <T,>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error || res.data === null) throw new Error(res.error?.message ?? 'Request failed');
  return res.data;
};

type Season = { id: string; name: string; starts_at: string; ends_at: string; starting_cash: number | string };
let seasonPromise: Promise<Season> | null = null;
let portfolioPromise: Promise<{ id: string; season: Season; userId: string }> | null = null;

export function resetLiveState() { seasonPromise = null; portfolioPromise = null; }

function activeSeason() {
  seasonPromise ??= (async () => {
    const rows = must(await supabase.from('seasons').select('id,name,starts_at,ends_at,starting_cash').eq('status', 'active').order('starts_at', { ascending: false }).limit(1));
    if (!rows.length) throw new Error('No active season is available right now.');
    return rows[0] as Season;
  })().catch((e) => { seasonPromise = null; throw e; });
  return seasonPromise;
}

// Finds the user's portfolio for the active season, joining the season through the API on first use.
function ensurePortfolio() {
  portfolioPromise ??= (async () => {
    const season = await activeSeason();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Please log in again.');
    const find = async () => (await supabase.from('portfolios').select('id').eq('season_id', season.id).eq('user_id', userId).maybeSingle()).data;
    let row = await find();
    if (!row) {
      await apiFetch('/api/seasons/join', { method: 'POST', body: JSON.stringify({ seasonId: season.id }) });
      row = await find();
    }
    if (!row) throw new Error('Could not join the season.');
    return { id: row.id as string, season, userId };
  })().catch((e) => { portfolioPromise = null; throw e; });
  return portfolioPromise;
}

async function fetchStocks(): Promise<Stock[]> {
  const [assets, quotes] = await Promise.all([
    supabase.from('assets').select('symbol,name').eq('active', true).order('symbol'),
    supabase.from('asset_quotes').select('symbol,price'),
  ]);
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const hist = must(await supabase.from('price_history').select('symbol,price,observed_at').gte('observed_at', since).order('observed_at', { ascending: true }).limit(5000));
  const bySymbol = new Map<string, number[]>();
  for (const h of hist) bySymbol.set(h.symbol, [...(bySymbol.get(h.symbol) ?? []), Number(h.price)]);
  const price = new Map(must(quotes).map((q) => [q.symbol, Number(q.price)]));
  return must(assets).filter((a) => price.has(a.symbol)).map((a) => {
    const p = price.get(a.symbol)!;
    const series = bySymbol.get(a.symbol) ?? [];
    const base = series[0] ?? p;
    const history = series.length >= 2 ? [...series.slice(-47), p] : [base, p];
    const change = p - base;
    return { symbol: a.symbol, name: a.name, price: p, change, changePct: base ? (change / base) * 100 : 0, color: colorFor(a.symbol), sector: 'Equity', volume: '—', marketCap: '—', history };
  });
}

const formatDate = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function fetchPortfolio() {
  const { id, season } = await ensurePortfolio();
  const [stocks, cashRes, holdRes, tradeRes] = await Promise.all([
    fetchStocks(),
    supabase.from('cash_balances').select('balance').eq('portfolio_id', id).single(),
    supabase.from('holdings').select('symbol,quantity,average_cost').eq('portfolio_id', id),
    supabase.from('trades').select('id,symbol,side,quantity,unit_price,created_at').eq('portfolio_id', id).order('created_at', { ascending: false }).limit(12),
  ]);
  const cash = Number(must(cashRes).balance);
  const start = Number(season.starting_cash);
  const priceOf = new Map(stocks.map((s) => [s.symbol, s]));
  const holdings: Holding[] = must(holdRes).map((h) => ({ symbol: h.symbol, quantity: Number(h.quantity), avgCost: Number(h.average_cost) }));
  const invested = holdings.reduce((sum, h) => sum + h.quantity * (priceOf.get(h.symbol)?.price ?? h.avgCost), 0);
  const totalValue = cash + invested;
  const enriched = holdings.map((h) => {
    const price = priceOf.get(h.symbol)?.price ?? h.avgCost;
    const marketValue = h.quantity * price;
    return { ...h, marketValue, profitLoss: h.quantity * (price - h.avgCost), returnPct: h.avgCost ? ((price - h.avgCost) / h.avgCost) * 100 : 0, allocationPct: totalValue ? (marketValue / totalValue) * 100 : 0 };
  });
  const metrics: PortfolioMetrics = {
    totalValue, totalGainLoss: totalValue - start, totalReturnPct: start ? ((totalValue - start) / start) * 100 : 0,
    dailyGainLoss: holdings.reduce((sum, h) => sum + h.quantity * (priceOf.get(h.symbol)?.change ?? 0), 0),
    investedValue: invested, cashAllocationPct: totalValue ? (cash / totalValue) * 100 : 0, startingBalance: start,
  };
  const trades: Trade[] = must(tradeRes).map((t) => ({ id: t.id, symbol: t.symbol, side: t.side, quantity: Number(t.quantity), price: Number(t.unit_price), date: formatDate(t.created_at) }));
  return { cash, holdings: enriched, trades, metrics, history: [start, totalValue] };
}

type LeaderRow = { user_id: string; display_name: string; portfolio_value: number | string; rank: number | string };
async function fetchLeaderboardRows() {
  const { season, userId } = await ensurePortfolio();
  const res = await apiFetch<{ data: LeaderRow[] }>(`/api/seasons/leaderboard?seasonId=${season.id}`);
  return { rows: res.data, season, userId };
}
const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';

export const liveApi = {
  getStocks: fetchStocks,
  getPortfolio: fetchPortfolio,
  async getLeaderboard(): Promise<Player[]> {
    const { rows, season, userId } = await fetchLeaderboardRows();
    const start = Number(season.starting_cash);
    return rows.map((r) => ({ rank: Number(r.rank), name: r.display_name, initials: initials(r.display_name), value: Number(r.portfolio_value), returnPct: start ? ((Number(r.portfolio_value) - start) / start) * 100 : 0, you: r.user_id === userId })).sort((a, b) => a.rank - b.rank);
  },
  async getGameState(): Promise<GameState> {
    const { rows, season, userId } = await fetchLeaderboardRows();
    const all = must(await supabase.from('seasons').select('id').lte('starts_at', season.starts_at));
    const mine = rows.find((r) => r.user_id === userId);
    return {
      seasonNumber: all.length, seasonName: season.name,
      daysRemaining: Math.max(0, Math.ceil((new Date(season.ends_at).getTime() - Date.now()) / 86_400_000)),
      endsOn: new Date(season.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      playerLevel: 1, playerTitle: 'Trader', streakDays: 0, rank: mine ? Number(mine.rank) : rows.length + 1, playerCount: rows.length, startingBalance: Number(season.starting_cash),
    };
  },
  async submitTrade(req: TradeRequest): Promise<TradeResult> {
    const { season } = await ensurePortfolio();
    await apiFetch('/api/trades', { method: 'POST', body: JSON.stringify({ seasonId: season.id, symbol: req.symbol, side: req.side, quantity: String(req.quantity), idempotencyKey: crypto.randomUUID() }) });
    const p = await fetchPortfolio();
    return { trade: p.trades[0], cash: p.cash, holding: p.holdings.find((h) => h.symbol === req.symbol) ?? null, metrics: p.metrics, holdings: p.holdings, trades: p.trades, history: p.history };
  },
};
