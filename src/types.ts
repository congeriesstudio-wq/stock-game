export type Stock = { symbol: string; name: string; price: number; change: number; changePct: number; color: string; sector: string; volume: string; marketCap: string; history: number[] };
export type Holding = { symbol: string; quantity: number; avgCost: number; marketValue?:number; profitLoss?:number; returnPct?:number; allocationPct?:number };
export type Trade = { id: string; symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; date: string };
export type Player = { rank: number; name: string; initials: string; value: number; returnPct: number; you?: boolean };
export type GameState = { seasonNumber:number; seasonName:string; daysRemaining:number; endsOn:string; playerLevel:number; playerTitle:string; streakDays:number; rank:number; playerCount:number; startingBalance:number };
export type TradeRequest = { symbol: string; side: 'buy' | 'sell'; quantity: number };
export type PortfolioMetrics = { totalValue:number; totalGainLoss:number; totalReturnPct:number; dailyGainLoss:number; investedValue:number; cashAllocationPct:number; startingBalance:number };
export type TradeResult = { trade: Trade; cash: number; holding: Holding | null; metrics:PortfolioMetrics; holdings:Holding[]; trades:Trade[]; history:number[] };
