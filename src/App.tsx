import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Command, Compass, Eye, EyeOff, Gem, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Search, ShieldCheck, Sparkles, Star, TrendingUp, Trophy, Wallet, X, Zap } from 'lucide-react';
import { mockApi } from './services/mockApi';
import { liveApi, resetLiveState } from './services/liveApi';
import { isLive, supabase } from './services/supabaseClient';
import { DUST_CLOSE, MIN_BUY_NOTIONAL, formatQuantity, maxAffordableQuantity, orderTotal } from './lib/money';
import type { GameState, Holding, Player, PortfolioMetrics, Stock, Trade } from './types';

const api = isLive ? liveApi : mockApi;
import { PortfolioChart, StockChart } from './components/Charts';
import './styles.css';
import './landing.css';
import './error-state.css';

type View = 'overview' | 'portfolio' | 'markets' | 'leaderboard';
type Notice = { type: 'success' | 'error' | 'info'; text: string };
const money = (value: number) => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortMoney = (value: number) => `${value < 0 ? '-' : ''}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`;
const signedPct = (value: number, digits = 2) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || 'there';
const EMPTY_METRICS: PortfolioMetrics = { totalValue: 0, totalGainLoss: 0, totalReturnPct: 0, dailyGainLoss: 0, investedValue: 0, cashAllocationPct: 0, startingBalance: 0 };
const CHART_RANGES = [['1D', 'Today'], ['1W', 'This week'], ['1M', 'This month'], ['3M', '3 months'], ['1Y', 'This year'], ['ALL', 'All time']] as const;
function greetingFor(date: Date) { const hour = date.getHours(); return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'; }
function longDate(date: Date) { return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase(); }
function marketCopy(game: GameState | null) {
  if (!game) return { headline: 'Season market', detail: 'Schedule loading' };
  if (game.daysRemaining <= 0) return { headline: 'Season ended', detail: `Ended ${game.endsOn}` };
  return { headline: 'Season market open', detail: `${game.daysRemaining}d left · ends ${game.endsOn}` };
}

function PriceChange({ value, compact = false }: { value: number; compact?: boolean }) {
  const positive = value >= 0;
  return <span className={`price-change ${positive ? 'up' : 'down'} ${compact ? 'compact' : ''}`}>{positive ? <ArrowUpRight size={compact ? 13 : 15}/> : <ArrowDownRight size={compact ? 13 : 15}/>} {positive ? '+' : ''}{value.toFixed(2)}%</span>;
}
function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} aria-label="Loading"/>; }
function Toast({ notice, close }: { notice: Notice; close: () => void }) { return <div className={`toast ${notice.type}`} role="status"><span className="toast-icon">{notice.type === 'success' ? <Check size={16}/> : notice.type === 'error' ? <X size={16}/> : <Sparkles size={16}/>}</span>{notice.text}<button aria-label="Dismiss notification" onClick={close}><X size={15}/></button></div>; }

