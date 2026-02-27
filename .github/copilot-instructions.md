# Copilot Instructions — calcio-bliliardino

Competitive foosball PWA: ELO rankings, matchmaking, real-time lobby, and web-push notifications. Deployed on Vercel (serverless) with Firebase Firestore + Upstash Redis.

## Architecture

```
src/app/              → SPA frontend (vanilla TS, no framework)
  pages/*.page.ts       Page components loaded by router (leaderboard, lobby, matchmaking, etc.)
  components/*.ts       Shared UI: Component base class, header, layout, avatar
  router.ts             Hash-based router (/#/path) with lazy loading & auth guards
  state.ts              Event-emitter singleton (appState) for auth flags and route events
  main.ts               Bootstrap entry point
src/services/         → Domain logic (ELO, players, matches, matchmaking, stats)
  repository.service.ts Conditional import: Firebase in prod, mock in dev (dead-code eliminated)
  repository.firebase.ts / repository.mock.ts
src/models/           → TypeScript interfaces (IPlayer, IMatch, IMessage, IConfirmation)
api/                  → Vercel serverless functions (one file = one endpoint)
  _*.ts                 Internal helpers: _middleware.ts, _auth.ts, _cors.ts, _validation.ts, _redisClient.ts
src/config/           → App configuration (admin whitelist, env config)
public/sw.js          → Service worker (cache-first for Firebase, network-first otherwise)
```

## Component pattern

Pages extend abstract `Component` with lifecycle: `render()` → `mount()` → `destroy()`. `render()` returns an HTML string (no virtual DOM). Use `this.$('selector')` for scoped DOM queries after mount. Keep pages thin — call services for data and logic.

## Key conventions

- **File naming**: `{name}.page.ts`, `{name}.component.ts`, `{name}.service.ts`, `{name}.interface.ts`. API internals: `_{name}.ts`.
- **Service-first**: business logic in `src/services/`, called from pages and API handlers. Never put domain logic in components or route handlers.
- **API handlers as adapters**: validate input (via `_validation.ts`), call service/Redis, return JSON. Apply middleware with composable HOFs: `withSecurityMiddleware`, `withRateLimiting`, `withAuth`.
- **Repository pattern**: `repository.service.ts` uses `__DEV_MODE__` (Vite global, `false` at build) to conditionally import mock vs Firebase. Rollup eliminates the unused branch.
- **Auth**: Firebase email/password on frontend; JWT (HS256, `jose` library) with roles (`admin`, `cron`, `notify`) on API. Admin config in `src/config/admin.config.ts`.
- **Styling**: Tailwind CSS via `@tailwindcss/vite`. Animations via GSAP. Design tokens in `src/app/styles/`.
- **Code style**: ESLint strict + `@stylistic` — single quotes, semicolons, 2-space indent, no trailing commas. Run `npm run lint` to auto-fix.

## Developer workflows

```bash
npm run dev            # Vite dev server (localhost:5173)
npm run build          # Production bundle to ./dist
npm test               # Vitest (happy-dom). Tests in tests/
npm run lint           # ESLint auto-fix
npm run token:admin    # Generate admin JWT for API testing
npx vercel dev         # Local API functions (localhost:3000)
```

Environment: copy `.env.example` → `.env.development.local`. Key vars: `VITE_DEV_MODE`, Firebase creds, `KV_REST_API_*` (Redis), `VAPID_*` keys, `AUTH_JWT_SECRET`.

## Production constraints

- **Vercel free tier**: API functions must return within **12 seconds**. Offload long work to Redis pub/sub or background patterns.
- **Redis (Upstash)**: REST-based client in `api/_redisClient.ts`. Keys auto-prefixed per environment (`{vercelEnv}_{branch}_`). Used for real-time availability (sorted sets), lobby state, and pub/sub events.
- **Vercel Blob**: stores push subscriptions as `{playerId}-subs/{deviceHash}.json`.
- **Security middleware** (`api/_middleware.ts`): payload size limits (10–100KB), prototype pollution blocking, nesting depth cap (10), timeout enforcement (30s default), per-IP rate limiting (100 req/60s).

## Agent rules

- Implement features in `src/services/` and wire through `src/app/pages/` or `api/`. Never bypass the service layer.
- New API endpoints: apply `withSecurityMiddleware` + `withAuth` (see `api/admin-cleanup.ts` as template).
- Add tests under `tests/` using Vitest (organized by domain: `tests/core-flow/`, `tests/auth/`, `tests/dev-mode/`, `tests/api/`). Use `repository.mock.ts` for unit tests.
- Document new env vars in `src/config/env.config.ts` and `.env.example`.
- Keep changes minimal. Do not refactor surrounding code unless directly required.
### Verel rules 
- No more than 12 Serverless Functions can be added