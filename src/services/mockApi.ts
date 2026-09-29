import type { GameState, Holding, Player, PortfolioMetrics, Stock, Trade, TradeRequest, TradeResult } from '../types';

// Development adapter only. Replace this module with typed fetch/server-action calls when the API is ready.
// Never treat client-calculated estimates as authoritative; trade() is the only source of transaction outcomes.
const stockRows: Stock[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 142.87, change: 3.41, changePct: 2.44, color: '#8b79ff', sector: 'Semiconductors', volume: '41.2M', marketCap: '$3.48T', history: [42,40,44,39,49,47,56,51,58,53,61,58,68,64,72,69,78,74,82,77,90,87,94,89,100] },
  { symbol: 'AAPL', name: 'Apple Inc.', price: 232.62, change: -1.21, changePct: -0.52, color: '#67c6ff', sector: 'Consumer electronics', volume: '32.8M', marketCap: '$3.54T', history: [83,89,85,93,87,90,95,92,88,94,90,98,93,99,96,93,101,96,100,94,99,95,103,98,96] },
  { symbol: 'TSLA', name: 'Tesla, Inc.', price: 347.18, change: 11.64, changePct: 3.47, color: '#ff776f', sector: 'Automotive', volume: '88.6M', marketCap: '$1.12T', history: [40,44,41,50,48,52,46,59,55,63,58,67,61,70,65,77,70,80,75,84,78,89,82,96,100] },
  { symbol: 'MSFT', name: 'Microsoft Corporation', price: 415.32, change: 0.96, changePct: 0.23, color: '#58d8ad', sector: 'Software', volume: '18.4M', marketCap: '$3.09T', history: [45,51,49,56,52,60,57,63,59,67,62,70,67,75,69,78,74,82,77,84,79,88,84,92,96] },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 218.94, change: -0.87, changePct: -0.40, color: '#ffbc66', sector: 'E-commerce', volume: '21.6M', marketCap: '$2.31T', history: [82,88,84,91,87,93,89,96,92,88,94,90,97,93,99,95,92,97,93,100,95,91,96,92,89] },
  { symbol: 'META', name: 'Meta Platforms, Inc.', price: 624.19, change: 8.27, changePct: 1.34, color: '#4f9cff', sector: 'Social media', volume: '12.1M', marketCap: '$1.58T', history: [47,51,48,56,52,60,56,63,60,67,62,70,67,73,69,78,74,82,78,84,80,89,85,94,100] },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 191.24, change: 1.88, changePct: 0.99, color: '#f09bd2', sector: 'Technology', volume: '16.9M', marketCap: '$2.32T', history: [52,48,54,51,59,56,63,58,66,62,71,66,73,70,78,74,81,77,85,81,90,86,93,90,96] },
];
const delay = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms));
let cash = 64277.80;
let holdings: Holding[] = [{ symbol: 'NVDA', quantity: 60, avgCost: 118.42 }, { symbol: 'AAPL', quantity: 60, avgCost: 201.15 }, { symbol: 'TSLA', quantity: 30, avgCost: 292.80 }, { symbol: 'MSFT', quantity: 20, avgCost: 388.20 }];
let trades: Trade[] = [
  { id: 't1', symbol: 'NVDA', side: 'buy', quantity: 12, price: 136.24, date: 'Today, 10:42 AM' },
  { id: 't2', symbol: 'AAPL', side: 'sell', quantity: 8, price: 234.18, date: 'Yesterday, 2:16 PM' },
  { id: 't3', symbol: 'TSLA', side: 'buy', quantity: 6, price: 319.72, date: 'Yesterday, 11:08 AM' },
];
const mockHistory = [100000, 99760, 100420, 100210, 101150, 100940, 102430, 101980, 103150, 102840, 104110, 103760, 105020, 104880, 105610, 105240, 105529];
function getMetrics(): PortfolioMetrics {
  const investedValue = holdings.reduce((sum, holding) => sum + holding.quantity * (stockRows.find(stock => stock.symbol === holding.symbol)?.price ?? holding.avgCost), 0);
  const dailyGainLoss = holdings.reduce((sum, holding) => sum + holding.quantity * (stockRows.find(stock => stock.symbol === holding.symbol)?.change ?? 0), 0);
  const totalValue = cash + investedValue;
  const totalGainLoss = totalValue - 100000;
  return { totalValue, totalGainLoss, totalReturnPct: totalGainLoss / 100000 * 100, dailyGainLoss, investedValue, cashAllocationPct: totalValue ? cash / totalValue * 100 : 0, startingBalance: 100000 };
}
function getEnrichedHoldings(): Holding[] {
  const metrics = getMetrics();
  return holdings.map(holding => {
    const stock = stockRows.find(row => row.symbol === holding.symbol);
    const price = stock?.price ?? holding.avgCost;
    const marketValue = holding.quantity * price;
    const profitLoss = holding.quantity * (price - holding.avgCost);
    return { ...holding, marketValue, profitLoss, returnPct: holding.avgCost ? (price - holding.avgCost) / holding.avgCost * 100 : 0, allocationPct: metrics.totalValue ? marketValue / metrics.totalValue * 100 : 0 };
  });
}
export const mockApi = {
  async getStocks(): Promise<Stock[]> { await delay(350); return stockRows; },
  async getPortfolio() { await delay(520); return { cash, holdings: getEnrichedHoldings(), trades: [...trades], metrics: getMetrics(), history: [...mockHistory] }; },
  async getGameState(): Promise<GameState> { await delay(300); return { seasonNumber: 4, seasonName: 'The Fall Rally', daysRemaining: 12, endsOn: 'Oct 11', playerLevel: 12, playerTitle: 'Day trader', streakDays: 5, rank: 4, playerCount: 1284, startingBalance: 100000 }; },
  async getLeaderboard(): Promise<Player[]> { await delay(400); return [
    { rank: 1, name: 'MarketMaven', initials: 'MM', value: 132480, returnPct: 32.48 },
    { rank: 2, name: 'bullish.ben', initials: 'BB', value: 128720, returnPct: 28.72 },
    { rank: 3, name: 'Olivia C.', initials: 'OC', value: 109360, returnPct: 9.36 },
    { rank: 4, name: 'Jordan Davis', initials: 'JD', value: 105529, returnPct: 5.53, you: true },
    { rank: 5, name: 'chartwizard', initials: 'CW', value: 102210, returnPct: 2.21 },
  ]; },
  async submitTrade(req: TradeRequest): Promise<TradeResult> {
    await delay(800);
    const stock = stockRows.find(s => s.symbol === req.symbol);
    if (!stock) throw new Error('We could not find that stock. Please refresh and try again.');
    const holding = holdings.find(h => h.symbol === req.symbol);
    const available = req.side === 'buy' ? cash : (holding?.quantity ?? 0);
    if (!Number.isInteger(req.quantity) || req.quantity <= 0) throw new Error('Enter a whole number of shares greater than zero.');
    if (req.side === 'buy' && req.quantity * stock.price > cash) throw new Error('Not enough available cash for this trade.');
    if (req.side === 'sell' && req.quantity > available) throw new Error(`You only have ${available} shares available to sell.`);
    const trade: Trade = { id: `t${Date.now()}`, symbol: req.symbol, side: req.side, quantity: req.quantity, price: stock.price, date: 'Just now' };
    if (req.side === 'buy') {
      cash -= req.quantity * stock.price;
      if (holding) { const quantity = holding.quantity + req.quantity; holding.avgCost = (holding.avgCost * holding.quantity + stock.price * req.quantity) / quantity; holding.quantity = quantity; }
      else holdings.push({ symbol: req.symbol, quantity: req.quantity, avgCost: stock.price });
    } else {
      cash += req.quantity * stock.price;
      if (holding) holding.quantity -= req.quantity;
      holdings = holdings.filter(h => h.quantity > 0);
    }
    trades = [trade, ...trades].slice(0, 12);
    return { trade, cash, holding: getEnrichedHoldings().find(h => h.symbol === req.symbol) ?? null, metrics: getMetrics(), holdings: getEnrichedHoldings(), trades: [...trades], history: [...mockHistory] };
  },
};