function App() {
  const [view, setView] = useState<View>('overview');
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<number[]>([]);
  const [portfolioDates, setPortfolioDates] = useState<string[]>([]);
  const [cash, setCash] = useState(0);
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics>(EMPTY_METRICS);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(['NVDA', 'TSLA', 'META']);
  const [query, setQuery] = useState('');
  const [activeStock, setActiveStock] = useState('NVDA');
  const [tradeTarget, setTradeTarget] = useState<{ stock: Stock; side: 'buy' | 'sell' } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loggedIn, setLoggedIn] = useState(!isLive);
  const [sessionReady, setSessionReady] = useState(!isLive);
  const [user, setUser] = useState({ name: isLive ? 'Trader' : 'Jordan Davis', email: isLive ? '' : 'jordan.davis@email.com' });
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [authStage, setAuthStage] = useState<'landing' | 'form'>('landing');
  const [userMenu, setUserMenu] = useState(false);
  const [chartRange, setChartRange] = useState('1W');
  const loadGen = useRef(0);
  const today = useMemo(() => new Date(), [loggedIn]);

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    const apply = (account: { email?: string; user_metadata?: Record<string, unknown> } | null | undefined) => {
      if (account) setUser({ name: String(account.user_metadata?.display_name ?? account.email?.split('@')[0] ?? 'Trader'), email: account.email ?? '' });
      setLoggedIn(Boolean(account));
    };
    void supabase.auth.getSession().then(({ data }) => { if (cancelled) return; apply(data.session?.user); setSessionReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) resetLiveState(); apply(session?.user); });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const clearSession = () => {
    loadGen.current += 1;
    setHoldings([]); setTrades([]); setPortfolioHistory([]); setPortfolioDates([]); setCash(0); setPortfolioMetrics(EMPTY_METRICS);
    setPlayers([]); setGameState(null); setWatchlist([]); setStocks([]); setTradeTarget(null); setQuery(''); setNotice(null);
    setUserMenu(false); setMobileNav(false); setView('overview'); setLoadError(false); setLoading(false);
  };
  const signOut = async () => {
    if (isLive) { await supabase.auth.signOut(); resetLiveState(); }
    clearSession();
    setUser({ name: 'Trader', email: '' });
    setLoggedIn(false);
    setAuthStage('landing');
  };
  const authenticate = async (mode: 'login' | 'signup', email: string, password: string, name: string): Promise<string | null> => {
    if (!isLive) {
      setUser({ name: mode === 'signup' && name.trim() ? name.trim().slice(0, 40) : 'Jordan Davis', email });
      setLoggedIn(true);
      return null;
    }
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim().slice(0, 40) } } });
      if (error) return error.message;
      return data.session ? null : 'Check your email to confirm your account, then log in.';
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true); setLoadError(false);
    try {
      const [s, p, l, g] = await Promise.all([api.getStocks(), api.getPortfolio(), api.getLeaderboard(), api.getGameState()]);
      if (gen !== loadGen.current) return;
      setStocks(s); setHoldings(p.holdings); setCash(p.cash); setPortfolioMetrics(p.metrics); setTrades(p.trades); setPortfolioHistory(p.history); setPortfolioDates(p.historyDates); setPlayers(l); setGameState(g);
    } catch { if (gen === loadGen.current) { setLoadError(true); setNotice({ type: 'error', text: 'Unable to load your game data. Please try again.' }); } }
    finally { if (gen === loadGen.current) setLoading(false); }
  }, []);
  useEffect(() => { if (loggedIn) void load(); }, [load, loggedIn]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 3600); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!loggedIn) return;
      const target = event.target as HTMLElement | null;
      const editable = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === 'Escape') {
        if (tradeTarget) return;
        setQuery(''); setUserMenu(false); setMobileNav(false); return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.global-search input')?.focus(); return; }
      if (event.repeat || editable || tradeTarget || event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== 'n') return;
      const featured = stocks.find(stock => stock.symbol === 'NVDA') ?? stocks.find(stock => stock.active !== false);
      if (featured) setTradeTarget({ stock: featured, side: 'buy' });
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [stocks, loggedIn, tradeTarget]);

  const stockBySymbol = useMemo(() => Object.fromEntries(stocks.map(stock => [stock.symbol, stock])) as Record<string, Stock>, [stocks]);
  const selectedStock = stockBySymbol[activeStock] ?? stocks[0];
  // Account totals come from the server adapter; prices and order estimates in the UI are indicative only.
  const portfolioValue = portfolioMetrics.totalValue;
  const totalPL = portfolioMetrics.totalGainLoss;
  const totalReturnPct = portfolioMetrics.totalReturnPct;
  const dailyPL = portfolioMetrics.dailyGainLoss;
  const filterStocks = (term: string) => stocks.filter(s => `${s.symbol} ${s.name}`.toLowerCase().includes(term.toLowerCase()));
  const showPage = (next: View) => { setView(next); setMobileNav(false); setQuery(''); };
  const toggleWatch = (symbol: string) => { const already = watchlist.includes(symbol); setWatchlist(old => already ? old.filter(s => s !== symbol) : [...old, symbol]); setNotice({ type: 'success', text: already ? `${symbol} removed from watchlist` : `${symbol} added to watchlist` }); };
  const executeTrade = async (side: 'buy' | 'sell', quantity: number, symbol: string, idempotencyKey: string) => {
    const result = await api.submitTrade({ symbol, side, quantity, idempotencyKey });
    setHoldings(result.holdings); setCash(result.cash); setPortfolioMetrics(result.metrics); setTrades(result.trades); setPortfolioHistory(result.history); setPortfolioDates(result.historyDates);
    setTradeTarget(null); setNotice({ type: 'success', text: `${side === 'buy' ? 'Bought' : 'Sold'} ${formatQuantity(quantity)} ${symbol} successfully` });
  };

  const market = marketCopy(gameState);
  const playerName = firstNameOf(user.name);
  if (!sessionReady) return <div className="auth-screen" aria-busy="true"/>;
  if (!loggedIn) return authStage === 'landing' ? <LandingPage onSignup={() => { setAuthMode('signup'); setAuthStage('form'); }} onLogin={() => { setAuthMode('login'); setAuthStage('form'); }} /> : <AuthScreen mode={authMode} setMode={setAuthMode} onBack={() => setAuthStage('landing')} onAuth={authenticate} />;
  return <div className="app-shell">
    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Activity size={18} strokeWidth={2.8}/></div><span>ticker<span className="brand-dot">.</span><b>arena</b></span></div>
      <div className="season-card"><div className="season-top"><span className="season-label"><span className="live-dot"/> SEASON {gameState ? String(gameState.seasonNumber).padStart(2,'0') : '—'}</span><span className="season-days">{gameState?.daysRemaining ?? '—'}d left</span></div><div className="season-title">{gameState?.seasonName ?? 'Current season'}</div><div className="season-progress"><span/></div><div className="season-foot"><span>Season ends {gameState?.endsOn ?? 'soon'}</span><ChevronRight size={14}/></div></div>
      <div className="nav-label">PLAY</div>
      <nav className="main-nav" aria-label="Main navigation">
        <NavItem icon={<LayoutDashboard size={18}/>} label="Overview" active={view==='overview'} onClick={() => showPage('overview')}/>
        <NavItem icon={<Wallet size={18}/>} label="Portfolio" active={view==='portfolio'} onClick={() => showPage('portfolio')} badge={String(holdings.length)}/>
        <NavItem icon={<Compass size={18}/>} label="Explore markets" active={view==='markets'} onClick={() => showPage('markets')}/>
        <NavItem icon={<Trophy size={18}/>} label="Leaderboard" active={view==='leaderboard'} onClick={() => showPage('leaderboard')}/>
      </nav>
      <div className="nav-label tools-label">YOUR GAME</div>
      <div className="game-mini-card"><div className="game-mini-icon"><Gem size={16}/></div><div className="game-mini-copy"><b>Trading streak</b><span>{gameState?.streakDays ?? '—'} days in a row</span></div><span className="streak">🔥 {gameState?.streakDays ?? '—'}</span></div>
      <div className="sidebar-bottom"><button className="help-link"><CircleHelp size={17}/> Help & how to play <ArrowUpRight size={13}/></button><div className="sidebar-user"><div className="avatar avatar-purple">{initialsOf(user.name)}</div><div className="user-copy"><b>{user.name}</b><span>Level {gameState?.playerLevel ?? '—'} · {gameState?.playerTitle ?? 'Trader'}</span></div><button aria-label="Open profile menu" className="icon-btn sidebar-more" onClick={() => setUserMenu(!userMenu)}><MoreHorizontal size={18}/></button></div></div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14}/><b>{view === 'overview' ? 'Overview' : view === 'markets' ? 'Explore markets' : view === 'portfolio' ? 'Portfolio' : 'Leaderboard'}</b></div>
        <div className="topbar-actions"><div className="global-search"><Search size={16}/><input aria-label="Search stocks" placeholder="Search stocks..." value={query} onChange={e => setQuery(e.target.value)} onFocus={() => view !== 'markets' && setView('markets')}/><kbd><Command size={11}/> K</kbd>{query && <div className="search-dropdown">{filterStocks(query).length ? filterStocks(query).slice(0,5).map(s=><button key={s.symbol} onClick={()=>{setActiveStock(s.symbol);setQuery('');setView('markets')}}><StockAvatar stock={s}/><span><b>{s.symbol}</b><small>{s.name}</small></span><strong>{money(s.price)}</strong></button>) : <div className="search-empty">No stocks found</div>}</div>}</div><div className="market-status"><span className="live-dot"/> {market.headline}</div><button className="icon-btn notification-btn" aria-label="Notifications"><Bell size={18}/><i/></button><div className="top-avatar-wrap"><button className="top-avatar avatar avatar-purple" aria-label="Account menu" onClick={()=>setUserMenu(!userMenu)}>{initialsOf(user.name)}</button>{userMenu && <div className="user-dropdown"><b>{user.name}</b><span>{user.email}</span><hr/><button onClick={() => void signOut()}><LogOut size={15}/> Log out</button></div>}</div></div>
      </header>
      {query && view === 'markets' && <button className="search-dismiss" onClick={()=>setQuery('')} aria-label="Close search results"/>}
      <section className="page-content">
        {loadError ? <DataError onRetry={load}/> : <>
        {view === 'overview' && <Dashboard loading={loading} playerName={playerName} today={today} chartRange={chartRange} setChartRange={setChartRange} portfolioValue={portfolioValue} cash={cash} totalPL={totalPL} totalReturnPct={totalReturnPct} startingBalance={portfolioMetrics.startingBalance} cashAllocationPct={portfolioMetrics.cashAllocationPct} portfolioHistory={portfolioHistory} portfolioDates={portfolioDates} dailyPL={dailyPL} holdings={holdings} trades={trades} stockMap={stockBySymbol} players={players} gameState={gameState} watchlist={watchlist} onTrade={(s: Stock, side: 'buy'|'sell')=>setTradeTarget({stock:s,side})} onWatch={toggleWatch} onSelectStock={(s: string)=>{setActiveStock(s);setView('markets')}} onNavigate={showPage}/>}
        {view === 'portfolio' && <PortfolioPage loading={loading} value={portfolioValue} cash={cash} totalPL={totalPL} totalReturnPct={totalReturnPct} cashAllocationPct={portfolioMetrics.cashAllocationPct} investedValue={portfolioMetrics.investedValue} portfolioHistory={portfolioHistory} portfolioDates={portfolioDates} dailyPL={dailyPL} holdings={holdings} stockMap={stockBySymbol} onTrade={(s: Stock, side: 'buy'|'sell')=>setTradeTarget({stock:s,side})} onSelectStock={(s: string)=>{setActiveStock(s);setView('markets')}} onNavigate={showPage}/>}
        {view === 'markets' && <MarketsPage loading={loading} stocks={filterStocks(query)} query={query} setQuery={setQuery} activeStock={selectedStock} holdings={holdings} cash={cash} watchlist={watchlist} market={market} onSelect={(s: Stock)=>setActiveStock(s.symbol)} onTrade={(s: Stock, side: 'buy'|'sell')=>setTradeTarget({stock:s,side})} onWatch={toggleWatch}/>}
        {view === 'leaderboard' && <LeaderboardPage loading={loading} players={players} gameState={gameState} playerName={playerName}/>}
        </>}
      </section>
    </main>
    {tradeTarget && <TradeModal stock={tradeTarget.stock} side={tradeTarget.side} cash={cash} owned={holdings.find(h=>h.symbol===tradeTarget.stock.symbol)?.quantity ?? 0} onClose={()=>setTradeTarget(null)} onConfirm={executeTrade}/>}
    {notice && <Toast notice={notice} close={()=>setNotice(null)}/>}
  </div>;
}

