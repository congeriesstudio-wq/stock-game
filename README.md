# Stock Trading Game Backend

Supabase/PostgreSQL backend and Vercel TypeScript API for a virtual-cash stock trading game.

## Quick start

1. Install Node.js 20+, Docker, and the Supabase CLI.
2. Run `npm install` and `npx supabase start`.
3. Copy `.env.example` to `.env.local`. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the local Supabase status output. Set `CRON_SECRET` to a long random value.
4. Run `npx supabase db reset` to apply migrations and seeded demo data.
5. Run `npm run dev` to serve API routes locally.
6. Run `npm test` and `npm run typecheck`.

See [Backend & Frontend API Guide](docs/BACKEND.md) for schema relationships, RLS, environment setup, authentication, endpoints and error contracts, quote-provider design, deployment, and integration test instructions.

## Main routes

- `POST /api/seasons/join`
- `POST /api/trades`
- `GET /api/seasons/leaderboard?seasonId=<uuid>`
- Scheduler-only `POST /api/market/refresh`

All account and portfolio operations are server-validated. Trade execution uses a locked, atomic PostgreSQL function with database-level idempotency. Browser roles cannot write financial tables or invoke privileged trade RPCs.

## Branch

Implementation branch: `backend/supabase-trading`.
