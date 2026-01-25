# Notification System Documentation

## Overview
This document describes the web push notification system implemented in the Biliardino ELO application.

## Declarative Web Push (Safari/iOS)

### Overview
Declarative Web Push is a new model for push notifications that allows Safari/iOS to display notifications without requiring Service Worker JavaScript execution. This is especially important for iOS 16.4+ where web push is supported.

### Key Benefits
- **No Service Worker Required**: Notifications can be displayed directly by the browser/OS
- **Better Battery Life**: Reduced CPU usage as no JavaScript needs to run
- **Privacy Preserving**: Less code execution means fewer tracking opportunities
- **Reliable Delivery**: Even if the Service Worker fails, the notification is still shown

### Implementation

#### Content-Type Header
Push messages must be sent with:
```
Content-Type: application/notification+json
```

#### Payload Format
```json
{
  "title": "Notification Title (required)",
  "default_action_url": "/path/to/navigate (required)",
  "options": {
    "body": "Notification body text",
    "icon": "/icons/icon-192.jpg",
    "badge": "/icons/badge.png",
    "tag": "unique-tag",
    "lang": "it-IT",
    "dir": "ltr",
    "silent": false,
    "requireInteraction": true,
    "actions": [
      {
        "action": "accept",
        "title": "Accept",
        "url": "/accept"
      },
      {
        "action": "decline",
        "title": "Decline",
        "url": "/decline"
      }
    ],
    "data": {
      "customKey": "customValue"
    }
  },
  "mutable": false,
  "app_badge": 1
}
```

#### Key Differences from Legacy Push
| Feature | Legacy Push | Declarative Push |
|---------|-------------|------------------|
| Service Worker | Required | Optional |
| Content-Type | application/json | application/notification+json |
| Action URLs | Via notificationclick handler | Direct in payload (`url` property) |
| Navigate | Via notificationclick handler | `default_action_url` field |
| Mutability | Always mutable | `mutable` flag controls |
| App Badge | Via Badging API | `app_badge` field |

### Testing
Navigate to `/declarative-push.html` to test declarative push notifications.

### API Endpoint
Use `POST /api/declarative-push` to send declarative push notifications:

```javascript
fetch('/api/declarative-push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    playerId: 123,
    title: 'New Match!',
    default_action_url: '/matchmaking.html',
    options: {
      body: 'You have been selected for the next match',
      requireInteraction: true,
      actions: [
        { action: 'accept', title: 'Accept', url: '/matchmaking.html' },
        { action: 'decline', title: 'Decline', url: '/' }
      ]
    },
    app_badge: 1
  })
});
```

## Key Features

### 1. Fixed Subscription Flow
The subscription flow has been completely rewritten to fix critical issues:

#### Previous Issues:
- Subscriptions never completed successfully due to async/await issues
- localStorage was saved before API confirmation
- No timeout handling on API calls
- Inconsistent error state management

#### Current Implementation:
- Proper async/await flow with promise handling
- localStorage only saved after successful API response
- 10-second timeout on API calls to prevent hanging
- Consistent state management with rollback on failure
- Clear error messages for debugging

### 2. Notification Actions
Notifications now support custom action buttons (e.g., "Accept", "Ignore"):

#### Features:
- Up to 2-3 action buttons per notification (platform dependent)
- Custom action handling in service worker
- Action data passed through notification payload
- URL parameter support for action tracking

## How to Use

### For Users

#### Enable Notifications:
1. Click the notification bell icon in the header
2. Allow notifications when prompted by browser
3. Select your player name from the dropdown
4. Wait for confirmation (green checkmark)

#### Test Notifications:
1. Navigate to `/test-notifications.html`
2. Customize the notification title and message
3. Add/remove action buttons as needed
4. Click "Send Test Notification"
5. Check your device for the notification

### For Developers

#### Send a Notification with Actions:

**Using test-notification endpoint:**
```javascript
fetch('/api/test-notification', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subscription: {...}, // User's push subscription
    playerName: 'John Doe',
    title: 'New Match Available',
    body: 'You have been selected for the next match!',
    actions: [
      { action: 'accept', title: '✅ Accept', icon: '/icons/icon-192.jpg' },
      { action: 'decline', title: '❌ Decline', icon: '/icons/icon-192.jpg' }
    ]
  })
});
```

