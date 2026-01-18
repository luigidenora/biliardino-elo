# 🔔 Sistema di Notifiche Push

Sistema completo di notifiche push per CA Biliardino, integrato con Vercel Blob Storage, KV/Redis e Web Push API.

## 📋 Overview

Il sistema permette agli utenti di:
- Registrarsi per ricevere notifiche push
- Essere notificati quando inizia una partita
- Gestire le proprie notifiche tramite dashboard dedicata

## 🏗️ Architettura

### Client-Side
- **Banner Notifiche**: Richiesta di abilitazione con selezione utente
- **Notification Button**: Indicatore di stato sempre visibile (top-right)
- **Dashboard**: Interfaccia di gestione e test (`/notifications-test.html`)
- **Service Worker**: Gestione notifiche in background (`/public/sw.js`)

### Server-Side
- **Vercel Blob Storage**: Persistenza subscriptions (`biliardino-subs/*.json`)
- **Vercel KV/Redis**: Coda temporanea matchmaking (TTL 30min)
- **Web Push API**: Invio notifiche con VAPID authentication

### File Principali

#### Frontend
- `src/notification-banner.ts` - Banner di richiesta notifiche
- `src/notification-button.ts` - Pulsante di stato top-right
- `src/utils/notification-status.util.ts` - Utility di verifica stato
- `src/pwa.ts` - Gestione subscription e service worker
- `notifications-test.html` - Dashboard utente e test production
- `styles/notification-banner.css` - Stili banner
- `styles/notification-button.css` - Stili pulsante

#### Backend (API)
- `api/save-subscription.js` - Salvataggio subscription su Blob
- `api/test-notification.js` - Test notifiche personalizzate
- `api/send-broadcast.js` - Broadcast a tutti gli utenti
- `api/confirm-availability.js` - Conferma disponibilità giocatori
- `api/run-matchmaking.js` - Matchmaking e notifiche automatiche
- `api/cron-handler.js` - Cron job per matchmaking orari

## 🔄 Flusso Utente

### 1. Attivazione Notifiche

1. Utente apre l'app
2. Dopo 2 secondi appare il banner "Abilita le Notifiche"
3. Click su "Attiva" → Modal selezione giocatore
4. Utente seleziona il proprio nome
5. Browser richiede permesso notifiche
6. Sistema crea/recupera subscription
7. Subscription salvata su Vercel Blob e localStorage
8. Banner mostra conferma successo

### 2. Verifica Stato

Il sistema verifica 3 condizioni per considerare le notifiche attive:
- ✅ **User Registered**: `playerId` e `playerName` in localStorage
- ✅ **Permission Granted**: `Notification.permission === 'granted'`
- ✅ **Subscription Saved**: Subscription presente in localStorage

Solo quando tutte e 3 sono soddisfatte, il pulsante mostra ✅ e lo stato "Attive".

### 3. Gestione

L'utente può:
- Verificare lo stato dal pulsante top-right
- Accedere alla dashboard per dettagli completi
- Testare l'invio di notifiche personalizzate
- Resettare subscription e riconfigurare

## 🔐 Sicurezza

- **VAPID Keys**: Autenticazione Web Push
- **Encrypted Storage**: Tutte le variabili env sono criptate su Vercel
- **Client-side Cache**: localStorage solo per UX, source of truth è il server

## 📦 Storage

### Vercel Blob
```
biliardino-subs/
  ├── [hash1]-[timestamp]-[random].json
  ├── [hash2]-[timestamp]-[random].json
  └── ...
```

Ogni file contiene:
```json
{
  "subscription": { /* PushSubscription */ },
  "playerId": 123,
  "playerName": "Mario Rossi"
}
```

### Vercel KV (Redis)
```
availability:[time]:[playerId] = "confirmed"  (TTL: 30min)
```

## 🧪 Testing

### Dashboard Notifiche
Accedi a `/notifications-test.html` per:
- Visualizzare tutte le subscriptions salvate su Vercel Blob
- Aggiungere nuove subscriptions manualmente
- Inviare notifiche di test a utenti specifici
- Inviare broadcast a tutti gli utenti registrati

### API Endpoints

**Invia Notifica a Player Specifico (PRODUCTION-READY)**
```bash
POST /api/send-notification
{
  "playerId": 123,
  "title": "Partita Iniziata!",
  "body": "La tua partita sta per iniziare",
  "url": "/matchmaking.html",
  "requireInteraction": true
}
```

**Test Notifica con Subscription Diretta (DEV/TEST)**
```bash
POST /api/test-notification
{
  "subscription": { /* PushSubscription */ },
  "playerName": "Mario Rossi",
  "title": "Test Notifica",
  "body": "Messaggio personalizzato"
}
```

**Broadcast a Tutti**
```bash
POST /api/send-broadcast
{
  "matchTime": "14:30"
}
```

## 🚀 Deployment

### Variabili d'Ambiente Richieste

```env
# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_***

# Vercel KV (Redis)
REDIS_URL=redis://***

# Web Push VAPID Keys
VAPID_PUBLIC_KEY=***
VAPID_PRIVATE_KEY=***
```

### Build & Deploy

```bash
# Build locale
npm run build

# Deploy su Vercel
vercel --prod
```

## 📱 Supporto Browser

- ✅ Chrome/Edge (Android, Desktop)
- ✅ Firefox (Android, Desktop)
- ✅ Safari (iOS 16.4+, macOS)
- ⚠️ iOS richiede PWA installata

## 🐛 Troubleshooting

### Notifiche non ricevute
1. Verifica permesso browser concesso
2. Controlla subscription salvata (dashboard)
3. Verifica variabili VAPID corrette
4. Testa con `/notifications-test.html`

### Subscription non salvata
1. Verifica `BLOB_READ_WRITE_TOKEN` presente
2. Controlla connessione internet
3. Verifica error log in dashboard

### Banner non appare
1. Verifica supporto browser (`Notification` in window)
2. Controlla se già attivato (tutte e 3 condizioni OK)
3. Verifica se banner dismissato (`localStorage.biliardino_notification_dismissed`)

## 📊 Monitoring

I log delle API sono visibili in Vercel Dashboard:
- `✅ Subscription salvata` - Nuova registrazione
- `✅ Broadcast: X/Y inviati` - Risultato broadcast
- `🎮 Matchmaking per HH:MM` - Matchmaking eseguito
- `⚠️ Solo X conferme` - Matchmaking non eseguito (< 5 giocatori)

## 🔄 Aggiornamenti Futuri

- [ ] Preferenze notifiche personalizzate
- [ ] Notifiche match terminati con risultati
- [ ] Statistiche engagement notifiche
- [ ] Multi-lingua per messaggi notifiche
