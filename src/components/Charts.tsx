import { useState } from 'react';
import type { Stock } from '../types';

function linePath(values: number[], width: number, height: number, pad = 2) {
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (values.length - 1)) * width} ${height - pad - ((v - min) / range) * (height - pad * 2)}`).join(' ');
}
export function PortfolioChart({ compact = false, values }: { compact?: boolean; values: number[] }) {
  const [range, setRange] = useState('1W');
  const chartValues = values.length >= 2 ? values : [0, 1];
  const width = 720, height = compact ? 112 : 185, path = linePath(chartValues, width, height, 5);
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;
  return <div className={`chart-wrap ${compact ? 'chart-compact' : ''}`}>
    {!compact && <div className="chart-label-row"><span className="chart-label"><i className="legend-dot"/> Portfolio value</span><div className="range-tabs">{['1D','1W','1M','3M','1Y','ALL'].map(r => <button key={r} onClick={() => setRange(r)} className={range === r ? 'active' : ''}>{r}</button>)}</div></div>}
    <svg className="portfolio-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Portfolio value trending upward over time">
      <defs><linearGradient id="portfolio-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a891ff" stopOpacity=".22"/><stop offset="100%" stopColor="#a891ff" stopOpacity="0"/></linearGradient></defs>
      {!compact && [0.25,0.5,0.75].map(y => <line key={y} x1="0" x2={width} y1={height*y} y2={height*y} stroke="rgba(255,255,255,.07)" strokeDasharray="4 6"/>)}
      <path d={area} fill="url(#portfolio-fill)"/><path d={path} fill="none" stroke="#a891ff" strokeWidth="2.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    {!compact && <div className="chart-axis"><span>Sep 23</span><span>Sep 25</span><span>Sep 27</span><span>Today</span></div>}
  </div>;
}
export function StockChart({ stock, compact = false }: { stock: Stock; compact?: boolean }) {
  const positive = stock.changePct >= 0, color = positive ? '#40d6a2' : '#ff777e';
  const vals = stock.history, width = 720, height = compact ? 48 : 205, path = linePath(vals, width, height, 5), area = `${path} L ${width} ${height} L 0 ${height} Z`;
  return <div className={`stock-chart ${compact ? 'stock-chart-compact' : ''}`}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${stock.symbol} price chart`}>
      {!compact && <defs><linearGradient id="stock-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".16"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>}
      {!compact && [0.25,0.5,0.75].map(y=><line key={y} x1="0" x2={width} y1={height*y} y2={height*y} stroke="rgba(255,255,255,.07)" strokeDasharray="4 6"/>)}
      {!compact && <path d={area} fill="url(#stock-fill)"/>}<path d={path} fill="none" stroke={color} strokeWidth={compact ? 2 : 2.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    {!compact && <div className="chart-axis"><span>9:30 AM</span><span>11:30 AM</span><span>1:30 PM</span><span>4:00 PM</span></div>}
  </div>;
}