**Using send-notification endpoint:**
```javascript
fetch('/api/send-notification', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    playerId: 123,
    title: 'Match Confirmation',
    body: 'Confirm your availability',
    url: '/matchmaking.html',
    requireInteraction: true,
    actions: [
      { action: 'accept', title: 'Accept' },
      { action: 'ignore', title: 'Ignore' }
    ]
  })
});
```

#### Handle Actions in Service Worker:

The service worker (`public/sw.js`) handles notification actions:

```javascript
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const url = event.notification.data?.url;
  
  if (action === 'accept') {
    // Handle accept action
    clients.openWindow(url + '?action=accept');
  } else if (action === 'ignore') {
    // Handle ignore action
    console.log('User ignored notification');
  }
});
```

## API Reference

### POST /api/subscription
Save a user's push subscription.

**Request:**
```json
{
  "subscription": {...},
  "playerId": 123,
  "playerName": "John Doe"
}
```

**Response:**
```json
{
  "ok": true,
  "url": "blob-url",
  "playerId": 123
}
```

### POST /api/test-notification
Send a test notification to a specific subscription.

**Request:**
```json
{
  "subscription": {...},
  "playerName": "John Doe",
  "title": "Test Title",
  "body": "Test Message",
  "actions": [
    { "action": "accept", "title": "Accept" }
  ]
}
```

### POST /api/send-notification
Send a notification to a specific player by ID.

**Request:**
```json
{
  "playerId": 123,
  "title": "Notification Title",
  "body": "Notification Body",
  "url": "/",
  "requireInteraction": false,
  "actions": [
    { "action": "view", "title": "View Details" }
  ]
}
```

### POST /api/declarative-push
Send a declarative push notification (Safari/iOS compatible).

**Request:**
```json
{
  "playerId": 123,
  "title": "Notification Title (required)",
  "default_action_url": "/path (required)",
  "options": {
    "body": "Notification body",
    "icon": "/icons/icon-192.jpg",
    "badge": "/icons/badge.png",
    "tag": "unique-tag",
    "lang": "it-IT",
    "dir": "ltr",
    "requireInteraction": true,
    "actions": [
      { "action": "accept", "title": "Accept", "url": "/accept" },
      { "action": "decline", "title": "Decline", "url": "/decline" }
    ]
  },
  "mutable": false,
  "app_badge": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notifica dichiarativa inviata (1/1 dispositivi)",
  "playerId": 123,
  "results": [
    { "success": true, "endpoint": "https://..." }
  ]
}
```

## Troubleshooting

### Subscription Not Saving
1. Check browser console for errors
2. Verify VAPID keys are configured in environment variables
3. Check network tab for failed API calls
4. Clear localStorage and try again

### Notifications Not Received
1. Verify notifications are enabled in browser settings
2. Check that service worker is registered and active
3. Verify subscription is saved in Vercel Blob storage
4. Check API logs for send errors

### Actions Not Working
1. Verify your platform supports notification actions (Android works best)
2. Check service worker console for action handling
3. Ensure actions array is properly formatted

## Technical Details

### Files Modified:
- `src/notifications.ts` - Fixed subscription flow, added `navigator.pushManager` support
- `public/sw.js` - Added action support, WebKit declarative push format handling
- `api/test-notification.js` - Added actions parameter
- `api/send-notification.js` - Added actions parameter
- `api/declarative-push.js` - New endpoint for declarative push (WebKit format)
- `test-notifications.html` - UI for testing legacy push
- `declarative-push.html` - New UI for testing declarative push

### Key Changes:
1. **Async/Await Fix**: Properly returns promise from `subscribeAndSave()`
2. **State Management**: localStorage only updated after API success
3. **Timeout Handling**: AbortController with 10s timeout
4. **Error Recovery**: Clears localStorage on failure
5. **Action Support**: Full web push action button implementation
6. **Declarative Push**: WebKit-compliant declarative push format with `Content-Type: application/notification+json`

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Push Notifications | ✅ | ✅ | ✅* | ✅ |
| Notification Actions | ✅ | ✅ | ❌ | ✅ |
| Service Workers | ✅ | ✅ | ✅ | ✅ |
| Declarative Push | ❌ | ❌ | ✅** | ❌ |

*Safari requires PWA installation for push notifications
**Declarative Push is supported in Safari 16.4+ on iOS/macOS

## Future Improvements

1. Add notification history/inbox
2. Support for images and media in notifications
3. Silent notifications for background sync
4. Advanced action routing with custom handlers
5. A/B testing for notification content
6. Analytics for notification engagement