function NavItem({ icon, label, active, onClick, badge }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; badge?: string }) { return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{badge && <i>{badge}</i>}</button>; }
function StockAvatar({ stock, size = '' }: { stock: Stock; size?: string }) { return <div className={`stock-avatar ${size}`} style={{ '--stock-color': stock.color } as React.CSSProperties}>{stock.symbol.slice(0,1)}</div>; }
function SectionTitle({ title, link, onClick }: { title: string; link?: string; onClick?: () => void }) { return <div className="section-heading"><h2>{title}</h2>{link && <button onClick={onClick}>{link}<ArrowRight size={14}/></button>}</div>; }

type StockMap = Record<string, Stock>;
type DashboardProps = { loading:boolean; playerName:string; today:Date; chartRange:string; setChartRange:(range:string)=>void; portfolioValue:number; cash:number; totalPL:number; totalReturnPct:number; startingBalance:number; cashAllocationPct:number; portfolioHistory:number[]; portfolioDates:string[]; dailyPL:number; holdings:Holding[]; trades:Trade[]; stockMap:StockMap; players:Player[]; gameState:GameState|null; watchlist:string[]; onTrade:(stock:Stock,side:'buy'|'sell')=>void; onWatch:(symbol:string)=>void; onSelectStock:(symbol:string)=>void; onNavigate:(view:View)=>void };
function Dashboard({ loading, playerName, today, chartRange, setChartRange, portfolioValue, cash, totalPL, totalReturnPct, startingBalance, cashAllocationPct, portfolioHistory, portfolioDates, dailyPL, holdings, trades, stockMap, players, gameState, watchlist, onTrade, onWatch, onSelectStock, onNavigate }: DashboardProps) {
 const topStock = (stockMap['NVDA']?.active === false ? undefined : stockMap['NVDA']) ?? Object.values(stockMap).find(stock => stock.active !== false);
 return <>
  <div className="welcome-row"><div><div className="eyebrow"><Sparkles size={13}/> {longDate(today)} <span className="eyebrow-divider"/> <span className="live-dot"/> {marketCopy(gameState).headline.toUpperCase()}</div><h1>{greetingFor(today)}, {playerName} <span className="wave">✌️</span></h1><p className="welcome-subtitle">Your next great trade is one decision away.</p></div><button className="button-primary new-trade" onClick={()=>topStock && onTrade(topStock,'buy')}><Plus size={17}/> New trade <kbd>N</kbd></button></div>
  <div className="metric-grid">
   <div className="metric-card portfolio-metric"><div className="metric-top"><span>Total portfolio value</span><span className="metric-icon purple"><Wallet size={16}/></span></div>{loading ? <Skeleton className="metric-skeleton"/> : <><div className="metric-value">{money(portfolioValue)}</div><div className="metric-footer"><PriceChange value={totalReturnPct} /><span className="muted">all time</span><span className="footer-dot"/><span className="muted">Initial {money(startingBalance)}</span></div><div className="metric-chart"><PortfolioChart compact values={portfolioHistory} dates={portfolioDates} range={chartRange}/></div></>}</div>
   <div className="metric-card"><div className="metric-top"><span>Today's return</span><span className="metric-icon green"><TrendingUp size={16}/></span></div>{loading ? <Skeleton className="metric-skeleton"/> : <><div className={`metric-value ${dailyPL >= 0 ? 'positive' : 'negative'}`}>{dailyPL >= 0 ? '+' : ''}{money(dailyPL)}</div><div className="metric-footer"><PriceChange value={dailyPL / Math.max(portfolioValue,1) * 100}/><span className="muted">today</span></div><div className="mini-bars">{[27,43,34,54,38,67,49,74,58,83,62,92,68,76,55,88,70,100,79,91,68,82,59,74].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></>}</div>
   <div className="metric-card"><div className="metric-top"><span>Available to trade</span><span className="metric-icon blue"><Zap size={16}/></span></div>{loading ? <Skeleton className="metric-skeleton"/> : <><div className="metric-value">{money(cash)}</div><div className="metric-footer"><span className="cash-chip"><span/> Cash balance</span></div><div className="cash-progress"><span style={{width:`${Math.min(100,cashAllocationPct)}%`}}/></div><div className="cash-caption"><span>Cash allocation</span><b>{cashAllocationPct.toFixed(1)}%</b></div></>}</div>
  </div>
  <div className="dashboard-grid"><div className="dashboard-main">
   <section className="panel performance-panel"><div className="panel-head"><div><div className="panel-overline">YOUR PERFORMANCE</div><h2>Portfolio growth</h2></div><PeriodMenu range={chartRange} onChange={setChartRange}/></div>{loading ? <Skeleton className="big-chart-skeleton"/> : <PortfolioChart values={portfolioHistory} dates={portfolioDates} range={chartRange} onRange={setChartRange}/>}</section>
   <section className="panel holdings-panel"><SectionTitle title="Your holdings" link="View portfolio" onClick={()=>onNavigate('portfolio')}/>{loading ? <div className="skeleton-list">{[1,2,3].map(i=><Skeleton key={i} className="row-skeleton"/>)}</div> : holdings.length ? <div className="holdings-table"><div className="table-head"><span>ASSET</span><span>PRICE</span><span>HOLDINGS</span><span>RETURN</span><span/></div>{holdings.slice(0,4).map((h: Holding)=> <HoldingRow key={h.symbol} holding={h} stock={stockMap[h.symbol]} onTrade={onTrade} onSelect={onSelectStock}/>)}</div> : <EmptyState title="Your portfolio is a blank canvas" text="Make your first trade to start building your portfolio." action="Explore stocks" onClick={()=>onNavigate('markets')}/>}</section>
   <section className="panel trades-panel"><SectionTitle title="Recent trades" link="All activity" onClick={()=>onNavigate('portfolio')}/>{loading ? <div className="skeleton-list">{[1,2].map(i=><Skeleton key={i} className="row-skeleton"/>)}</div> : trades.length ? trades.slice(0,3).map((trade: Trade)=><TradeRow key={trade.id} trade={trade} stock={stockMap[trade.symbol]}/>) : <EmptyState title="No trades yet" text="Your completed trades will show up here." action="Find a stock" onClick={()=>onNavigate('markets')}/>}</section>
  </div><aside className="dashboard-side">
   <section className="panel watchlist-panel"><SectionTitle title="Watchlist" link="Explore" onClick={()=>onNavigate('markets')}/>{loading ? <div className="skeleton-list">{[1,2,3].map(i=><Skeleton key={i} className="row-skeleton"/>)}</div> : watchlist.length ? watchlist.slice(0,4).map((symbol: string)=>stockMap[symbol] && <WatchRow key={symbol} stock={stockMap[symbol]} onSelect={onSelectStock}/>) : <EmptyState title="Your watchlist is empty" text="Save stocks you want to keep an eye on." action="Browse stocks" onClick={()=>onNavigate('markets')}/>}<button className="watch-add" onClick={()=>onNavigate('markets')}><Plus size={15}/> Add a stock</button></section>
   <section className="panel leaderboard-preview"><div className="leaderboard-head"><div><div className="panel-overline">SEASON {gameState ? String(gameState.seasonNumber).padStart(2,'0') : '—'}</div><h2>Top players</h2></div><div className="trophy-icon"><Trophy size={18}/></div></div>{loading ? <div className="skeleton-list">{[1,2,3].map(i=><Skeleton key={i} className="row-skeleton"/>)}</div> : players.slice(0,3).map((p:Player,i:number)=><div className="leader-row" key={p.rank}><span className={`leader-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}`}>{String(p.rank).padStart(2,'0')}</span><div className={`avatar ${i===0?'avatar-gold':i===1?'avatar-blue':'avatar-pink'}`}>{p.initials}</div><b>{p.name}</b><span className={`leader-return ${p.returnPct < 0 ? 'down' : ''}`}>{signedPct(p.returnPct, 1)}</span></div>)}<button className="leader-link" onClick={()=>onNavigate('leaderboard')}>See full leaderboard <ArrowRight size={14}/></button></section>
   <div className="tip-card"><div className="tip-icon"><Sparkles size={16}/></div><div><b>Trader tip</b><p>Don't put all your eggs in one ticker. Diversification is your edge.</p></div><button aria-label="More trading tips"><ArrowRight size={15}/></button></div>
  </aside></div>
 </>;
}
function HoldingRow({ holding, stock, onTrade, onSelect }: { holding:Holding; stock?:Stock; onTrade:(stock:Stock,side:'buy'|'sell')=>void; onSelect:(symbol:string)=>void }) { if (!stock) return null; const value=holding.marketValue ?? holding.quantity*stock.price, pl=holding.profitLoss ?? holding.quantity*(stock.price-holding.avgCost); return <div className="holding-row"><button className="asset-name" onClick={()=>onSelect(stock.symbol)}><StockAvatar stock={stock}/><span><b>{stock.symbol}</b><small>{stock.name}</small></span></button><div className="cell-price"><b>{money(stock.price)}</b><PriceChange value={stock.changePct} compact/></div><div className="cell-amount"><b>{formatQuantity(holding.quantity)} shares</b><small>{shortMoney(value)}</small></div><div className={`cell-return ${pl>=0?'positive':'negative'}`}><b>{pl>=0?'+':''}{money(pl)}</b><small>{signedPct(holding.returnPct ?? ((stock.price-holding.avgCost)/holding.avgCost*100))}</small></div><TradeMenu stock={stock} onTrade={onTrade}/></div>; }
function TradeRow({ trade }: { trade: Trade; stock?: Stock }) { const Icon = trade.side === 'sell' ? ArrowDownRight : ArrowUpRight; return <div className="trade-row"><div className={`trade-icon ${trade.side}`}><Icon size={16}/></div><div className="trade-summary"><b>{trade.side==='buy'?'Bought':'Sold'} {trade.symbol}</b><span>{formatQuantity(trade.quantity)} shares · {trade.date}</span></div><div className="trade-total"><b>{money(trade.quantity*trade.price)}</b><span>{money(trade.price)} / share</span></div></div>; }
function WatchRow({ stock, onSelect }: { stock: Stock; onSelect: (s:string)=>void }) { return <button className="watch-row" onClick={()=>onSelect(stock.symbol)}><StockAvatar stock={stock}/><span className="watch-name"><b>{stock.symbol}</b><small>{stock.name.split(' ')[0]}</small></span><StockChart stock={stock} compact/><span className="watch-price"><b>{money(stock.price)}</b><PriceChange value={stock.changePct} compact/></span></button>; }
function DataError({ onRetry }: { onRetry:()=>void }) { return <div className="data-error panel" role="alert"><div className="empty-icon"><Activity size={19}/></div><h2>We couldn't load your game data</h2><p>Check your connection and try again. Your portfolio and trades haven't been changed.</p><button className="button-primary" onClick={onRetry}>Try again <ArrowRight size={15}/></button></div>; }
function EmptyState({ title, text, action, onClick }: { title:string; text:string; action?:string; onClick?:()=>void }) { return <div className="empty-state"><div className="empty-icon"><Activity size={19}/></div><b>{title}</b><p>{text}</p>{action&&<button onClick={onClick}>{action}<ArrowRight size={14}/></button>}</div>; }

