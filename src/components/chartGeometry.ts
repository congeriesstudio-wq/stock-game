const RANGE_MS: Record<string, number | null> = {
  '1D': 86_400_000,
  '1W': 7 * 86_400_000,
  '1M': 30 * 86_400_000,
  '3M': 90 * 86_400_000,
  '1Y': 365 * 86_400_000,
  ALL: null,
};

export function linePath(values: number[], width: number, height: number, pad = 2) {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const yAt = (value: number) => height - pad - ((value - min) / range) * (height - pad * 2);
  if (values.length === 1) {
    const y = yAt(values[0]!);
    return `M 0 ${y} L ${width} ${y}`;
  }
  const span = values.length - 1;
  return values.map((value, i) => `${i === 0 ? 'M' : 'L'} ${(i / span) * width} ${yAt(value)}`).join(' ');
}

export function sliceSeries(values: number[], dates: string[] | undefined, range: string) {
  const windowMs = RANGE_MS[range];
  if (windowMs == null || !dates || dates.length !== values.length || values.length === 0) return { values, dates };
  const end = new Date(dates[dates.length - 1]!).getTime();
  if (!Number.isFinite(end)) return { values, dates };
  const start = end - windowMs;
  const nextValues: number[] = [];
  const nextDates: string[] = [];
  dates.forEach((date, i) => {
    const time = new Date(date).getTime();
    if (Number.isFinite(time) && time >= start) {
      nextValues.push(values[i]!);
      nextDates.push(date);
    }
  });
  if (!nextValues.length) return { values: values.slice(-1), dates: dates.slice(-1) };
  return { values: nextValues, dates: nextDates };
}

function formatTick(iso: string, spanMs: number) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  if (spanMs <= 2 * 86_400_000) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function axisLabels(dates: string[] | undefined, count: number): string[] {
  if (dates && dates.length >= 1) {
    const last = dates.length - 1;
    const indexes = dates.length === 1 ? [0] : [0, Math.round(last / 3), Math.round((2 * last) / 3), last];
    const span = new Date(dates[last]!).getTime() - new Date(dates[0]!).getTime();
    return [...new Set(indexes)].map((index) => formatTick(dates[index]!, Number.isFinite(span) ? span : 0));
  }
  const end = new Date();
  const start = new Date(end.getTime() - Math.max(count - 1, 0) * 86_400_000);
  return [start, end].map((date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
}
