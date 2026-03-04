# Scripts

This directory contains utility scripts for the project.

## Splash Screen Generation

### `generate-splash-screens.ts`

Automatically generates Apple splash screens for all iOS device resolutions using Playwright.

**How it works:**
1. Extracts the boot skeleton HTML from `index.html`
2. Creates a static HTML page (no opacity animations)
3. Uses Playwright to screenshot the skeleton at each required resolution
4. Outputs JPEG images to `public/icons/`

**Usage:**
```bash
npm run splash:generate
```

**Generated files:**
- 40 Apple splash screen images covering all iOS devices (iPhone, iPad)
- Portrait and landscape orientations
- From iPhone SE (640x1136) to iPad Pro 12.9" (2732x2048)

**Benefits of this approach:**
- ✅ Consistent with the actual app skeleton
- ✅ No manual design work needed
- ✅ Easy to update when skeleton changes
- ✅ Automated and reproducible
- ✅ No opacity animations (static screenshots)

**When to regenerate:**
- After changing the boot skeleton design in `index.html`
- After updating app colors/theme
- When adding support for new device resolutions

## Other Scripts

### `generate-token.js`
Generates JWT tokens for API authentication.

### `test-broadcast.js`
Tests web push notification broadcasting.
