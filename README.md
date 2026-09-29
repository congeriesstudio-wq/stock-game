# Ticker Arena frontend

A responsive React + TypeScript stock-market game UI built with Vite. Run `npm install && npm run dev` for local development; run `npm run build` for a production type-check and build.

## Current development mode

The UI currently starts in a seeded demo dashboard so the gameplay screens can be reviewed immediately. **All sample stocks, holdings, trades, portfolio metrics/history, game state, player rankings, and simulated trading behavior are isolated in `src/services/mockApi.ts`.** Replace this module with the backend team's API/server-action adapter before shipping. It is deliberately not a Supabase client and contains no credentials.

Important transaction rule: displayed totals are estimates for presentation only. The UI submits `{ symbol, side, quantity }` to `submitTrade`; a successful server response should provide authoritative cash/holding/trade state. Never accept a client-computed trade total or mutate database state directly from components.

## Frontend structure

- `src/App.tsx` — application shell, navigation, page composition, and UI state
- `src/components/Charts.tsx` — responsive SVG portfolio and stock charts
- `src/services/mockApi.ts` — isolated mock data and trade adapter
- `src/types.ts` — shared stock, holding, trade, and leaderboard contracts
- `src/styles.css`, `src/landing.css` — responsive dark market UI and public landing/auth pages

## Backend adapter expectations

Keep the mock API method shapes or update the call sites and shared types together:

- `getStocks()` — authorized/searchable instruments and quote data
- `getPortfolio()` — authoritative cash, holdings (including market value/P&L/allocation fields), account metrics, recent trades, and portfolio-history points for the authenticated user
- `getLeaderboard()` — rankings and game metric for the active season
- `getGameState()` — active season metadata, player rank, level, streak, and participation counts
- `submitTrade({ symbol, side, quantity })` — validated server-side execution; return the authoritative trade outcome plus updated cash, holdings, metrics, trades, and history (or a typed error) so the client doesn't need an unsafe second request

Auth is a demo-only form flow; wire `AuthScreen` to the backend auth provider and handle session restoration, expiry, and logout server-side. Watchlist state is currently local demo state; replace it with the user's persisted watchlist endpoint. Do not add Supabase service-role credentials to this client app.

## Included UX

Overview, portfolio/allocation, stock discovery/details, buy/sell confirmation flow, season leaderboard, landing page, login/sign-up screens, loading skeletons, empty states, error/success toasts, keyboard shortcuts (`⌘/Ctrl+K`, `N`, `Escape`), and responsive layouts.
