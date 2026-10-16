import { useId, useState } from 'react';
import type { Stock } from '../types';
import { axisLabels, linePath, sliceSeries } from './chartGeometry';

const RANGES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

export function PortfolioChart({ compact = false, values, dates, range, onRange }: { compact?: boolean; values: number[]; dates?: string[]; range?: string; onRange?: (range: string) => void }) {
  const [localRange, setLocalRange] = useState(range ?? '1W');
  const active = range ?? localRange;
  const setRange = (next: string) => { setLocalRange(next); onRange?.(next); };
  const sliced = sliceSeries(values, dates, active);
  const chartValues = sliced.values.length ? sliced.values : values;
  const fillId = `portfolio-${useId().replace(/:/g, '')}`;
  const width = 720, height = compact ? 112 : 185, path = linePath(chartValues, width, height, 5);
  const area = path ? `${path} L ${width} ${height} L 0 ${height} Z` : '';
  const labels = axisLabels(sliced.dates, chartValues.length);
  return <div className={`chart-wrap ${compact ? 'chart-compact' : ''}`}>
    {!compact && <div className="chart-label-row"><span className="chart-label"><i className="legend-dot"/> Portfolio value</span><div className="range-tabs">{RANGES.map(item => <button key={item} type="button" onClick={() => setRange(item)} className={active === item ? 'active' : ''} aria-pressed={active === item}>{item}</button>)}</div></div>}
    <svg className="portfolio-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Portfolio value over the selected range">
      <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a891ff" stopOpacity=".22"/><stop offset="100%" stopColor="#a891ff" stopOpacity="0"/></linearGradient></defs>
      {!compact && [0.25, 0.5, 0.75].map(y => <line key={y} x1="0" x2={width} y1={height * y} y2={height * y} stroke="rgba(255,255,255,.07)" strokeDasharray="4 6"/>)}
      {path && <path d={area} fill={`url(#${fillId})`}/>}{path && <path d={path} fill="none" stroke="#a891ff" strokeWidth="2.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>}
    </svg>
    {!compact && <div className="chart-axis">{labels.map((label, i) => <span key={`${label}-${i}`}>{label}</span>)}</div>}
  </div>;
}

export function StockChart({ stock, compact = false }: { stock: Stock; compact?: boolean }) {
  const positive = stock.changePct >= 0, color = positive ? '#40d6a2' : '#ff777e';
  const fillId = `stock-${useId().replace(/:/g, '')}`;
  const vals = stock.history.length ? stock.history : [stock.price];
  const width = 720, height = compact ? 48 : 205, path = linePath(vals, width, height, 5), area = path ? `${path} L ${width} ${height} L 0 ${height} Z` : '';
  const labels = axisLabels(stock.historyDates, vals.length);
  return <div className={`stock-chart ${compact ? 'stock-chart-compact' : ''}`}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${stock.symbol} price chart`}>
      {!compact && <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".16"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>}
      {!compact && [0.25, 0.5, 0.75].map(y => <line key={y} x1="0" x2={width} y1={height * y} y2={height * y} stroke="rgba(255,255,255,.07)" strokeDasharray="4 6"/>)}
      {!compact && path && <path d={area} fill={`url(#${fillId})`}/>}{path && <path d={path} fill="none" stroke={color} strokeWidth={compact ? 2 : 2.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>}
    </svg>
    {!compact && <div className="chart-axis">{labels.map((label, i) => <span key={`${label}-${i}`}>{label}</span>)}</div>}
  </div>;
}
