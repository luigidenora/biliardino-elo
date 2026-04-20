# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Biliardino ELO è una PWA SPA per il tracciamento di partite di calciobalilla (biliardino) con sistema ELO, real-time lobby, matchmaking e push notifications. Stack: TypeScript vanilla (no framework), Vite, Firebase Firestore, Upstash Redis, Vercel Serverless Functions.

## Comandi principali

```bash
npm run dev          # Vite dev server (localhost:5173)
npx vercel dev       # API serverless locale (localhost:3000)
npm run build        # Build produzione → ./dist
npm test             # Vitest (happy-dom)
npm run test:ui      # Vitest UI dashboard
npm run test:e2e     # Playwright e2e
npm run lint         # ESLint con auto-fix

# Token JWT per sviluppo
npm run token         # user role
npm run token:admin   # admin role
npm run token:cron    # cron role
npm run token:notify  # notify role
```

## Architettura

### Frontend (SPA Vanilla TS)

Ogni pagina/componente UI estende la classe `Component` (`src/app/components/component.base.ts`). Il ciclo di vita è: `render()` (ritorna HTML string) → `mount()` (bind eventi, GSAP) → `destroy()` (cleanup). Il router (`src/app/router.ts`) gestisce dynamic imports, code splitting, auth guards, e transizioni GSAP.

I servizi in `src/services/` sono singleton module che possiedono lo stato dei dati. Non importano mai componenti. Il `repository.service.ts` astrae l'accesso ai dati tra mock (dev) e Firebase (prod) tramite dead-code elimination Rollup.

### HTML Templates

```typescript
import template from './my.html?raw';
import { bindHtml, rawHtml } from '../utils/html-template.util';
const html = bindHtml(template)`${{ title }}`;
// {{key}} è auto-escaped; usare rawHtml() per SVG/HTML raw
```

### API (Vercel Serverless)

Ogni file in `api/` è un endpoint. La security stack è:

```typescript
export default withSecurityMiddleware(
  withAuth(handler, { roles: ['admin'] })
);
```

Middleware: `withSecurityMiddleware` (payload, prototype pollution, timeout) → `withAuth` (JWT + role check) → handler.

### ELO System

K-factor dinamico (StartK=72 → FinalK=24). Formula: `1 / (1 + 10^((eloB - eloA) / 300))`. Partite con meno di 8 gol totali non aggiornano l'ELO. Implementato in `src/services/elo.service.ts`.

## Database

**Firestore collections:** `players`, `matches`, `running-match`, `cache-control`

**Redis (Upstash, auto-prefissato con `{env}_`):**
- `{env}_availability` → Hash disponibilità giocatori
- `{env}_lobby_*` → Stato lobby real-time
- Pub/Sub: `availability_events`

**localStorage frontend:** `biliardino_player_id`, `biliardino_player_name`, cache hash per Firestore

## Pattern di codice

- `@/*` path alias → `src/*`
- Single quotes, 2-space indent, semicolons (ESLint)
- `noImplicitAny: false` nel tsconfig (strict ma flessibile)
- Admin IDs hardcodati in `src/config/admin.config.ts`
- Firebase config in `src/utils/firebase.util.ts`

## Variabili d'ambiente

Frontend: `VITE_DEV_MODE`, `VITE_VAPID_PUBLIC_KEY`, `VITE_API_BASE_URL`
Backend (Vercel): `AUTH_JWT_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `VAPID_PRIVATE_KEY`, `ACCESS_CONTROL_ALLOW_ORIGIN`
