import type { GameState, Player, PortfolioSnapshot, Stock, Trade, TradeRequest, TradeResult } from '../types.js';
import { buildPortfolioHistory } from '../lib/portfolioHistory.js';
import { formatQuantity } from '../lib/money.js';
import { apiFetch } from './apiClient.js';
import { supabase } from './supabaseClient.js';

const COLORS = ['#8b79ff', '#67c6ff', '#ff776f', '#58d8ad', '#ffbc66', '#4f9cff', '#f09bd2'];
const colorFor = (symbol: string) => COLORS[[...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length]!;
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
  })().catch((error) => { seasonPromise = null; throw error; });
  return seasonPromise;
}

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
  })().catch((error) => { portfolioPromise = null; throw error; });
  return portfolioPromise;
}

const formatDate = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function fetchStocks(): Promise<Stock[]> {
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const [assets, quotes, histRes] = await Promise.all([
    supabase.from('assets').select('symbol,name,active').order('symbol'),
    supabase.from('asset_quotes').select('symbol,price'),
    supabase.from('price_history').select('symbol,price,observed_at').gte('observed_at', since).order('observed_at', { ascending: true }).limit(5000),
  ]);
  const series = new Map<string, { price: number; at: string }[]>();
  for (const row of must(histRes)) {
    const list = series.get(row.symbol) ?? [];
    list.push({ price: Number(row.price), at: row.observed_at });
    series.set(row.symbol, list);
  }
  const price = new Map(must(quotes).map((quote) => [quote.symbol, Number(quote.price)]));
  return must(assets).filter((asset) => price.has(asset.symbol)).map((asset) => {
    const current = price.get(asset.symbol)!;
    const points = series.get(asset.symbol) ?? [];
    const history = points.map((point) => point.price);
    const historyDates = points.map((point) => point.at);
    if (!history.length || history[history.length - 1] !== current) {
      history.push(current);
      historyDates.push(new Date().toISOString());
    }
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const baseline = [...points].reverse().find((point) => new Date(point.at).getTime() <= dayStart.getTime())?.price ?? points[0]?.price ?? current;
    const change = current - baseline;
    return {
      symbol: asset.symbol, name: asset.name, price: current, change, changePct: baseline ? (change / baseline) * 100 : 0,
      color: colorFor(asset.symbol), sector: 'Equity', volume: '—', marketCap: '—', history, historyDates, active: asset.active !== false,
    };
  });
}

async function fetchPortfolio(): Promise<PortfolioSnapshot> {
  const { id, season } = await ensurePortfolio();
  const [cashRes, holdRes, tradeRes] = await Promise.all([
    supabase.from('cash_balances').select('balance').eq('portfolio_id', id).single(),
    supabase.from('holdings').select('symbol,quantity,average_cost').eq('portfolio_id', id),
    supabase.from('trades').select('id,symbol,side,quantity,unit_price,total_amount,created_at').eq('portfolio_id', id).order('created_at', { ascending: true }).limit(1000),
  ]);
  const stocks = await fetchStocks();
  const cash = Number(must(cashRes).balance);
  const start = Number(season.starting_cash);
  const priceOf = new Map(stocks.map((stock) => [stock.symbol, stock]));
  const holdings = must(holdRes).map((holding) => ({ symbol: holding.symbol, quantity: Number(holding.quantity), avgCost: Number(holding.average_cost) }));
  const tradeRows = must(tradeRes);
  const symbols = [...new Set([...holdings.map((holding) => holding.symbol), ...tradeRows.map((trade) => trade.symbol)])];
  const historyRes = symbols.length
    ? await supabase.from('price_history').select('symbol,price,observed_at').in('symbol', symbols).gte('observed_at', season.starts_at).order('observed_at', { ascending: true }).limit(5000)
    : { data: [], error: null };
  const quotes = (historyRes.error ? [] : historyRes.data ?? []).map((row) => ({ symbol: row.symbol, price: Number(row.price), at: row.observed_at }));
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const boughtToday = new Map<string, number>();
  for (const trade of tradeRows) {
    if (new Date(trade.created_at) < dayStart) continue;
    const signed = trade.side === 'buy' ? Number(trade.quantity) : -Number(trade.quantity);
    boughtToday.set(trade.symbol, (boughtToday.get(trade.symbol) ?? 0) + signed);
  }
  const invested = holdings.reduce((sum, holding) => sum + holding.quantity * (priceOf.get(holding.symbol)?.price ?? holding.avgCost), 0);
  const totalValue = cash + invested;
  const enriched = holdings.map((holding) => {
    const price = priceOf.get(holding.symbol)?.price ?? holding.avgCost;
    const marketValue = holding.quantity * price;
    return {
      ...holding, marketValue, profitLoss: holding.quantity * (price - holding.avgCost),
      returnPct: holding.avgCost ? ((price - holding.avgCost) / holding.avgCost) * 100 : 0,
      allocationPct: totalValue ? (marketValue / totalValue) * 100 : 0,
    };
  });
  const dailyGainLoss = holdings.reduce((sum, holding) => {
    const stock = priceOf.get(holding.symbol);
    const openedToday = Math.max(0, boughtToday.get(holding.symbol) ?? 0);
    const eligible = Math.max(0, holding.quantity - openedToday);
    return sum + eligible * (stock?.change ?? 0);
  }, 0);
  const metrics = {
    totalValue, totalGainLoss: totalValue - start, totalReturnPct: start ? ((totalValue - start) / start) * 100 : 0,
    dailyGainLoss, investedValue: invested, cashAllocationPct: totalValue ? (cash / totalValue) * 100 : 0, startingBalance: start,
  };
  const trades: Trade[] = [...tradeRows].reverse().slice(0, 12).map((trade) => ({
    id: trade.id, symbol: trade.symbol, side: trade.side, quantity: Number(trade.quantity), price: Number(trade.unit_price), date: formatDate(trade.created_at),
  }));
  const history = buildPortfolioHistory({
    startingCash: start,
    seasonStart: season.starts_at,
    trades: tradeRows.map((trade) => ({
      symbol: trade.symbol, side: trade.side, quantity: Number(trade.quantity), price: Number(trade.unit_price),
      total: Number(trade.total_amount), at: trade.created_at,
    })),
    quotes, now: new Date().toISOString(), cash, holdings,
    prices: Object.fromEntries(stocks.map((stock) => [stock.symbol, stock.price])),
  });
  return { cash, holdings: enriched, trades, metrics, history: history.values, historyDates: history.dates };
}

