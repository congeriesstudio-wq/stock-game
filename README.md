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

## Web and Android app (Capacitor)

The same Vite/React frontend ships as a website (Vercel) and an installable Android app (`com.congeriesstudio.stockgame`, name "Ticker Arena"). Version is taken from `package.json` (`versionName` = version, `versionCode` = `major*10000 + minor*100 + patch`).

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | client build | Empty/unset on web (same-origin `/api`). **Required for Android**, e.g. `https://your-deployment.vercel.app` (no trailing slash). |
| `ALLOWED_ORIGINS` | Vercel API | Optional comma-separated extra CORS origins. WebView origins `https://localhost`, `capacitor://localhost`, `http://localhost` are always allowed. |
| `SUPABASE_*`, `CRON_SECRET` | Vercel API | See `.env.example`. |

Tokens are stored via `src/services/tokenStorage.ts`: Android Keystore-backed secure storage on device, `localStorage` in browsers. Use `apiFetch` (`src/services/apiClient.ts`) for API calls so the base URL and bearer token are applied.

### Connect to Supabase (required for a live app)
The UI talks to Supabase directly for sign-up/login and read-only data (RLS-protected), and to the Vercel API for joining a season, trading and the leaderboard. If `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are unset the web app falls back to the built-in demo (mock) data.
1. **Database:** in Supabase → SQL Editor run `supabase/migrations/202609290001_initial_schema.sql`, then `supabase/seed/seed.sql` (creates the demo season, assets and quotes). Or via CLI: `npx supabase link --project-ref hqrhfdrrrboptihwctwb && npx supabase db push`, then run the seed SQL.
2. **Auth:** Supabase → Authentication → Providers → Email enabled. For instant sign-in turn off "Confirm email", otherwise users must confirm via email before logging in.
3. **Vercel env vars:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (server) and `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client build). Redeploy.
4. **Quote refresh:** trades fail with `quote_stale` if quotes are older than 15 minutes. Add repo secrets `APP_URL` (your Vercel URL) and `CRON_SECRET`; the **Refresh simulated quotes** workflow calls `/api/market/refresh` every 10 minutes (it can also be run manually).
5. **Android:** add repo Actions variables `VITE_API_BASE_URL` (Vercel URL), `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then run the **Android debug APK** workflow.

### Web local dev
`npm install`, then `npm run dev` (frontend, http://localhost:5173) and `npm run dev:api` (Vercel API routes).

### Web deploy
Push to Vercel as before (`npm run build` outputs `dist/`). Do not set `VITE_API_BASE_URL` for the web deployment.

### Android debug APK
Requires JDK 21 and the Android SDK (or use the **Android debug APK** GitHub Actions workflow, which uploads `app-debug.apk` as an artifact).
```
export VITE_API_BASE_URL=https://your-deployment.vercel.app
npm install
npm run android:debug      # builds web (android mode), cap sync, gradle assembleDebug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`. Install with `adb install -r <apk>`.

### Android release (signed APK / AAB)
1. Create a keystore: `keytool -genkeypair -v -keystore release.jks -alias stockgame -keyalg RSA -keysize 2048 -validity 10000` (keep it outside git and back it up).
2. Copy `android/keystore.properties.example` to `android/keystore.properties` and fill in values (git-ignored).
3. `npm run android:release`
   - APK: `android/app/build/outputs/apk/release/app-release.apk`
   - AAB (Play Store): `android/app/build/outputs/bundle/release/app-release.aab`

### Smoke tests
Automated: `npm test` (includes CORS tests), `npm run typecheck`, `npm run build`.
Manual checklist (web and the installed APK):
1. Web: `npm run build && npm run preview`; load the app, confirm the dashboard renders and a trade can be submitted.
2. API CORS: `curl -i -X OPTIONS <API>/api/trades -H "Origin: https://localhost" -H "Access-Control-Request-Method: POST"` returns `204` with `Access-Control-Allow-Origin: https://localhost`.
3. Android: install the APK, log in (session persists after force-close), confirm markets/leaderboard load (`GET /api/seasons/leaderboard`), and submit a buy and sell (`POST /api/trades`); verify they appear in the portfolio.

