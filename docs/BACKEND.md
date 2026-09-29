# Stock game backend

A Supabase-backed, Vercel-hosted TypeScript backend. This repository contains no frontend. Browser clients may use the Supabase **publishable/anon key** for Auth and RLS-protected reads; trades and season enrollment go through the Vercel API. The service-role key is server-only.

## Repository / Git

Work was initialized on branch `backend/supabase-trading`. The repo is designed to be applied to a Supabase project and deployed as Vercel Functions. If integrating into an existing monorepo, move `api/`, `src/`, `supabase/` and the npm scripts into that project; do not copy the service key to client-side environment variables.

## Architecture and integrity

- `profiles.id` is the Supabase Auth user ID. An `auth.users` trigger provisions profiles.
- A season has many participants. Each `(season_id,user_id)` participant has exactly one portfolio.
- Cash is a separate one-to-one `cash_balances` row. Holdings are one row per portfolio/symbol; quantity must stay positive, and sold-out positions are deleted.
- `trades` is the immutable order/execution record; `transactions` is the signed cash ledger (`BUY` negative, `SELL` positive) with a post-trade balance.
- `assets`, `asset_quotes`, and indexed `price_history` separate instrument metadata, latest server-published quote, and history.
- A unique `(portfolio_id,idempotency_key)` makes request retries safe. Portfolio row locking serializes trades for that player's season portfolio. The trade RPC updates balance, holding, trade, and ledger in one PostgreSQL transaction.
- Server trade execution requires `service_role` and browser roles have no execute privilege. The API authenticates the bearer token with Supabase Auth, derives the user ID from that verified identity, reads price only from the server-side provider, and calls the restricted RPC. Client-supplied prices and user IDs are not accepted.
- RLS permits self profile and own portfolio/balance/holding/trade/ledger reads. Public-to-authenticated market and season reference data is read-only. Leaderboard output intentionally publishes display name and current marked-to-market portfolio value, not individual positions or cash.
- Price values are trusted only when written by the server/scheduler. The initial adapter reads simulated quotes in Supabase; implement `StockPriceProvider` for a real vendor later and route trusted quote ingestion through `publish_quotes` or another server-only publisher.

`average_cost` is maintained as quantity-weighted average purchase price for display/analytics. No brokerage fees, shorting, leverage, fractional-cent cash, or extended-hours behavior is implemented. Quantity supports up to six decimal places; cash and trade totals round to cents. Game performance is cash plus current quote value of holdings.

## Local setup

Requirements: Node 20+, npm, Supabase CLI, and Docker for local Supabase.

```sh
npm install
cp .env.example .env.local
# Fill in local Supabase URL, anon key, and service-role key in .env.local
npx supabase start
npx supabase db reset       # applies migrations and configured seed data
npm run dev                 # Vercel dev; API routes run at http://localhost:3000/api/...
```

For Vercel, configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `QUOTE_MAX_AGE_SECONDS`. Set `CRON_SECRET` for the simulated price refresh endpoint. Set `SUPABASE_SERVICE_ROLE_KEY` only in server-side Vercel environment variables; do not prefix it with `NEXT_PUBLIC_`/`VITE_` or send it to a browser.

Seed creates a demo active season, AAPL/MSFT/NVDA/TSLA/GOOGL and simulated quotes/history. It is not real market data. The quote refresh endpoint makes a bounded random walk and writes prices/history atomically. Invoke `POST /api/market/refresh` using `Authorization: Bearer <CRON_SECRET>` from a trusted scheduler (e.g. every few minutes); it is not configured as a Vercel Cron because cadence/availability depends on your Vercel plan. If quotes become older than `QUOTE_MAX_AGE_SECONDS` (default 15 minutes), trades fail closed with `503 quote_stale` until refreshed.

For a deployed Supabase project, link it and apply with `npx supabase link --project-ref <ref>` then `npx supabase db push`. Review `supabase/migrations/` before production use and provision seasons/assets through an administrative deployment process. Mark seasons active only when their dates/status are valid.

## Authentication

Use Supabase Auth client-side with the publishable/anon key (`signUp`, `signInWithPassword`, OAuth, etc.). A verified sign-up automatically creates `profiles` row. Send the Supabase access token on API calls as `Authorization: Bearer <access_token>`. The server checks the token using `auth.getUser(token)`; request body identity is ignored. Auth user deletion cascades profiles and game data.

Example (browser):

