# Test-site experiments

`test-site` can switch UI variants and show optional tabs without editing the game shell. Both are registered in one file:

`src/experiments/registry.tsx`

The app reads `?ui=<variant>&tabs=<id,id>` on load. A flag in the URL wins over the saved choice. The resolved choice is written to `localStorage` under `ticker-arena.experiments` and mirrored back into the address bar. The **Experiments** button (bottom of the workspace) changes the same flags.

Unknown `ui` values fall back to `default`. Unknown tab ids are ignored. `?tabs=` turns every experimental tab off.

## Register a UI variant

1. Open `src/experiments/registry.tsx`.
2. Add one object to the `UI_VARIANTS` array:

```tsx
{
  id: 'compact',
  label: 'Compact',
  description: 'Denser type and a warm amber accent.',
  className: 'ui-compact',
  css: `
    [data-ui="compact"] { background: #14110c; }
  `,
},
```

3. View it at `/?ui=compact` (for local Vite, `http://localhost:5173/?ui=compact`).

`id` is the URL value. Put every visual rule in that entry's `css` string. Selectors should start with `[data-ui="compact"]` so they only apply while the variant is active. Leave the `default` entry in the array; it is the fallback.

## Register an experimental tab

1. Open the same file, `src/experiments/registry.tsx`.
2. Add one object to the `EXPERIMENTAL_TABS` array:

```tsx
{
  id: 'pulse',
  label: 'Pulse',
  description: 'Biggest price swings in the current season.',
  icon: <Activity size={18} />,
  render: ({ stocks, loading, onSelectStock }) => (
    <section className="panel">
      <h1>Pulse</h1>
      {loading ? 'Loading…' : stocks.map(stock => (
        <button key={stock.symbol} onClick={() => onSelectStock(stock.symbol)}>{stock.symbol}</button>
      ))}
    </section>
  ),
},
```

3. View it at `/?ui=default&tabs=pulse`.

The tab stays hidden until its id is in `tabs`. Several tabs are comma-separated: `/?tabs=pulse,another`. `render` receives `{ stocks, loading, onSelectStock }`. Calling `onSelectStock` opens that symbol on Explore markets.

No other file needs an edit. The sidebar lists every enabled tab from this array, in array order.
