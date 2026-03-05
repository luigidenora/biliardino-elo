# Copilot Instructions — calcio-biliardino

Competitive foosball PWA: ELO rankings, matchmaking, real-time lobby, and web-push notifications. Deployed on Vercel (serverless) with Firebase Firestore + Upstash Redis.

## Architecture

```
src/app/              → SPA frontend (vanilla TS, no framework)
  pages/*.page.ts       Page components loaded by router
  components/*.ts       Shared UI components (all extend Component base class)
  templates/            HTML template files (.html?raw)
  router.ts             History API router with lazy loading & auth guards
  state.ts              Event-emitter singleton (appState) for auth flags and route events
  main.ts               Bootstrap entry point
src/services/         → Domain logic (ELO, players, matches, matchmaking, stats)
  repository.service.ts Conditional import: mock in dev, Firebase in prod (dead-code eliminated)
  repository.firebase.ts / repository.mock.ts
src/models/           → TypeScript interfaces (IPlayer, IMatch, IMessage, IConfirmation)
api/                  → Vercel serverless functions (one file = one endpoint)
  _*.ts                 Internal helpers: _middleware.ts, _auth.ts, _cors.ts, _validation.ts, _redisClient.ts
src/config/           → App configuration (admin whitelist, env config)
public/sw.js          → Service worker (cache-first for Firebase, network-first otherwise)
```

---

## Component Pattern — MANDATORY

**Every UI element is a Component.** Pages, headers, avatars, dialogs, lists — all must be classes that extend `Component`.

### Base class (`src/app/components/component.base.ts`)

```ts
export abstract class Component {
  protected el: HTMLElement | null = null;
  protected params: Record<string, string> = {};

  setParams(params: Record<string, string>): void { this.params = params; }
  setElement(el: HTMLElement | null): void { this.el = el; }

  abstract render(): string | Promise<string>;
  mount(): void {}
  destroy(): void {}

  protected $(selector: string): HTMLElement | null { ... }
  protected $$(selector: string): HTMLElement[] { ... }
  protected $id(id: string): HTMLElement | null { ... }
}
```

### Lifecycle — always follow this order

```
new MyComponent()
  → setParams(params)      // inject route params (router calls this)
  → setElement(el)         // inject DOM container (router calls this)
  → await render()         // return HTML string — fetch data here if needed
  → mount()                // bind events, start intervals, run GSAP animations
  → [ navigate away ]
  → destroy()              // clear intervals, cancel animation frames, remove listeners
```

### Rules

- **Every component must extend `Component`** — no standalone functions that manage DOM state.
- `render()` returns a plain HTML string (no virtual DOM). May be `async` for data fetching.
- `mount()` is for side-effects only: event binding, timers, GSAP. Never access DOM inside `render()`.
- `destroy()` must clean up **every** interval, timeout, and animation frame started in `mount()`.
- Use `this.$()`, `this.$$()`, `this.$id()` for scoped DOM access — never use bare `document.querySelector` inside a component.
- Keep pages thin: call services for data; never put domain logic inside a component.

### Minimal page template

```ts
// src/app/pages/my-page.page.ts
import { Component } from '../components/component.base';
import { html, rawHtml } from '../utils/html-template.util';
import { MyService } from '../../services/my.service';
import template from './my-page.page.html?raw';

export default class MyPage extends Component {
  override async render(): Promise<string> {
    const data = await MyService.getData();
    return html(template, {
      cards: rawHtml(this.renderCards(data)),
    });
  }

  override mount(): void {
    refreshIcons();
    this.$('#my-btn')?.addEventListener('click', () => this.handleClick());
    gsap.from('.card', { y: 20, duration: 0.4, ease: 'power2.out' });
  }

  override destroy(): void {
    // clear intervals/frames started in mount()
  }

  private renderCards(data: MyData[]): string {
    return data.map(item =>
      `<div class="card glass-card-gold rounded-xl p-4">${item.title}</div>`
    ).join('');
  }

  private handleClick(): void { /* ... */ }
}
```

```html
<!-- my-page.page.html -->
<div id="my-page" class="space-y-5">
  {{cards}}
</div>
```

