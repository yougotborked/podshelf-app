/**
 * Podcast UI review — takes screenshots of all podcast-related screens
 * against a live server for manual visual inspection.
 *
 * Usage:
 *   DEMO_URL=https://... DEMO_USER=... DEMO_PASS=... npx playwright test e2e/podcast-review.ts --reporter=list
 *
 * Defaults to the public audiobookshelf demo server.
 */

import { chromium, type Page, type Browser } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

const DEMO_URL = process.env.DEMO_URL || 'https://demo.audiobookshelf.org'
const DEMO_USER = process.env.DEMO_USER || 'demo'
const DEMO_PASS = process.env.DEMO_PASS || 'demo'
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000'

const VIEWPORT = { width: 390, height: 844 } // iPhone 14 Pro dimensions

const NOW = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots', NOW)
fs.mkdirSync(OUT_DIR, { recursive: true })

const consoleErrors: string[] = []

async function shot(page: Page, name: string, waitMs = 600) {
  await page.waitForTimeout(waitMs)
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`  📸 ${name}.png`)
  return file
}

async function loginViaUI(page: Page) {
  console.log('\n🔐 Logging in via UI...')
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await shot(page, '00-initial-load', 1000)

  // Fill server address
  const serverInput = page.locator('input[placeholder*="erver"], input[type="url"], input[placeholder*="http"]').first()
  if (await serverInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await serverInput.fill(DEMO_URL)
    await shot(page, '01-server-address-filled')
    const nextBtn = page.locator('button').filter({ hasText: /next|connect|continue/i }).first()
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click()
      await page.waitForTimeout(1500)
      await shot(page, '02-after-server-connect')
    }
  }

  // Fill credentials
  const userInput = page.locator('input[type="text"], input[placeholder*="user"], input[placeholder*="User"]').first()
  const passInput = page.locator('input[type="password"]').first()

  if (await userInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await userInput.fill(DEMO_USER)
  }
  if (await passInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await passInput.fill(DEMO_PASS)
    await shot(page, '03-credentials-filled')
    await passInput.press('Enter')
    await page.waitForTimeout(3000)
    await shot(page, '04-after-login', 2000)
  }
}

