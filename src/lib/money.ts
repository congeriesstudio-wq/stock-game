/** Cash is cents. Buys round up, sells round down, so rounding cannot mint value. */
export const MIN_BUY_NOTIONAL = 1;
export const DUST_CLOSE = 0.01;

const micro = (value: number) => Math.round(Number(value.toFixed(6)) * 1e6);

export function orderTotal(side: 'buy' | 'sell', quantity: number, price: number, liquidateAll = false): number {
  const qi = micro(quantity);
  const pi = micro(price);
  if (qi <= 0 || pi <= 0) return 0;
  const cents = side === 'buy' ? Math.ceil((qi * pi) / 1e10) : Math.floor((qi * pi) / 1e10);
  let total = cents / 100;
  if (side === 'sell' && liquidateAll && total < DUST_CLOSE) total = DUST_CLOSE;
  return total;
}

export function roundCash(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatQuantity(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return '0';
  return quantity.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

export function maxAffordableQuantity(cash: number, price: number): number {
  if (!(price > 0) || !(cash > 0)) return 0;
  let qty = Math.floor((cash / price) * 1e6) / 1e6;
  for (let i = 0; i < 1000 && qty > 0 && orderTotal('buy', qty, price) > cash + 1e-9; i++) {
    qty = Math.max(0, Math.round((qty - 0.000001) * 1e6) / 1e6);
  }
  return qty;
}
