import type { CSSProperties, ReactNode } from 'react';
import { Activity } from 'lucide-react';
import type { Stock } from '../types';

export type ExperimentContext = {
  stocks: Stock[];
  loading: boolean;
  onSelectStock: (symbol: string) => void;
};

export type UiVariant = {
  id: string;
  label: string;
  description: string;
  /** Class added to the app root while this variant is active. */
  className?: string;
  /**
   * CSS applied only while this variant is active.
   * Keep every visual rule in this string so a new variant is one entry in this file.
   */
  css?: string;
};

export type ExperimentalTab = {
  id: string;
  label: string;
  description: string;
  icon?: ReactNode;
  render: (ctx: ExperimentContext) => ReactNode;
};

const money = (value: number) => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * UI variants. Add one object to register a new layout.
 * Open it with `?ui=<id>` or the Experiments panel.
 */
export const UI_VARIANTS: UiVariant[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'The stock Ticker Arena layout.',
    className: 'ui-default',
  },
  {
    id: 'compact',
    label: 'Compact',
    description: 'Denser type and a warm amber accent.',
    className: 'ui-compact',
    css: `
      html:has([data-ui="compact"]) { --bg:#14110c; background:#14110c; }
      [data-ui="compact"] { --bg:#14110c; --panel:#1c1812; --panel-2:#241f17; --line:#3a3226; --purple:#f0a05a; --text:#f6efe4; background:#14110c; color:#f6efe4; font-size:13px; }
      [data-ui="compact"] .sidebar { width:220px; padding-top:16px; background:#1a1610; border-right-color:#3a3226; }
      [data-ui="compact"] .main-shell { margin-left:220px; }
      [data-ui="compact"] .topbar { background:#14110c; }
      [data-ui="compact"] .page-content { padding:18px 22px 48px; }
      [data-ui="compact"] .brand-mark { background:linear-gradient(145deg,#f0a05a,#c46a2a); box-shadow:0 4px 15px #f0a05a44; }
      [data-ui="compact"] .nav-item.active { color:#ffd7ad; background:#3a2c1c; box-shadow:inset 2px 0 #f0a05a; }
      [data-ui="compact"] .button-primary { background:#e08a3c; border-color:#f0a05a; color:#1a1208; }
      [data-ui="compact"] .panel { background:#1c1812; }
      @media (max-width:1150px) {
        [data-ui="compact"] .sidebar { width:200px; }
        [data-ui="compact"] .main-shell { margin-left:200px; }
      }
      @media (max-width:900px) {
        [data-ui="compact"] .main-shell { margin-left:0; }
      }
    `,
  },
];

/**
 * Experimental tabs. Add one object to register a new tab.
 * Turn it on with `?tabs=<id>` (comma-separate several ids) or the Experiments panel.
 */
export const EXPERIMENTAL_TABS: ExperimentalTab[] = [
  {
    id: 'pulse',
    label: 'Pulse',
    description: 'Biggest price swings in the current season.',
    icon: <Activity size={18} />,
    render: ({ stocks, loading, onSelectStock }) => {
      const movers = stocks.filter(stock => stock.active !== false).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
      return (
        <div className="experiment-tab" data-experiment-tab="pulse">
          <div className="page-title-row">
            <div>
              <div className="eyebrow">EXPERIMENT · MARKET PULSE</div>
              <h1>Pulse</h1>
              <p className="welcome-subtitle">The biggest moves right now, largest swing first.</p>
            </div>
          </div>
          <section className="panel holdings-panel">
            {loading ? <div className="skeleton-list">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton row-skeleton" />)}</div> : movers.length ? movers.map(stock => (
              <button className="watch-row" key={stock.symbol} onClick={() => onSelectStock(stock.symbol)}>
                <span className="stock-avatar" style={{ '--stock-color': stock.color } as CSSProperties}>{stock.symbol.slice(0, 1)}</span>
                <span className="watch-name"><b>{stock.symbol}</b><small>{stock.name}</small></span>
                <span className="watch-price"><b>{money(stock.price)}</b><span className={`price-change compact ${stock.changePct >= 0 ? 'up' : 'down'}`}>{stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}%</span></span>
              </button>
            )) : <div className="empty-state"><b>No stocks to rank yet</b><p>Pulse fills in once market data loads.</p></div>}
          </section>
        </div>
      );
    },
  },
];
