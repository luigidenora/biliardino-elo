# Deployment Guide

Questo progetto supporta deployment su **Vercel** e **GitHub Pages**. Entrambi usano il base path `/biliardino-elo/`.

## 🚀 Vercel

1. Configura Environment Variables:
   - `AUTH_JWT_SECRET`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
   - `BLOB_READ_WRITE_TOKEN`, `KV_REST_API_*` (auto-generate)
   - `ACCESS_CONTROL_ALLOW_ORIGIN`
2. Aggiungi redis e blob db
3. Deploy: `npx vercel env pull` per scaricarle 
4. Dev `npx vercel dev`

**URL**: Frontend `https://your-project.vercel.app/biliardino-elo/`, API `https://your-project.vercel.app/api/*`

## 📦 GitHub Pages

1. Configura GitHub Secrets: `API_BASE_URL`, `VAPID_PUBLIC_KEY`
2. Deploy API separatamente su Vercel
3. Frontend auto-deploya via `.github/workflows/deploy.yml`

**URL**: Frontend `https://username.github.io/biliardino-elo/`, API su Vercel

## 🧪 Development

```bash
npm run dev & npx vercel dev
```

Dev server: `http://localhost:5173/biliardino-elo/`

## 🔐 API Authentication

JWT con ruoli: `admin`, `cron`, `notify`. Header: `Authorization: Bearer <token>`

Genera token:
```bash
AUTH_JWT_SECRET=your-secret node scripts/generate-token.js <role> [expiry]
```

Endpoint protetti richiedono ruolo appropriato. Endpoint pubblici: `/api/subscription`, `/api/get-confirmations`.

## 📊 Cron Jobs

**Vercel**: Configurati in `vercel.json` (58 10,15 * * *) solo uno per giorno * 
**GitHub Actions**: Usa `.github/workflows/cron.yml` (UTC, max ritardo 15min, si disattiva dopo 60 gbiorni inattività)