---

## HTML Templates and String Binding — MANDATORY

Every component uses `html()` + `.html?raw`. The `.ts` file contains only logic; the `.html` file contains structure.

### How it works

```ts
import template from './my-component.html?raw';   // raw HTML file
import { html, rawHtml } from '../utils/html-template.util';

// {{key}} placeholders in the HTML are replaced with values
const result = html(template, { title, description });

// rawHtml() bypasses XSS escaping — use for sub-components and SVG only
const result = html(template, { icon: rawHtml(svgString), rows: rawHtml(rowsHtml) });
```

### Rules

- **Every `render()` method must use `html(template, dict)` with a `.html?raw` import** — no inline HTML strings returned directly from `render()`.
- Create one `.html` file per component (or per major render function for non-class helpers).
- `{{key}}` is HTML-escaped by default — always use for user-facing data (names, scores, labels).
- `rawHtml()` is exclusively for sub-component HTML and SVG. Never wrap raw user input in `rawHtml()`.
- Dynamic fragments built from arrays or conditionals (`.map()`, player rows, nav items) are assembled in TypeScript helper methods and passed as `rawHtml()` bindings to the parent template.
- Short helper methods that build repetitive list items (< ~8 lines each iteration) may remain as TypeScript template literals and must be wrapped with `rawHtml()` at the injection point.
- Supports dot-notation access `{{player.name}}` and array flattening `{{items}}`.

---

## Routing and Adding Pages

The router (`src/app/router.ts`) uses the History API with dynamic imports (code splitting per page).

### Route definition

```ts
// src/app/router.ts — add your route to the routes array
{
  path: '/my-page',
  load: () => import('./pages/my-page.page'),   // default export must be a Component class
  title: 'My Page',
  requireAuth: false,     // set true to require Firebase login
  requireAdmin: false     // set true to require admin role
}
```

- Param segments: `/profile/:id` — available as `this.params.id` inside the component.
- Page transitions are handled automatically (GSAP fade + slide 0.15 s out / 0.25 s in).
- Hash-based legacy URLs (`#/path`) are redirected automatically.

### Steps to add a new page

1. Create `src/app/pages/my-page.page.ts` (extends `Component`, `export default`).
2. Add a route entry to the `routes` array in `router.ts`.
3. Optionally add a nav link in `header.component.ts` (`navItems` array).

---

## Services — data layer

Services live in `src/services/`. They are **module-level singletons** that own the data and expose pure functions. Components call services; services never import components.

```ts
// Correct usage inside a component
import { getAllPlayers, getRank } from '../../services/player.service';

override async render(): Promise<string> {
  const players = getAllPlayers();
  return `...`;
}
```

### Existing services

| Service | Responsibility |
|---|---|
| `player.service.ts` | In-memory player map, ranks, ELO mutations |
| `match.service.ts` | Match list, ELO history |
| `elo.service.ts` | ELO formula, K-factor, expected score |
| `stats.service.ts` | Win rate, best ELO, goal differential |
| `message.service.ts` | Lobby chat messages |
| `matchmaking.service.ts` | Team balancing algorithm |
| `repository.service.ts` | Dev/prod data source switch (see below) |

### Repository pattern

`repository.service.ts` uses `__DEV_MODE__` (Vite compile-time constant) to switch between mock and Firebase:

```ts
const repo = __DEV_MODE__
  ? await import('./repository.mock')
  : await import('./repository.firebase.js');

export const fetchPlayers = repo.fetchPlayers;
// ...
```

In dev mode usa dati in memoria (`repository.mock.ts`). In produzione usa Firebase (`repository.firebase.ts`). Rollup elimina il ramo non usato (dead-code elimination).

**Always import from `repository.service.ts`**, never from the Firebase or mock files directly.

---

## Redis (`@upstash/redis`)

Redis is used exclusively in API serverless functions — never in the frontend.

### Client (`api/_redisClient.ts`)