async function main() {
  console.log(`\n🎬 Podcast UI Review — ${NOW}`)
  console.log(`📱 Viewport: ${VIEWPORT.width}×${VIEWPORT.height} (iPhone 14 Pro)`)
  console.log(`🌐 App: ${APP_URL}`)
  console.log(`🔗 Server: ${DEMO_URL}`)
  console.log(`📁 Output: ${OUT_DIR}\n`)

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  })

  const page = await context.newPage()

  // Capture console errors for the report
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`)
    }
  })
  page.on('pageerror', (err) => {
    consoleErrors.push(`[pageerror] ${err.message}`)
  })

  try {
    // ── AUTH ──────────────────────────────────────────────────────────────────
    await loginViaUI(page)

    // Check if we're on the bookshelf (authenticated)
    const isAuthed = await page
      .locator('#bookshelf, [data-page="bookshelf"], .bookshelf, nav')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
    console.log(`\n✅ Authenticated: ${isAuthed}`)

    // ── BOOKSHELF / HOME ──────────────────────────────────────────────────────
    await shot(page, '05-bookshelf-home', 1500)

    // ── NAVIGATE TO PODCAST LIBRARY ───────────────────────────────────────────
    console.log('\n📚 Navigating to podcast library...')
    // Look for podcast nav tab or library switch
    const podcastTab = page
      .locator('nav a, nav button, [role="tab"]')
      .filter({ hasText: /podcast/i })
      .first()
    if (await podcastTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await podcastTab.click()
      await page.waitForTimeout(2000)
      await shot(page, '06-podcast-library', 1500)
    } else {
      // Try switching library via library selector
      const libBtn = page.locator('[aria-label*="library"], button').filter({ hasText: /library/i }).first()
      if (await libBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await libBtn.click()
        await page.waitForTimeout(800)
        await shot(page, '06a-library-picker')
        const podcastLib = page.locator('[role="option"], li, button').filter({ hasText: /podcast/i }).first()
        if (await podcastLib.isVisible({ timeout: 2000 }).catch(() => false)) {
          await podcastLib.click()
          await page.waitForTimeout(2000)
          await shot(page, '06b-podcast-library-selected', 1500)
        }
      }
    }

    await shot(page, '07-podcast-list-view', 1000)

    // ── OPEN FIRST PODCAST ────────────────────────────────────────────────────
    console.log('\n🎙️ Opening first podcast...')
    const firstPodcast = page
      .locator('a[href*="/item/"], [class*="card"], [class*="Card"]')
      .first()
    if (await firstPodcast.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstPodcast.click()
      await page.waitForTimeout(2500)
      await shot(page, '08-podcast-detail', 2000)

      // Scroll down a bit to see episodes
      await page.mouse.wheel(0, 400)
      await page.waitForTimeout(600)
      await shot(page, '09-podcast-detail-episodes', 800)

      // ── OPEN FIRST EPISODE ──────────────────────────────────────────────────
      console.log('\n🎵 Opening first episode...')
      const firstEpisode = page
        .locator('a[href*="/episode/"], [class*="episode"], [class*="Episode"]')
        .first()
      if (await firstEpisode.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstEpisode.click()
        await page.waitForTimeout(2500)
        await shot(page, '10-episode-detail', 2000)
      } else {
        // Try clicking any episode row
        const epRow = page.locator('[class*="EpisodeRow"], [class*="episode-row"]').first()
        if (await epRow.isVisible({ timeout: 2000 }).catch(() => false)) {
          await epRow.click()
          await page.waitForTimeout(2500)
          await shot(page, '10-episode-detail', 2000)
        }
      }

      // Go back to podcast detail
      await page.goBack()
      await page.waitForTimeout(1500)

      // ── PLAY EPISODE ────────────────────────────────────────────────────────
      console.log('\n▶️  Tapping play on first episode...')
      const playBtn = page
        .locator('button, [role="button"]')
        .filter({ has: page.locator('[class*="play"], .material-symbols') })
        .first()
      if (await playBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await playBtn.click()
        await page.waitForTimeout(3000)
        await shot(page, '11-episode-playing', 2000)

        // Full-screen player
        const playerBar = page.locator('[id*="player"], [class*="player"], [class*="Player"]').first()
        if (await playerBar.isVisible({ timeout: 2000 }).catch(() => false)) {
          await playerBar.click()
          await page.waitForTimeout(1500)
          await shot(page, '12-fullscreen-player', 1500)

          // Minimize player
          const minimizeBtn = page
            .locator('button, [role="button"]')
            .filter({ has: page.locator('.material-symbols') })
            .filter({ hasText: /minimize|expand_more|close|arrow/i })
            .first()
          if (await minimizeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await minimizeBtn.click()
            await page.waitForTimeout(1000)
          }
        }
      }
    }

    // ── HOME / CATCH-UP FEED ──────────────────────────────────────────────────
    console.log('\n🏠 Checking home screen catch-up feed...')
    await page.goto(`${APP_URL}/bookshelf`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await shot(page, '13-home-with-mini-player', 1500)

    // ── SORT MODAL ────────────────────────────────────────────────────────────
    console.log('\n↕️  Opening sort modal...')
    const sortBtn = page
      .locator('button, [role="button"]')
      .filter({ hasText: /sort|order/i })
      .first()
    if (await sortBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sortBtn.click()
      await page.waitForTimeout(800)
      await shot(page, '14-sort-modal', 600)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }

    // ── FILTER MODAL ──────────────────────────────────────────────────────────
    console.log('\n🔽 Opening filter modal...')
    const filterBtn = page
      .locator('button, [role="button"]')
      .filter({ hasText: /filter/i })
      .first()
    if (await filterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await filterBtn.click()
      await page.waitForTimeout(800)
      await shot(page, '15-filter-modal', 600)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }

    // ── SETTINGS / ACCOUNT ────────────────────────────────────────────────────
    console.log('\n⚙️  Checking account/settings screens...')
    await page.goto(`${APP_URL}/account`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await shot(page, '16-account-page', 1000)

    await page.goto(`${APP_URL}/settings`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await shot(page, '17-settings-page', 1000)

    // ── FINAL STATE ───────────────────────────────────────────────────────────
    await page.goto(`${APP_URL}/bookshelf`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await shot(page, '18-final-bookshelf', 1000)
  } catch (err) {
    console.error('\n❌ Script error:', err)
    await shot(page, 'ERROR-state', 500).catch(() => {})
  } finally {
    await browser.close()
  }

  // ── REPORT ────────────────────────────────────────────────────────────────
  const screenshots = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png'))
  console.log(`\n✅ Captured ${screenshots.length} screenshots → ${OUT_DIR}`)

  if (consoleErrors.length) {
    console.log(`\n⚠️  Console errors (${consoleErrors.length}):`)
    consoleErrors.forEach((e) => console.log(`  ${e}`))
  } else {
    console.log('\n✅ No console errors detected')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