type PortfolioPageProps = { loading:boolean; value:number; cash:number; totalPL:number; totalReturnPct:number; cashAllocationPct:number; investedValue:number; portfolioHistory:number[]; portfolioDates:string[]; dailyPL:number; holdings:Holding[]; stockMap:StockMap; onTrade:(stock:Stock,side:'buy'|'sell')=>void; onSelectStock:(symbol:string)=>void; onNavigate:(view:View)=>void };
function PortfolioPage({ loading, value, cash, totalPL, totalReturnPct, cashAllocationPct, investedValue, portfolioHistory, portfolioDates, dailyPL, holdings, stockMap, onTrade, onSelectStock, onNavigate }: PortfolioPageProps) { const invested=investedValue; const allocationColors=['#9c86ff','#64c9f5','#ff827e','#53d9b0','#ffbd67']; let allocationCursor=0; const allocationStops=[...holdings.map((h:Holding,i:number)=>({color:allocationColors[i%allocationColors.length],fraction:(h.marketValue??h.quantity*(stockMap[h.symbol]?.price??0))/Math.max(value,1)})),{color:'#35415c',fraction:cashAllocationPct/100}].map(slice=>{const start=allocationCursor;allocationCursor+=slice.fraction*100;return `${slice.color} ${start}% ${allocationCursor}%`}).join(', '); return <>
 <div className="page-title-row"><div><div className="eyebrow">YOUR GAME / PERFORMANCE</div><h1>My portfolio</h1><p className="welcome-subtitle">Your moves, your money, your leaderboard climb.</p></div><button className="button-primary" onClick={()=>stockMap['NVDA']&&onTrade(stockMap['NVDA'],'buy')}><Plus size={16}/> Trade stocks</button></div>
 <div className="portfolio-summary-grid">{[['Portfolio value',money(value),'current balance'],['Total return',`${totalPL>=0?'+':''}${money(totalPL)}`,`${totalPL>=0?'+':''}${totalReturnPct.toFixed(2)}% all time`],['Today',`${dailyPL>=0?'+':''}${money(dailyPL)}`,'today'],['Buying power',money(cash),'available cash']].map((m,i)=><div className="panel summary-tile" key={m[0]}><span>{m[0]}</span><b className={i===1||i===2?(Number(String(m[1]).replace(/[^0-9.-]/g,''))>=0?'positive':'negative'):''}>{m[1]}</b><small>{m[2]}</small></div>)}</div>
 <div className="portfolio-layout"><div className="portfolio-main"><section className="panel performance-panel"><div className="panel-head"><div><div className="panel-overline">ACCOUNT PERFORMANCE</div><h2>Portfolio value</h2></div><div className="chart-current">{money(value)} <PriceChange value={totalReturnPct}/></div></div>{loading?<Skeleton className="big-chart-skeleton"/>:<PortfolioChart values={portfolioHistory} dates={portfolioDates}/>}</section>
 <section className="panel holdings-panel"><SectionTitle title={`Holdings (${holdings.length})`}/>{loading?<Skeleton className="big-chart-skeleton"/>:holdings.length?<div className="holdings-table"><div className="table-head"><span>ASSET</span><span>PRICE</span><span>SHARES / AVG COST</span><span>MARKET VALUE</span><span>RETURN</span></div>{holdings.map((h:Holding)=>{const s=stockMap[h.symbol]; if(!s)return null; const pl=h.profitLoss??h.quantity*(s.price-h.avgCost); const marketValue=h.marketValue??h.quantity*s.price; return <div className="holding-row portfolio-holding" key={h.symbol}><button className="asset-name" onClick={()=>onSelectStock(h.symbol)}><StockAvatar stock={s}/><span><b>{h.symbol}</b><small>{s.name}</small></span></button><div className="cell-price"><b>{money(s.price)}</b><PriceChange value={s.changePct} compact/></div><div className="cell-amount"><b>{formatQuantity(h.quantity)} shares</b><small>Avg. {money(h.avgCost)}</small></div><div className="cell-amount"><b>{money(marketValue)}</b><small>{(h.allocationPct??(marketValue/Math.max(value,1)*100)).toFixed(1)}% of portfolio</small></div><div className={`cell-return ${pl>=0?'positive':'negative'}`}><b>{pl>=0?'+':''}{money(pl)}</b><small>{signedPct(h.returnPct??((s.price-h.avgCost)/h.avgCost*100))}</small></div><TradeMenu stock={s} label="Trade" onTrade={onTrade}/></div>})}</div>:<EmptyState title="Start building your portfolio" text="Search the market and make your first trade." action="Explore stocks" onClick={()=>onNavigate('markets')}/>}</section>
 </div><aside className="portfolio-aside"><section className="panel allocation-panel"><SectionTitle title="Allocation"/><div className="donut-area"><div className="donut-chart" style={{background:`conic-gradient(${allocationStops})`}}><div className="donut-hole"><b>{holdings.length}</b><span>assets</span></div></div><div className="donut-total"><b>{money(invested)}</b><span>invested</span></div></div><div className="allocation-legend">{holdings.map((h:Holding,i:number)=>{const s=stockMap[h.symbol]; if(!s)return null;return <div key={h.symbol}><span><i style={{background:allocationColors[i%allocationColors.length]}}/>{h.symbol}</span><b>{(h.allocationPct??(h.quantity*s.price/Math.max(value,1)*100)).toFixed(1)}%</b></div>})}<div><span><i style={{background:'#35415c'}}/>Cash</span><b>{cashAllocationPct.toFixed(1)}%</b></div></div></section><section className="panel portfolio-cash"><div className="metric-top"><span>Cash balance</span><span className="metric-icon blue"><Wallet size={16}/></span></div><b>{money(cash)}</b><p>Ready when you are. Buying power updates after every confirmed trade.</p></section></aside></div>
 </>; }