type LeaderRow = { user_id?: string; display_name?: string; portfolio_value: number | string; rank: number | string; is_you?: boolean; player_count?: number | string };
async function fetchLeaderboardRows() {
  const { season, userId } = await ensurePortfolio();
  const res = await apiFetch<{ data: LeaderRow[] }>(`/api/seasons/leaderboard?seasonId=${season.id}`);
  return { rows: res.data ?? [], season, userId };
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?';

export const liveApi = {
  getStocks: fetchStocks,
  getPortfolio: fetchPortfolio,
  async getLeaderboard(): Promise<Player[]> {
    const { rows, season, userId } = await fetchLeaderboardRows();
    const start = Number(season.starting_cash);
    return rows.map((row) => {
      const name = row.display_name || 'Trader';
      return {
        rank: Number(row.rank), name, initials: initials(name), value: Number(row.portfolio_value),
        returnPct: start ? ((Number(row.portfolio_value) - start) / start) * 100 : 0,
        you: row.is_you === true || (row.user_id != null && row.user_id === userId),
      };
    }).sort((a, b) => a.rank - b.rank);
  },
  async getGameState(): Promise<GameState> {
    const { rows, season, userId } = await fetchLeaderboardRows();
    const seasonCount = await supabase.from('seasons').select('id', { count: 'exact', head: true }).lte('starts_at', season.starts_at).in('status', ['active', 'completed']);
    const mine = rows.find((row) => row.is_you === true || (row.user_id != null && row.user_id === userId));
    const playerCount = Number(rows[0]?.player_count ?? rows.length);
    return {
      seasonNumber: seasonCount.count ?? 1,
      seasonName: season.name,
      daysRemaining: Math.max(0, Math.ceil((new Date(season.ends_at).getTime() - Date.now()) / 86_400_000)),
      endsOn: new Date(season.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      playerLevel: 1, playerTitle: 'Trader', streakDays: 0,
      rank: mine ? Number(mine.rank) : playerCount + 1,
      playerCount, startingBalance: Number(season.starting_cash),
    };
  },
  async submitTrade(req: TradeRequest): Promise<TradeResult> {
    if (!req.idempotencyKey) throw new Error('This order is missing an idempotency key. Please try again.');
    const { season } = await ensurePortfolio();
    await apiFetch('/api/trades', {
      method: 'POST',
      body: JSON.stringify({ seasonId: season.id, symbol: req.symbol, side: req.side, quantity: formatQuantity(req.quantity), idempotencyKey: req.idempotencyKey }),
    });
    const portfolio = await fetchPortfolio();
    return { trade: portfolio.trades[0]!, cash: portfolio.cash, holding: portfolio.holdings.find((holding) => holding.symbol === req.symbol) ?? null, metrics: portfolio.metrics, holdings: portfolio.holdings, trades: portfolio.trades, history: portfolio.history, historyDates: portfolio.historyDates };
  },
};