```ts
import { Redis } from '@upstash/redis';

// Keys are auto-prefixed with the environment: "production_", "preview_", "development_"
export const redis = wrap(_redis, ['get', 'set', 'del', 'keys', 'lrange', 'lpush', 'expire', 'incr', 'ttl', 'scan']);
export const redisRaw = _redis;    // Use for pipeline() and publish()
export const redisPrefix: string;  // e.g. "production_"
```

### Usage patterns

```ts
// Single operation — use the wrapped client (auto-prefix applied)
await redis.set('lobby_state', JSON.stringify(state), { ex: 3600 });
const state = await redis.get('lobby_state');

// Atomic pipeline — use redisRaw and prefix manually
const p = redisRaw.pipeline();
p.hset(prefixed('availability'), { [playerId]: JSON.stringify(data) });
p.zadd(prefixed('availability_ts'), { score: Date.now(), member: String(playerId) });
const [,] = await p.exec();

// Pub/sub for real-time events
await redisRaw.publish('availability_events', JSON.stringify({ playerId }));
```

### Data structures in use

| Key pattern | Structure | Purpose |
|---|---|---|
| `{env}_availability` | Hash | Player availability map |
| `{env}_availability_ts` | Sorted set | Availability timestamps |
| `{env}_lobby_*` | Hash/List | Lobby state and chat |
| `{env}_push_*` | Hash | Push subscription tracking |

---

## API Endpoints

One file = one endpoint in `api/`. Internal helpers are prefixed with `_`.

### Endpoint template

```ts
// api/my-endpoint.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withSecurityMiddleware } from './_middleware';
import { withAuth } from './_auth';
import { validateBody } from './_validation';
import { redis } from './_redisClient';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { field } = validateBody(req.body, ['field']);

  const value = await redis.get('some_key');
  res.status(200).json({ value });
}

export default withSecurityMiddleware(withAuth(handler, { roles: ['admin'] }));
```

### Rules

- Always wrap with `withSecurityMiddleware` (payload size, prototype pollution, rate limiting).
- Add `withAuth` for protected routes. Roles: `admin`, `cron`, `notify`.
- Validate input via `_validation.ts` — never trust `req.body` directly.
- API functions must return within **12 seconds** (Vercel free tier hard limit).
- **Maximum 12 serverless functions total** (Vercel free tier).

---

## Key conventions

- **File naming**: `{name}.page.ts`, `{name}.component.ts`, `{name}.service.ts`, `{name}.interface.ts`. API internals: `_{name}.ts`.
- **Styling**: Tailwind CSS via `@tailwindcss/vite`. Animations via GSAP. Design tokens in `src/app/styles/`. Use the existing `glass-card-gold`, `glass-card` utility classes for cards.
- **Icons**: Lucide icons via `refreshIcons()` — call it in every `mount()`.
- **Auth**: Firebase email/password on frontend; JWT (HS256, `jose` library) on API. Admin config in `src/config/admin.config.ts`.
- **Code style**: ESLint strict + `@stylistic` — single quotes, semicolons, 2-space indent, no trailing commas. Run `npm run lint` to auto-fix.
- **Reuse before creating**: check `src/app/components/` before writing a new component. `renderPlayerAvatar()`, `renderFoosballLogo()`, `HeaderComponent`, `LayoutComponent` are all available.

---

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

---

## Agent rules

- **Extend `Component`** for every new UI element — no exceptions.
- **Every `render()` must use `html(template, dict)` + `.html?raw`** — no inline HTML strings in `render()` methods. Dynamic fragments stay in TypeScript helpers and are composed via `rawHtml()` bindings.
- **Call services** for data; never put business logic in components or route handlers.
- **Use `@upstash/redis`** (imported from `api/_redisClient.ts`) for all Redis operations in API functions. Never use the Redis client in frontend code.
- **New pages**: create the page file, add a route to `router.ts`, done. Do not modify bootstrap or router internals.
- **New API endpoints**: use `withSecurityMiddleware` + `withAuth` as shown above. Check the 12-function limit before adding.
- **Tests**: add under `tests/` with Vitest organized by domain (`tests/core-flow/`, `tests/auth/`, `tests/api/`).
- **New env vars**: document in `src/config/env.config.ts` and `.env.example`.
- Keep changes minimal. Do not refactor surrounding code unless directly required.