type MarketsPageProps = { loading:boolean; stocks:Stock[]; query:string; setQuery:React.Dispatch<React.SetStateAction<string>>; activeStock:Stock|undefined; holdings:Holding[]; cash:number; watchlist:string[]; market:{headline:string; detail:string}; onSelect:(stock:Stock)=>void; onTrade:(stock:Stock,side:'buy'|'sell')=>void; onWatch:(symbol:string)=>void };
function MarketsPage({ loading, stocks, query, setQuery, activeStock, holdings, cash, watchlist, market, onSelect, onTrade, onWatch }: MarketsPageProps) {
 const [preset, setPreset] = useState<'popular' | 'all'>('popular');
 const listed = stocks.filter(stock => stock.active !== false);
 const ranked = [...listed].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
 const visible = preset === 'popular' ? ranked.slice(0, 4) : ranked;
 const stock = activeStock; const held = holdings.find((h: Holding) => h.symbol === stock?.symbol); return <>
 <div className="page-title-row market-title"><div><div className="eyebrow">FIND YOUR NEXT MOVE</div><h1>Explore markets</h1><p className="welcome-subtitle">Discover opportunities. Make your next move count.</p></div><div className="market-live"><span className="live-dot"/> {market.headline} <Clock3 size={14}/> {market.detail}</div></div>
 <div className="markets-layout"><aside className="panel market-list"><div className="market-list-head"><h2>Stocks</h2><span>{visible.length} assets</span></div><label className="stock-search"><Search size={16}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search by name or ticker" aria-label="Filter stocks"/><kbd>/</kbd></label><div className="stock-filter"><button type="button" className={preset==='popular'?'selected':''} aria-pressed={preset==='popular'} onClick={()=>setPreset('popular')}>Popular</button><button type="button" className={preset==='all'?'selected':''} aria-pressed={preset==='all'} onClick={()=>{setPreset('all');setQuery('')}}>All stocks</button></div>{loading ? [1,2,3,4,5].map(i=><Skeleton key={i} className="stock-skeleton"/>): visible.length ? visible.map((s:Stock)=><button className={`market-stock-item ${stock?.symbol===s.symbol?'selected':''}`} key={s.symbol} onClick={()=>onSelect(s)}><StockAvatar stock={s}/><span><b>{s.symbol}</b><small>{s.name.split(',')[0]}</small></span><span className="stock-list-price"><b>{money(s.price)}</b><PriceChange value={s.changePct} compact/></span></button>):<EmptyState title="No matches" text="Try another company or ticker."/>}</aside>
 <div className="market-detail">{stock ? <><section className="panel stock-detail-panel"><div className="stock-detail-top"><div className="stock-identity"><StockAvatar stock={stock} size="large"/><div><div className="stock-symbol-name"><h2>{stock.symbol}</h2><button className={`watch-star ${watchlist.includes(stock.symbol)?'saved':''}`} onClick={()=>onWatch(stock.symbol)} aria-label={watchlist.includes(stock.symbol)?'Remove from watchlist':'Add to watchlist'}><Star size={17} fill={watchlist.includes(stock.symbol)?'currentColor':'none'}/></button></div><span>{stock.name}</span></div></div><TradeMenu stock={stock} onTrade={onTrade}/></div><div className="stock-quote"><b>{money(stock.price)}</b><span className={stock.changePct>=0?'positive':'negative'}>{stock.change>=0?'+':''}{money(stock.change)} ({stock.changePct>=0?'+':''}{stock.changePct.toFixed(2)}%) today</span></div><StockChart stock={stock}/><div className="stock-stats"><div><span>Market cap</span><b>{stock.marketCap}</b></div><div><span>Volume</span><b>{stock.volume}</b></div><div><span>Sector</span><b>{stock.sector}</b></div><div><span>Your shares</span><b>{held?.quantity??'—'}</b></div></div><div className="stock-actions"><button className="button-primary buy-button" disabled={stock.active === false} onClick={()=>stock.active !== false && onTrade(stock,'buy')}>Buy {stock.symbol}<ArrowUpRight size={16}/></button><button className="button-secondary sell-button" onClick={()=>onTrade(stock,'sell')}>Sell</button><span className="available-note"><ShieldCheck size={14}/> {money(cash)} buying power</span></div></section>
 <section className="panel about-stock"><div className="panel-overline">ABOUT {stock.symbol}</div><h3>{stock.name}</h3><p>{stock.name} is a leading company in the {stock.sector.toLowerCase()} sector. Explore its price action, add it to your watchlist, or make a move when you're ready.</p><button onClick={()=>onWatch(stock.symbol)} className="text-button"><Star size={14}/> {watchlist.includes(stock.symbol)?'Saved to watchlist':'Add to watchlist'}</button></section></> : <section className="panel market-empty"><EmptyState title="Pick a stock to get started" text="Choose an asset from the list to explore its price and make a trade."/></section>}</div></div>
 </>; }

function LeaderboardPage({ loading, players, gameState, playerName }: { loading:boolean; players:Player[]; gameState:GameState|null; playerName:string }) { const you=players.find(player=>player.you); const rank=you?.rank??gameState?.rank; const above=rank ? players.find(player=>player.rank===rank-1) : undefined; const below=rank ? players.find(player=>player.rank===rank+1) : undefined; const toNext=above&&you?Math.max(0,above.value-you.value):0; const progress=above&&below&&you?Math.max(0,Math.min(100,Math.round((you.value-below.value)/Math.max(1,above.value-below.value)*100))):0; const percentile=rank&&gameState?.playerCount?Math.max(1,Math.ceil(rank/gameState.playerCount*100)):null; const seasonReturn=you?.returnPct; return <><div className="page-title-row"><div><div className="eyebrow">SEASON {gameState ? String(gameState.seasonNumber).padStart(2,'0') : '—'} · {gameState?.daysRemaining ?? '—'} DAYS REMAINING</div><h1>Leaderboard</h1><p className="welcome-subtitle">Every trade counts. See how you stack up this season.</p></div><div className="season-prize"><Trophy size={18}/><span>Season prize</span><b>Leaderboard rank</b></div></div><div className="leaderboard-layout"><section className="panel leaderboard-full"><div className="leaderboard-full-top"><div><div className="panel-overline">{gameState?.seasonName.toUpperCase() ?? 'CURRENT SEASON'} · LIVE RANKINGS</div><h2>Season standings</h2></div><span className="select-period">Top 100</span></div><div className="leader-table-head"><span>RANK</span><span>PLAYER</span><span>PORTFOLIO VALUE</span><span>SEASON RETURN</span></div>{loading?[1,2,3,4,5].map(i=><Skeleton key={i} className="leader-skeleton"/>):players.map((p,i)=><div className={`leader-table-row ${p.you?'your-rank':''}`} key={`${p.rank}-${p.name}`}><div className={`rank-medal ${i<3?'top-three':''}`}>{i===0?'♛':String(p.rank).padStart(2,'0')}</div><div className="leader-player"><div className={`avatar ${i===0?'avatar-gold':i===1?'avatar-blue':i===2?'avatar-pink':'avatar-purple'}`}>{p.initials}</div><b>{p.name}{p.you?<span className="you-tag">YOU</span>:null}</b></div><b>{money(p.value)}</b><span className={`leader-return ${p.returnPct<0?'down':''}`}>{signedPct(p.returnPct)}</span></div>)}</section><aside className="panel your-rank-card"><div className="rank-card-icon"><Trophy size={19}/></div><div className="panel-overline">YOUR SEASON</div><h2>Keep climbing,<br/>{playerName}.</h2><p>You're in the top <b>{percentile ? `${percentile}%` : '—'}</b> of players. A strong week could push you into the top three.</p><div className="your-rank-stats"><div><span>Current rank</span><b>#{rank ?? '—'} <small>of {gameState?.playerCount.toLocaleString() ?? '—'}</small></b></div><div><span>Season return</span><b className={seasonReturn==null?'':seasonReturn>=0?'positive':'negative'}>{seasonReturn==null?'—':signedPct(seasonReturn)}</b></div><div><span>To next rank</span><b>{toNext ? money(toNext) : '—'}</b></div></div><div className="rank-progress"><span style={{width:`${progress}%`}}/></div><small className="progress-label">{progress}% of the way to #{Math.max((rank??2)-1,1)}</small></aside></div></> }

const QTY_RE = /^(?:\d{0,12})(?:\.\d{0,6})?$/;
function TradeMenu({ stock, label, onTrade }: { stock: Stock; label?: string; onTrade: (stock: Stock, side: 'buy' | 'sell') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const choose = (side: 'buy' | 'sell') => { setOpen(false); onTrade(stock, side); };
  return <div className="trade-menu" ref={ref}>{label ? <button type="button" className="trade-small" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}>{label}</button> : <button type="button" className="icon-btn row-action" aria-label={`Trade ${stock.symbol}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}><MoreHorizontal size={18}/></button>}{open ? <div className="trade-menu-pop" role="menu">{stock.active !== false ? <button type="button" role="menuitem" onClick={() => choose('buy')}>Buy</button> : null}<button type="button" role="menuitem" onClick={() => choose('sell')}>Sell</button></div> : null}</div>;
}
function PeriodMenu({ range, onChange }: { range: string; onChange: (range: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const label = CHART_RANGES.find(([id]) => id === range)?.[1] ?? 'This week';
  return <div className="period-menu" ref={ref}><button type="button" className="select-period" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}>{label} <ChevronDown size={14}/></button>{open ? <div className="period-menu-pop" role="menu">{CHART_RANGES.map(([id, text]) => <button type="button" role="menuitem" key={id} className={range === id ? 'active' : ''} onClick={() => { onChange(id); setOpen(false); }}>{text}</button>)}</div> : null}</div>;
}
function TradeModal({ stock, side: initialSide, cash, owned, onClose, onConfirm }: { stock:Stock; side:'buy'|'sell'; cash:number; owned:number; onClose:()=>void; onConfirm:(side:'buy'|'sell',qty:number,symbol:string,idempotencyKey:string)=>Promise<void> }) { const modalRef=useRef<HTMLDivElement>(null); const quantityRef=useRef<HTMLInputElement>(null); const onCloseRef=useRef(onClose); onCloseRef.current=onClose; const idempotencyKey=useRef(crypto.randomUUID()); const [side,setSide]=useState(initialSide); const [qty,setQty]=useState('1'); const [confirm,setConfirm]=useState(false); const [submitting,setSubmitting]=useState(false); const [localError,setLocalError]=useState(''); const quantity=Number(qty)||0; const liquidate=side==='sell'&&owned>0&&Math.abs(quantity-owned)<1e-9; const estimate=orderTotal(side,quantity,stock.price,liquidate); const affordable=side==='buy'?estimate<=cash+1e-9:quantity<=owned+1e-9; const max=side==='buy'?maxAffordableQuantity(cash,stock.price):owned; const setQtySafe=(v:string)=>{if(v===''||QTY_RE.test(v)){setQty(v);setLocalError('')}}; const step=(delta:number)=>setQtySafe(formatQuantity(Math.max(0, Math.round((quantity+delta)*1e6)/1e6)));
 useEffect(() => { idempotencyKey.current = crypto.randomUUID(); }, [stock.symbol, side, qty]);
 useEffect(() => { quantityRef.current?.focus(); }, [stock.symbol]);
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  return () => previous?.focus();
 }, []);
 useEffect(() => {
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (submitting) return; if (confirm) { setConfirm(false); return; } onCloseRef.current(); return; }
    if (event.key !== 'Tab') return;
    const items = modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
    if (!items?.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  return () => document.removeEventListener('keydown', onKey, true);
 }, [confirm, submitting]);
 const problem = () => { if (!(quantity > 0)) return 'Enter a share quantity greater than zero.'; if (side === 'buy' && estimate < MIN_BUY_NOTIONAL) return 'Minimum buy is $1.00.'; if (side === 'sell' && estimate < DUST_CLOSE && !liquidate) return 'That sale is below $0.01. Sell the rest of the position or increase the quantity.'; if (!affordable) return side === 'buy' ? 'This order is above your available buying power.' : 'You do not have enough shares for this order.'; return ''; };
 const submit=async()=>{const message=problem(); if(message){setLocalError(message);return;} setSubmitting(true); try { await onConfirm(side, quantity, stock.symbol, idempotencyKey.current); } catch (err) { setLocalError(err instanceof Error ? err.message : 'Trade failed. Please try again.'); } finally { setSubmitting(false); }};
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){if(submitting)return; if(confirm){setConfirm(false);return;} onClose();}}}><div ref={modalRef} className="trade-modal" role="dialog" aria-modal="true" aria-labelledby="trade-heading"><div className="modal-header"><div><div className="panel-overline">PLACE AN ORDER</div><h2 id="trade-heading">Trade {stock.symbol}</h2></div><button className="icon-btn" onClick={()=>{if(!submitting)onClose()}} aria-label="Close trade dialog" disabled={submitting}><X size={19}/></button></div><div className="modal-stock"><StockAvatar stock={stock}/><span><b>{stock.symbol}</b><small>{stock.name}</small></span><span className="modal-price"><b>{money(stock.price)}</b><PriceChange value={stock.changePct} compact/></span></div><div className="side-toggle"><button className={side==='buy'?'buy-active':''} onClick={()=>{setSide('buy');setLocalError('');setConfirm(false)}}>Buy</button><button className={side==='sell'?'sell-active':''} onClick={()=>{setSide('sell');setLocalError('');setConfirm(false)}}>Sell</button></div><label className="quantity-label">Quantity <span>Up to 6 decimal places · $1 minimum buy</span></label><div className="quantity-input-wrap"><button onClick={()=>step(-1)} aria-label="Decrease shares">−</button><input ref={quantityRef} inputMode="decimal" aria-label="Number of shares" value={qty} onChange={e=>setQtySafe(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!confirm){const message=problem(); if(message)setLocalError(message); else setConfirm(true)}}} /><button onClick={()=>step(1)} aria-label="Increase shares">+</button></div><div className="max-line"><span>{side==='buy'?'Buying power':'Available shares'}</span><b>{side==='buy'?money(cash):`${formatQuantity(owned)} shares`}</b><button onClick={()=>setQtySafe(formatQuantity(max))}>MAX</button></div><div className="order-summary"><div><span>Market price</span><b>{money(stock.price)} / share</b></div><div><span>Estimated total</span><b>{money(estimate)}</b></div><small><ShieldCheck size={13}/> Final execution price is confirmed by the game server.</small></div>{localError&&<div className="form-error" role="alert">{localError}</div>}{confirm?<div className="confirm-box"><div className="confirm-top"><ShieldCheck size={16}/><b>Confirm this order</b></div><p>{side==='buy'?'Buy':'Sell'} <strong>{formatQuantity(quantity)} {quantity===1?'share':'shares'}</strong> of <strong>{stock.symbol}</strong> for approximately <strong>{money(estimate)}</strong>?</p><div className="confirm-actions"><button className="button-secondary" onClick={()=>setConfirm(false)}>Go back</button><button className={`button-primary ${side==='sell'?'sell-confirm':''}`} disabled={submitting} onClick={submit}>{submitting?'Placing order…':'Confirm '+side}</button></div></div>:<button className={`button-primary modal-submit ${side==='sell'?'sell-confirm':''}`} onClick={()=>{const message=problem(); if(message){setLocalError(message);return;} setConfirm(true)}}>{side==='buy'?'Review buy order':'Review sell order'}<ArrowRight size={16}/></button>}<div className="modal-footnote"><ShieldCheck size={13}/> No real money involved. This is a simulation.</div></div></div> }

function LandingPage({ onSignup, onLogin }: { onSignup:()=>void; onLogin:()=>void }) { return <div className="landing-page"><header className="landing-nav"><div className="brand"><div className="brand-mark"><Activity size={18}/></div><span>ticker<span className="brand-dot">.</span><b>arena</b></span></div><nav><a href="#how-it-works">How it works</a><a href="#competition">The competition</a></nav><div className="landing-actions"><button className="landing-login" onClick={onLogin}>Log in</button><button className="button-primary" onClick={onSignup}>Play for free <ArrowRight size={15}/></button></div></header><main><section className="landing-hero"><div className="landing-hero-copy"><div className="eyebrow"><span className="live-dot"/> A SEASON IS LIVE <span className="landing-pill">NO REAL MONEY</span></div><h1>Trade the market.<br/><em>Own the moment.</em></h1><p>Build a portfolio, make your move, and climb the ranks. All the thrill of trading, none of the risk.</p><div className="landing-cta"><button className="button-primary" onClick={onSignup}>Start playing — it's free <ArrowRight size={16}/></button><button className="landing-login" onClick={onLogin}>I already have an account</button></div><div className="landing-proof"><div className="proof-avatars"><i>JD</i><i>AM</i><i>TK</i><i>+</i></div><span><b>Players compete</b> on the same season leaderboard</span></div></div><div className="landing-visual"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="market-window"><div className="market-window-head"><div><span className="window-dot purple-dot"/><span className="window-dot green-dot"/><span className="window-dot red-dot"/></div><span>MARKET SNAPSHOT</span><span className="live-market"><i/> LIVE</span></div><div className="market-window-body"><div className="hero-index"><span>EXAMPLE PORTFOLIO</span><b>$108,462.80</b><small>↗ illustration only</small></div><svg viewBox="0 0 440 125" preserveAspectRatio="none" aria-label="Rising portfolio performance"><defs><linearGradient id="heroFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a891ff" stopOpacity=".3"/><stop offset="100%" stopColor="#a891ff" stopOpacity="0"/></linearGradient></defs><path d="M0 105 L25 95 43 100 68 75 94 82 119 58 143 69 170 49 196 60 219 34 246 46 271 38 300 45 323 23 345 34 374 16 398 27 440 5 L440 125 L0 125Z" fill="url(#heroFill)"/><path d="M0 105 L25 95 43 100 68 75 94 82 119 58 143 69 170 49 196 60 219 34 246 46 271 38 300 45 323 23 345 34 374 16 398 27 440 5" fill="none" stroke="#a891ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="hero-tickers"><div><div className="stock-avatar" style={{'--stock-color':'#8b79ff'} as React.CSSProperties}>N</div><span><b>NVDA</b><small>NVIDIA</small></span><strong>+2.44%</strong></div><div><div className="stock-avatar" style={{'--stock-color':'#ff776f'} as React.CSSProperties}>T</div><span><b>TSLA</b><small>Tesla</small></span><strong>+3.47%</strong></div></div></div></div><div className="floating-rank"><div className="float-trophy"><Trophy size={15}/></div><span><small>SEASON RANK</small><b>#04 <i>↑ 2 spots</i></b></span></div><div className="floating-pnl"><span>DAY'S P&L</span><b>+$1,284.50</b><small>↗ 2.8% today</small></div></div></section><section id="how-it-works" className="landing-how"><div className="landing-section-heading"><span className="eyebrow">A BETTER WAY TO LEARN THE MARKET</span><h2>Three moves. One <em>big game.</em></h2><p>No complicated setup. Just pick your strategy and see where it takes you.</p></div><div className="how-cards"><article><span className="step-number">01</span><div className="how-icon purple"><Wallet size={19}/></div><h3>Get your starting stack</h3><p>Every player gets a virtual portfolio. No deposits, no risk—just room to experiment and learn.</p></article><article><span className="step-number">02</span><div className="how-icon green"><TrendingUp size={19}/></div><h3>Make your move</h3><p>Explore real stocks, watch the market, and build a portfolio that's yours. Every decision counts.</p></article><article id="competition"><span className="step-number">03</span><div className="how-icon gold"><Trophy size={19}/></div><h3>Climb the leaderboard</h3><p>Compete in live seasons with other players. Turn smart strategy into bragging rights.</p></article></div></section><section className="landing-bottom-cta"><div><div className="eyebrow"><Sparkles size={13}/> YOUR SEAT IN THE ARENA IS WAITING</div><h2>Ready to make your move?</h2><p>Free to play. Built to learn. Made to compete.</p></div><button className="button-primary" onClick={onSignup}>Create your free account <ArrowRight size={16}/></button></section></main><footer className="landing-footer"><div className="brand"><div className="brand-mark"><Activity size={15}/></div><span>ticker<span className="brand-dot">.</span><b>arena</b></span></div><span>© 2026 Ticker Arena. A game for curious minds.</span><span><ShieldCheck size={13}/> Simulation only · No real money</span></footer></div> }

function AuthScreen({ mode, setMode, onBack, onAuth }: { mode:'login'|'signup'; setMode:(m:'login'|'signup')=>void; onBack:()=>void; onAuth:(mode:'login'|'signup',email:string,password:string,name:string)=>Promise<string|null> }) { const [showPassword,setShowPassword]=useState(false); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!email.trim()||!password||(mode==='signup'&&!name.trim())){setError('Please complete all required fields.');return;}if(password.length<8){setError('Password must be at least 8 characters.');return;}setError('');setBusy(true);try{const message=await onAuth(mode,email.trim(),password,name);if(message)setError(message)}catch{setError('Something went wrong. Please try again.')}finally{setBusy(false)}};return <div className="auth-screen"><div className="auth-left"><div className="brand auth-brand"><div className="brand-mark"><Activity size={18}/></div><span>ticker<span className="brand-dot">.</span><b>arena</b></span></div><div className="auth-promo"><span className="eyebrow"><span className="live-dot"/> A SEASON IS LIVE</span><h1>The market<br/>is your <em>arena.</em></h1><p>Build your portfolio. Outplay the market. Climb the leaderboard.</p><div className="promo-stats"><div><b>Free</b><span>to play</span></div><div><b>Live</b><span>ranked seasons</span></div></div></div><div className="auth-quote"><span>“</span><p>It's the most fun I've had learning how the market works. Every day feels like game day.</p><small>— Alex R. · Season 03 finalist</small></div><div className="auth-dots"><i/><i/><i/></div></div><div className="auth-right"><button className="auth-mobile-brand" onClick={onBack}><div className="brand-mark"><Activity size={17}/></div> ticker<span>.</span>arena</button><button className="auth-back" onClick={onBack}>← Back to home</button><div className="auth-form-wrap"><div className="auth-form-heading"><div className="auth-icon"><Zap size={19}/></div><h2>{mode==='signup'?'Create your account':'Welcome back'}</h2><p>{mode==='signup'?'Start trading the market without risking a cent.':'Pick up where you left off in the Arena.'}</p></div><form onSubmit={submit} noValidate>{mode==='signup'&&<label>Display name<div className="auth-input"><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Jordan Davis" autoComplete="name"/></div></label>}<label>Email address<div className="auth-input"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></div></label><label>Password<div className="auth-input"><input type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={mode==='signup'?'new-password':'current-password'}/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>{mode==='login'&&<button type="button" className="forgot-button">Forgot password?</button>}{error&&<div className="form-error">{error}</div>}<button className="button-primary auth-submit" type="submit" disabled={busy}>{busy?'Just a sec…':mode==='signup'?'Create free account':'Log in'}<ArrowRight size={16}/></button></form><div className="auth-switch">{mode==='signup'?'Already playing?':'New to Ticker Arena?'} <button onClick={()=>{setMode(mode==='signup'?'login':'signup');setError('')}}>{mode==='signup'?'Log in':'Create an account'}</button></div><div className="auth-legal">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</div><div className="auth-trust"><ShieldCheck size={14}/> 100% free · No real money · Just for fun</div></div></div></div> }

export default App;