```ts
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
const response = await fetch('/api/trades', {
  method: 'POST',
  headers: { Authorization: `Bearer ${data.session!.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ seasonId, symbol: 'AAPL', side: 'buy', quantity: '2', idempotencyKey: crypto.randomUUID() }),
});
```

## Frontend API contract

All API responses are JSON, with no-store caching. Auth-required routes return `401` for absent/invalid tokens. Clients must create one UUID idempotency key per user-intended order and reuse it only when retrying that same order. A key reused with different order parameters returns `409 idempotency_conflict`.

### `POST /api/seasons/join`

Auth: required. Body: `{ "seasonId": "<uuid>" }`. Joins an active season and initializes its cash balance exactly once. Response `200`: `{ "data": { "portfolio_id": "<uuid>", "cash_balance": "100000.00" } }`. Errors: `400 invalid_request`, `401 unauthorized`, `409 season_unavailable`, `500 join_failed`.

### `POST /api/trades`

Auth: required. Body (strict; extra fields rejected):

```json
{ "seasonId":"<uuid>", "symbol":"AAPL", "side":"buy", "quantity":"2.5", "idempotencyKey":"<uuid>" }
```

`side` is `buy` or `sell`; quantity must be a positive decimal with at most six places and at most 1,000,000,000 shares. No client price, portfolio ID, cash amount, or user ID is accepted. The server obtains the current quote and calculates the cent-rounded total. Success `200`:

```json
{ "data": { "trade_id":"<uuid>", "symbol":"AAPL", "side":"buy", "quantity":2.5, "unit_price":227.52, "total":568.8, "cash_balance":99431.2, "duplicate":false, "quote":{"price":"227.520000","quotedAt":"...","source":"simulated"} } }
```

A successful retry returns the original trade ID/price and `duplicate:true`; current cash balance is included. Errors: `400 invalid_request|invalid_quantity|invalid_side`, `401 unauthorized`, `404 asset_not_found|quote_unavailable`, `409 insufficient_cash|insufficient_shares|season_unavailable|idempotency_conflict`, `503 quote_stale`, `500 internal_error|trade_failed`. Never display a locally computed price as the final execution price; use the returned quote/trade values.

### `GET /api/seasons/leaderboard?seasonId=<uuid>`

Auth: required. Response `200`: `{ "data": [{ "user_id":"<uuid>", "display_name":"Trader", "portfolio_value":100000, "rank":1 }] }`. The ranking is computed from current cash plus latest asset quotes. Errors: `400 invalid_request`, `401 unauthorized`, `500 leaderboard_unavailable`.

### `POST /api/market/refresh`

Machine-only; not a user endpoint. Requires `Authorization: Bearer <CRON_SECRET>`. Refreshes all seeded quote rows and appends price history. Returns count and timestamp. Replace its simulated-random-walk logic with a trusted market-data adapter when going live.

### Direct Supabase reads

The browser can use RLS-protected `select` on `profiles` (self only), `portfolios`, `cash_balances`, `holdings`, `trades`, and `transactions` (own portfolio only); public authenticated reads include `seasons`, active `assets`, quotes/history, and participant season data. Writes to all financial/market tables are denied to `anon` and `authenticated`; do not implement client-side balance or position updates.

## Validation and errors

TypeScript/Zod performs request-shape validation. PostgreSQL independently enforces precision, positive quantities/prices, nonnegative balances, foreign keys, uniqueness, active-season status, asset validity, cash sufficiency, and owned-share sufficiency. SQL errors roll the whole trade back. `execute_trade` is the atomic source of truth; don't split a trade into multiple client calls.

## Tests

```sh
npm test
npm run typecheck
```

`tests/validation.test.ts` runs without credentials. To run end-to-end DB/Auth/RLS checks against a local seeded Supabase:

```sh
RUN_SUPABASE_INTEGRATION=1 npm test
```

The integration test provisions two temporary Auth users and covers sign-in, join, buy, sell, duplicate retry, insufficient cash/shares, unauthorized portfolio/balance reads, browser denial of the privileged RPC, and negative-balance/quantity constraints. It deletes test users afterward. Apply `supabase db reset` first. Against remote projects, use a dedicated disposable test project only.

Before release, also exercise the Vercel HTTP handlers with valid/invalid bearer tokens, stale quote, invalid method/body, quote-feed outage, concurrent duplicate submissions and simultaneous spend requests. Run a security review and load test against the target Postgres/Supabase tier.
