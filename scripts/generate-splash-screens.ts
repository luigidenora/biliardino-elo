import { chromium, type Browser, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Script to generate Apple splash screens from the app skeleton
 * without opacity animations for all iOS device resolutions.
 *
 * Usage: npx tsx scripts/generate-splash-screens.ts
 */

interface SplashConfig {
  width: number;
  height: number;
  filename: string;
}

// All Apple splash screen resolutions extracted from index.html
const SPLASH_CONFIGS: SplashConfig[] = [
  // iPad Pro 12.9" (2048x2732)
  { width: 2048, height: 2732, filename: 'apple-splash-2048-2732.jpg' },
  { width: 2732, height: 2048, filename: 'apple-splash-2732-2048.jpg' },

  // iPad Pro 11" (1668x2388)
  { width: 1668, height: 2388, filename: 'apple-splash-1668-2388.jpg' },
  { width: 2388, height: 1668, filename: 'apple-splash-2388-1668.jpg' },

  // iPad Air / iPad 10.2" (1536x2048)
  { width: 1536, height: 2048, filename: 'apple-splash-1536-2048.jpg' },
  { width: 2048, height: 1536, filename: 'apple-splash-2048-1536.jpg' },

  // iPad 10.9" (1640x2360)
  { width: 1640, height: 2360, filename: 'apple-splash-1640-2360.jpg' },
  { width: 2360, height: 1640, filename: 'apple-splash-2360-1640.jpg' },

  // iPad Mini (1668x2224)
  { width: 1668, height: 2224, filename: 'apple-splash-1668-2224.jpg' },
  { width: 2224, height: 1668, filename: 'apple-splash-2224-1668.jpg' },

  // iPad 10.2" (1620x2160)
  { width: 1620, height: 2160, filename: 'apple-splash-1620-2160.jpg' },
  { width: 2160, height: 1620, filename: 'apple-splash-2160-1620.jpg' },

  // iPad Mini 8.3" (1488x2266)
  { width: 1488, height: 2266, filename: 'apple-splash-1488-2266.jpg' },
  { width: 2266, height: 1488, filename: 'apple-splash-2266-1488.jpg' },

  // iPhone 16 Pro Max (1320x2868)
  { width: 1320, height: 2868, filename: 'apple-splash-1320-2868.jpg' },
  { width: 2868, height: 1320, filename: 'apple-splash-2868-1320.jpg' },

  // iPhone 16 Pro (1206x2622)
  { width: 1206, height: 2622, filename: 'apple-splash-1206-2622.jpg' },
  { width: 2622, height: 1206, filename: 'apple-splash-2622-1206.jpg' },

  // iPhone 16 (1260x2736)
  { width: 1260, height: 2736, filename: 'apple-splash-1260-2736.jpg' },
  { width: 2736, height: 1260, filename: 'apple-splash-2736-1260.jpg' },

  // iPhone 15 Pro Max / 14 Pro Max (1290x2796)
  { width: 1290, height: 2796, filename: 'apple-splash-1290-2796.jpg' },
  { width: 2796, height: 1290, filename: 'apple-splash-2796-1290.jpg' },

  // iPhone 15 / 15 Pro / 14 Pro (1179x2556)
  { width: 1179, height: 2556, filename: 'apple-splash-1179-2556.jpg' },
  { width: 2556, height: 1179, filename: 'apple-splash-2556-1179.jpg' },

  // iPhone 14 / 13 / 12 / 12 Pro (1170x2532)
  { width: 1170, height: 2532, filename: 'apple-splash-1170-2532.jpg' },
  { width: 2532, height: 1170, filename: 'apple-splash-2532-1170.jpg' },

  // iPhone 14 Plus / 13 Pro Max / 12 Pro Max (1284x2778)
  { width: 1284, height: 2778, filename: 'apple-splash-1284-2778.jpg' },
  { width: 2778, height: 1284, filename: 'apple-splash-2778-1284.jpg' },

  // iPhone 13 mini / 12 mini (1125x2436)
  { width: 1125, height: 2436, filename: 'apple-splash-1125-2436.jpg' },
  { width: 2436, height: 1125, filename: 'apple-splash-2436-1125.jpg' },

  // iPhone 11 Pro Max / XS Max (1242x2688)
  { width: 1242, height: 2688, filename: 'apple-splash-1242-2688.jpg' },
  { width: 2688, height: 1242, filename: 'apple-splash-2688-1242.jpg' },

  // iPhone XR / 11 (828x1792)
  { width: 828, height: 1792, filename: 'apple-splash-828-1792.jpg' },
  { width: 1792, height: 828, filename: 'apple-splash-1792-828.jpg' },

  // iPhone 11 Pro / X / XS (1125x2436) - duplicate removed above

  // iPhone 8 Plus / 7 Plus / 6s Plus (1242x2208)
  { width: 1242, height: 2208, filename: 'apple-splash-1242-2208.jpg' },
  { width: 2208, height: 1242, filename: 'apple-splash-2208-1242.jpg' },

  // iPhone 8 / 7 / 6s / 6 (750x1334)
  { width: 750, height: 1334, filename: 'apple-splash-750-1334.jpg' },
  { width: 1334, height: 750, filename: 'apple-splash-1334-750.jpg' },

  // iPhone SE (640x1136)
  { width: 640, height: 1136, filename: 'apple-splash-640-1136.jpg' },
  { width: 1136, height: 640, filename: 'apple-splash-1136-640.jpg' }
];

async function createStaticSkeletonHTML(): Promise<string> {
  // Read the current index.html
  const indexPath = join(process.cwd(), 'index.html');
  const indexHTML = readFileSync(indexPath, 'utf-8');

  // Extract the skeleton content from #app-boot
  const bootStart = indexHTML.indexOf('<div id="app-boot"');
  const bootEnd = indexHTML.indexOf('</div>\n    <script>', bootStart);

  if (bootStart === -1 || bootEnd === -1) {
    throw new Error('Could not find #app-boot element in index.html');
  }

  const bootHTML = indexHTML.slice(bootStart, bootEnd + 6); // +6 for </div>

  // Create a standalone HTML page with the skeleton (no animations)
  return `<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Splash Screen</title>
    <style>
      :root {
        color-scheme: dark;
        --boot-bg: #0F2A20;
        --boot-surface: rgba(255, 255, 255, 0.03);
        --boot-border: rgba(255, 215, 0, 0.14);
        --boot-strong: rgba(255, 255, 255, 0.2);
        --boot-soft: rgba(255, 255, 255, 0.12);
        --boot-mid: rgba(255, 255, 255, 0.16);
        --boot-max-width: 1280px;
        --boot-header-offset: 3.5rem;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background: radial-gradient(circle at 50% 20%, rgba(20, 70, 53, 0.85) 0%, var(--boot-bg) 55%);
        color: #fff;
        overflow: hidden;
      }
      body {
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      .boot-shell {
        min-height: calc(100vh - var(--boot-header-offset));
        max-width: var(--boot-max-width);
        margin: 0 auto;
        padding: 20px 16px 32px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      #app-boot {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 60;
        background: radial-gradient(circle at 50% 20%, rgba(20, 70, 53, 0.85) 0%, var(--boot-bg) 55%);
        /* NO ANIMATIONS - static skeleton for splash screens */
        opacity: 1;
        visibility: visible;
      }
      .boot-row {
        border-radius: 16px;
        background: var(--boot-surface);
        border: 1px solid var(--boot-border);
      }
      .boot-heading {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .boot-icon {
        width: 26px;
        height: 26px;
        border-radius: 999px;
        background: rgba(255, 215, 0, 0.28);
        box-shadow: 0 0 14px rgba(255, 215, 0, 0.18);
        flex-shrink: 0;
      }
      .boot-search {
        height: 48px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      /* NO PULSE ANIMATION */
      .boot-pulse {
        /* animation removed for static screenshot */
      }
      .boot-line {
        height: 12px;
        border-radius: 999px;
        background: var(--boot-soft);
      }
      .boot-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .boot-podium {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .boot-podium-desktop {
        display: none;
      }
      .boot-podium-card {
        border-radius: 16px;
        border: 1px solid var(--boot-border);
        background: rgba(255, 255, 255, 0.08);
        padding: 16px 14px;
        display: grid;
        justify-items: center;
        gap: 8px;
        min-height: 190px;
      }
      .boot-podium-card.is-first {
        border-color: rgba(255, 215, 0, 0.35);
        background: rgba(255, 215, 0, 0.16);
      }
      .boot-medal {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: var(--boot-mid);
      }
      .boot-card {
        padding: 14px;
      }
      .boot-card-head {
        height: 10px;
        width: 64px;
        border-radius: 999px;
        background: var(--boot-mid);
      }
      .boot-card-body {
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .boot-avatar {
        width: 42px;
        height: 42px;
        border-radius: 999px;
        background: var(--boot-mid);
        flex-shrink: 0;
      }
      .boot-table {
        padding: 0;
        display: grid;
        gap: 0;
        overflow: hidden;
      }
      .boot-table-head {
        padding: 12px 12px;
        background: rgba(10, 25, 18, 0.8);
        border-bottom: 1px solid rgba(255, 215, 0, 0.2);
        display: grid;
        grid-template-columns: 30px 1fr 55px 40px;
        gap: 8px;
        align-items: center;
      }
      .boot-table-row {
        background: rgba(255, 255, 255, 0.02);
        padding: 10px 12px;
        display: grid;
        grid-template-columns: 30px 1fr 55px 40px;
        align-items: center;
        gap: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      .boot-player {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .boot-winrate {
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.14);
        overflow: hidden;
      }
      .boot-winrate>span {
        display: block;
        height: 100%;
        width: 56%;
        border-radius: 999px;
        background: rgba(255, 215, 0, 0.85);
      }
      .boot-recent {
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid rgba(255, 215, 0, 0.2);
        background: rgba(15, 42, 32, 0.55);
      }
      .boot-recent-head {
        padding: 11px 14px;
        background: rgba(10, 25, 18, 0.8);
        border-bottom: 1px solid rgba(255, 215, 0, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .boot-recent-list {
        padding: 10px;
        display: grid;
        gap: 8px;
      }
      .boot-recent-item {
        border-radius: 9px;
        border: 1px solid rgba(74, 144, 217, 0.3);
        background: rgba(255, 255, 255, 0.03);
        padding: 10px;
        display: grid;
        gap: 6px;
      }
      @media (min-width: 768px) {
        :root {
          --boot-header-offset: 4rem;
        }
        .boot-shell {
          padding: 32px 24px 40px;
          gap: 22px;
        }
        .boot-podium {
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .boot-podium-desktop {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }
        .boot-podium-mobile {
          display: none;
        }
        .boot-podium-card {
          min-height: 232px;
        }
        .boot-podium-card.is-first {
          transform: translateY(-10px);
        }
        .boot-table-head,
        .boot-table-row {
          grid-template-columns: 40px 1fr 80px 70px 110px 90px;
        }
      }
    </style>
  </head>
  <body>
    ${bootHTML}
  </body>
</html>`;
}

async function captureScreenshot(
  page: Page,
  config: SplashConfig,
  outputDir: string
): Promise<void> {
  console.log(`📸 Capturing ${config.filename} (${config.width}x${config.height})`);

  // Set viewport size
  await page.setViewportSize({ width: config.width, height: config.height });

  // Wait a bit for rendering to stabilize
  await page.waitForTimeout(100);

  // Take screenshot
  const outputPath = join(outputDir, config.filename);
  await page.screenshot({
    path: outputPath,
    type: 'jpeg',
    quality: 85,
    fullPage: false
  });

  console.log(`✅ Saved ${config.filename}`);
}

async function generateAllSplashScreens(): Promise<void> {
  console.log('🚀 Starting splash screen generation...\n');

  const outputDir = join(process.cwd(), 'public', 'icons');
  const skeletonHTML = await createStaticSkeletonHTML();

  // Write temporary HTML file for Playwright to load
  const tempHTMLPath = join(process.cwd(), '.splash-temp.html');
  writeFileSync(tempHTMLPath, skeletonHTML, 'utf-8');

  let browser: Browser | null = null;

  try {
    // Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      deviceScaleFactor: 1
    });
    const page = await context.newPage();

    // Load the static skeleton page
    await page.goto(`file://${tempHTMLPath}`, { waitUntil: 'networkidle' });

    // Generate all splash screens
    let count = 0;
    for (const config of SPLASH_CONFIGS) {
      await captureScreenshot(page, config, outputDir);
      count++;

      // Progress update every 10 images
      if (count % 10 === 0) {
        console.log(`\n📊 Progress: ${count}/${SPLASH_CONFIGS.length} images generated\n`);
      }
    }

    console.log(`\n✨ Successfully generated ${SPLASH_CONFIGS.length} splash screens!\n`);
    console.log(`📁 Output directory: ${outputDir}`);

    await context.close();
  } catch (error) {
    console.error('❌ Error generating splash screens:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }

    // Clean up temp file
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(tempHTMLPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Run the script
generateAllSplashScreens().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
