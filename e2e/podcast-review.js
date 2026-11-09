#!/usr/bin/env node
/**
 * Podcast UI review — screenshots of all podcast screens against live server.
 *
 * node e2e/podcast-review.js
 * DEMO_URL=https://... DEMO_USER=... DEMO_PASS=... node e2e/podcast-review.js
 */
import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEMO_URL  = process.env.DEMO_URL  || 'https://audiobooks.dev'
const DEMO_USER = process.env.DEMO_USER || 'demo'
const DEMO_PASS = process.env.DEMO_PASS || 'demo'
const APP_URL   = process.env.APP_URL   || 'http://127.0.0.1:3000'

const PORTRAIT  = { width: 390, height: 844 }
const LANDSCAPE = { width: 844, height: 390 }

const NOW = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots', NOW)
fs.mkdirSync(OUT_DIR, { recursive: true })

const consoleErrors = []
let page

async function shot(name, waitMs = 800) {
  if (waitMs) await page.waitForTimeout(waitMs)
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`  📸  ${name}.png`)
}

// Enable a settings toggle identified by row text. Clicks only if currently off.
async function enableSettingByLabel(labelText, screenshotName) {
  // Find the row that contains the label
  const row = page.locator('.flex.items-center').filter({ has: page.locator(`p:has-text("${labelText}")`) }).first()
  if (!await row.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`  ⚠️  Setting row not found: "${labelText}"`)
    return false
  }
  const toggle = row.locator('button[role="switch"]').first()
  if (!await toggle.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`  ⚠️  Toggle not found in row: "${labelText}"`)
    return false
  }
  const ariaChecked = await toggle.getAttribute('aria-checked').catch(() => null)
  if (ariaChecked !== 'true') {
    await toggle.click()
    await page.waitForTimeout(400)
    console.log(`  ✅  Enabled: "${labelText}"`)
  } else {
    console.log(`  ℹ️  Already enabled: "${labelText}"`)
  }
  if (screenshotName) await shot(screenshotName, 200)
  return true
}

async function doLogin(context, prefix) {
  page = await context.newPage()
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`[${prefix}] ${msg.text()}`) })
  page.on('pageerror', err => consoleErrors.push(`[${prefix}] ${err.message}`))
  // Log login/auth network responses for debugging
  page.on('response', res => {
    if (res.url().includes('/login') || res.url().includes('/auth')) {
      res.json().then(j => console.log(`  🌐 ${res.url()} → ${res.status()} ${JSON.stringify(j).slice(0, 120)}`)).catch(() => {})
    }
  })

  console.log(`\n🔌 [${prefix}] Loading app...`)
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 20000 })
  await shot(`${prefix}-00-initial-load`, 1500)

  // ── STEP 1: Server address form ──────────────────────────────────────────────
  // Check if showing server-list (previous configs) or server-address form
  const serverInput = page.locator('input[type="url"], input[placeholder*="55.55"]').first()
  const serverListItem = page.locator('.border-b').filter({ has: page.locator('p') }).first()

  if (await serverInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Server address form — fill and submit
    await serverInput.click({ clickCount: 3 })
    await serverInput.fill(DEMO_URL)
    await shot(`${prefix}-01-server-address`, 400)
    const submitBtn = page.locator('button[type="submit"]').first()
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click()
      console.log(`  Clicked Submit — waiting for server validation...`)
      await page.waitForTimeout(4000)
      await shot(`${prefix}-02-after-server-submit`, 500)
    } else {
      // Press Enter as fallback
      await serverInput.press('Enter')
      await page.waitForTimeout(4000)
      await shot(`${prefix}-02-after-server-enter`, 500)
    }
  } else if (await serverListItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Server list — click first existing config
    await serverListItem.click()
    await page.waitForTimeout(2000)
    await shot(`${prefix}-01-server-list-clicked`, 300)
  } else {
    await shot(`${prefix}-01-unknown-connect-state`, 0)
    console.log(`  ⚠️  Unknown connect state`)
  }

  // ── STEP 2: Credentials form ─────────────────────────────────────────────────
  const passField = page.locator('input[type="password"]').first()
  if (await passField.isVisible({ timeout: 6000 }).catch(() => false)) {
    const userField = page.locator(`input[placeholder="Username"], input[placeholder="username"]`).first()
    if (await userField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await userField.click({ clickCount: 3 })
      await userField.fill(DEMO_USER)
    }
    await passField.fill(DEMO_PASS)
    await shot(`${prefix}-03-credentials`, 300)

    const authSubmitBtn = page.locator('form').filter({ has: page.locator('input[type="password"]') }).locator('button[type="submit"]').first()
    if (await authSubmitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await authSubmitBtn.click()
    } else {
      await passField.press('Enter')
    }
    console.log(`  Submitted credentials — waiting for login...`)
    await page.waitForTimeout(6000)
    await shot(`${prefix}-04-after-login`, 500)
  } else {
    await shot(`${prefix}-03-no-credentials-form`, 0)
    console.log(`  ⚠️  No credentials form found`)
  }

  const currentURL = page.url()
  console.log(`  Current URL: ${currentURL}`)
  const loggedIn = !currentURL.includes('/connect')
  console.log(`  Logged in: ${loggedIn}`)
  return loggedIn
}

async function enableAppSettings(prefix) {
  console.log(`\n⚙️  [${prefix}] Enabling auto-continue + auto-cache settings...`)
  await page.goto(`${APP_URL}/settings`, { waitUntil: 'networkidle', timeout: 10000 })
  await page.waitForTimeout(1500)
  await shot(`${prefix}-S0-settings-page`, 400)

  await enableSettingByLabel('Auto continue playlists', `${prefix}-S1-after-auto-continue`)
  await enableSettingByLabel('Auto cache unplayed episodes', `${prefix}-S2-after-auto-cache`)
  await shot(`${prefix}-S3-settings-final`, 300)
}

async function runPodcastFlow(prefix) {
  // ── HOME / BOOKSHELF ──────────────────────────────────────────────────────────
  console.log(`\n🏠 [${prefix}] Home / Bookshelf...`)
  await page.goto(`${APP_URL}`, { waitUntil: 'networkidle', timeout: 15000 })
  await page.waitForTimeout(2000)
  await shot(`${prefix}-05-home-bookshelf`, 500)

  // ── SWITCH TO PODCAST LIBRARY ─────────────────────────────────────────────────
  console.log(`\n🎙️  [${prefix}] Switching to podcast library...`)
  let switchedLib = false

  // Try clicking the library name in the appbar
  const libNameBtn = page.locator('#appbar, [class*="appbar"], [class*="Appbar"]').locator('button, [role="button"]').first()
  if (await libNameBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await libNameBtn.click()
    await page.waitForTimeout(800)
    await shot(`${prefix}-06-library-picker`)
    const podLib = page.locator('[role="option"], li, button, a').filter({ hasText: /podcast/i }).first()
    if (await podLib.isVisible({ timeout: 2000 }).catch(() => false)) {
      await podLib.click()
      await page.waitForTimeout(2500)
      switchedLib = true
      await shot(`${prefix}-07-podcast-library`, 1000)
    } else {
      await page.keyboard.press('Escape')
    }
  }

  if (!switchedLib) {
    // Try side-nav or hamburger
    const sideMenuBtn = page.locator('button').filter({ has: page.locator('.material-symbols:has-text("menu")') }).first()
    if (await sideMenuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sideMenuBtn.click()
      await page.waitForTimeout(600)
      await shot(`${prefix}-06b-side-drawer`)
      const podLib = page.locator('a, button, li').filter({ hasText: /podcast/i }).first()
      if (await podLib.isVisible({ timeout: 2000 }).catch(() => false)) {
        await podLib.click()
        await page.waitForTimeout(2500)
        switchedLib = true
        await shot(`${prefix}-07-podcast-library`, 1000)
      }
    }
  }

  if (!switchedLib) {
    await shot(`${prefix}-07-no-podcast-lib-found`, 0)
    console.log('  ⚠️  Could not switch to podcast library automatically')
  }

  await shot(`${prefix}-08-podcast-list`, 500)

  // ── OPEN FIRST PODCAST ─────────────────────────────────────────────────────────
  console.log(`\n📖 [${prefix}] Opening first podcast...`)
  const firstCard = page.locator('a[href*="/item/"]').first()
  let episodePlayed = false

  if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    const href = await firstCard.getAttribute('href')
    console.log(`  → ${href}`)
    await firstCard.click()
    await page.waitForTimeout(3000)
    await shot(`${prefix}-09-podcast-detail`, 500)

    // Scroll down to episode list
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(500)
    await shot(`${prefix}-10-podcast-detail-scrolled`, 300)

    // ── 3-DOT MENU ───────────────────────────────────────────────────────────
    const moreBtn = page.locator('button').filter({ has: page.locator('.material-symbols:has-text("more_vert")') }).first()
    if (await moreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await moreBtn.click()
      await page.waitForTimeout(600)
      await shot(`${prefix}-11-more-menu-dialog`, 400)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
      // Bug: fading modal keeps pointer-events:auto even at opacity:0 — force clear
      await page.evaluate(() => {
        document.querySelectorAll('.modal.modal-bg').forEach(el => {
          el.style.pointerEvents = 'none'
        })
      })
      await page.waitForTimeout(300)
    }

    // ── OPEN EPISODE DETAIL ──────────────────────────────────────────────────
    console.log(`\n🎵 [${prefix}] Opening episode detail...`)
    // Scroll down to ensure episodes are visible
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(500)
    // EpisodeRow root: div.w-full.py-4.overflow-hidden.relative.border-b — clicking it calls goToEpisodePage
    const epRow = page.locator('div.w-full.py-4.overflow-hidden.relative.border-b').first()
    if (await epRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await epRow.click({ timeout: 8000 })
      await page.waitForTimeout(3000)
      await shot(`${prefix}-12-episode-detail`, 500)

      // ── EPISODE 3-DOT ──────────────────────────────────────────────────────
      const epMoreBtn = page.locator('button').filter({ has: page.locator('.material-symbols:has-text("more_vert")') }).first()
      if (await epMoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await epMoreBtn.click()
        await page.waitForTimeout(600)
        await shot(`${prefix}-13-episode-more-menu`, 400)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(600)
        await page.evaluate(() => {
          document.querySelectorAll('.modal.modal-bg').forEach(el => { el.style.pointerEvents = 'none' })
        })
        await page.waitForTimeout(300)
      }

      // ── TAP PLAY ────────────────────────────────────────────────────────────
      console.log(`\n▶️  [${prefix}] Tapping play...`)
      // Try button[role="switch"] containing play_arrow, or any visible button near play_arrow icon
      const playSelectors = [
        'button:has(.material-symbols:text("play_arrow"))',
        '[class*="play-btn"], [class*="PlayBtn"]',
        'button[aria-label*="play" i]',
      ]
      let played = false
      for (const sel of playSelectors) {
        const btn = page.locator(sel).first()
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click()
          await page.waitForTimeout(3500)
          await shot(`${prefix}-14-after-play-tap`, 500)
          played = true
          episodePlayed = true
          break
        }
      }
      if (!played) {
        // Fallback: find button that contains play_arrow text node
        const allBtns = await page.locator('button').all()
        for (const btn of allBtns.slice(0, 30)) {
          const inner = await btn.innerHTML().catch(() => '')
          if (inner.includes('play_arrow')) {
            await btn.click()
            await page.waitForTimeout(3500)
            await shot(`${prefix}-14-after-play-tap`, 500)
            played = true
            episodePlayed = true
            break
          }
        }
      }
      if (!played) {
        console.log('  ⚠️  Could not find play button on episode detail')
        await shot(`${prefix}-14-no-play-found`, 0)
      }

      await page.goBack()
      await page.waitForTimeout(1500)
    }

    // ── MINI PLAYER ────────────────────────────────────────────────────────────
    console.log(`\n🎚️  [${prefix}] Checking mini player state...`)
    await shot(`${prefix}-15-podcast-detail-with-mini-player`, 500)

    // ── FULL-SCREEN PLAYER ──────────────────────────────────────────────────────
    if (episodePlayed) {
      // Mini player: bottom bar that appears when something is playing
      const miniPlayer = page.locator('[id*="player"], [class*="mini-player"], [class*="MiniPlayer"], [class*="audio-player"]').first()
      if (await miniPlayer.isVisible({ timeout: 3000 }).catch(() => false)) {
        await miniPlayer.click()
        await page.waitForTimeout(2000)
        await shot(`${prefix}-16-fullscreen-player`, 500)

        // Seek bar interaction
        const seekBar = page.locator('input[type="range"]').first()
        if (await seekBar.isVisible({ timeout: 1500 }).catch(() => false)) {
          await seekBar.click({ position: { x: 120, y: 10 } })
          await page.waitForTimeout(500)
          await shot(`${prefix}-16b-player-after-seek`, 200)
        }

        // Minimize player
        const closeBtn = page.locator('button').filter({ has: page.locator('.material-symbols:has-text("expand_more")') }).first()
        if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await closeBtn.click()
          await page.waitForTimeout(800)
        }
      } else {
        console.log('  ⚠️  Mini player not found after play')
        await shot(`${prefix}-16-no-mini-player`, 0)
      }
    }

    await page.goBack()
    await page.waitForTimeout(1500)
  }

  // ── BOOKSHELF WITH MINI PLAYER ────────────────────────────────────────────────
  console.log(`\n🏠 [${prefix}] Bookshelf with active player...`)
  await shot(`${prefix}-17-bookshelf-with-player`, 500)

  // ── SORT MODAL ────────────────────────────────────────────────────────────────
  console.log(`\n↕️  [${prefix}] Sort modal...`)
  const sortBtn = page.locator('button').filter({ hasText: /sort/i }).first()
  if (await sortBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sortBtn.click()
    await page.waitForTimeout(700)
    await shot(`${prefix}-18-sort-modal`, 300)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }

  // ── FILTER MODAL ──────────────────────────────────────────────────────────────
  console.log(`\n🔽 [${prefix}] Filter modal...`)
  const filterBtn = page.locator('button').filter({ hasText: /filter/i }).first()
  if (await filterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await filterBtn.click()
    await page.waitForTimeout(700)
    await shot(`${prefix}-19-filter-modal`, 300)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }

  // ── ACCOUNT PAGE ──────────────────────────────────────────────────────────────
  console.log(`\n👤 [${prefix}] Account page...`)
  await page.goto(`${APP_URL}/account`, { waitUntil: 'networkidle', timeout: 10000 })
  await shot(`${prefix}-20-account`, 1000)

  // ── SETTINGS PAGE ─────────────────────────────────────────────────────────────
  console.log(`\n⚙️  [${prefix}] Settings page...`)
  await page.goto(`${APP_URL}/settings`, { waitUntil: 'networkidle', timeout: 10000 })
  await shot(`${prefix}-21-settings`, 1000)

  // ── DOWNLOADS PAGE ────────────────────────────────────────────────────────────
  console.log(`\n📥 [${prefix}] Downloads page...`)
  await page.goto(`${APP_URL}/downloads`, { waitUntil: 'networkidle', timeout: 10000 })
  await shot(`${prefix}-22-downloads`, 1000)

  // ── HOME / CATCH-UP FEED ──────────────────────────────────────────────────────
  console.log(`\n🔁 [${prefix}] Catch-up feed / home...`)
  await page.goto(`${APP_URL}`, { waitUntil: 'networkidle', timeout: 10000 })
  await page.waitForTimeout(2000)
  await shot(`${prefix}-23-home-catchup-final`, 500)
}

async function main() {
  console.log(`\n🎬 Podcast UI Review — ${NOW}`)
  console.log(`📱 Portrait:  ${PORTRAIT.width}×${PORTRAIT.height}`)
  console.log(`📱 Landscape: ${LANDSCAPE.width}×${LANDSCAPE.height}`)
  console.log(`🌐 App:       ${APP_URL}`)
  console.log(`🔗 Server:    ${DEMO_URL}`)
  console.log(`📁 Output:    ${OUT_DIR}\n`)

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',         // Allow cross-origin requests (Capacitor bypasses CORS natively)
      '--disable-features=IsolateOrigins,site-per-process',
    ]
  })

  const makeContext = async (viewport) => {
    const ctx = await browser.newContext({
      viewport,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true
    })
    // Polyfill Buffer for Capacitor SQLite web fallback
    await ctx.addInitScript(() => {
      if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
        const te = new TextEncoder()
        const td = new TextDecoder()
        class BufferPolyfill extends Uint8Array {
          static from(data, encoding) {
            if (typeof data === 'string') {
              if (encoding === 'base64') {
                const bin = atob(data)
                const arr = new Uint8Array(bin.length)
                for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
                return new BufferPolyfill(arr.buffer)
              }
              return new BufferPolyfill(te.encode(data).buffer)
            }
            if (data instanceof ArrayBuffer) return new BufferPolyfill(data)
            return new BufferPolyfill(new Uint8Array(data).buffer)
          }
          static alloc(size, fill = 0) {
            const buf = new BufferPolyfill(size)
            buf.fill(fill)
            return buf
          }
          static concat(bufs) {
            const total = bufs.reduce((s, b) => s + b.length, 0)
            const out = new BufferPolyfill(total)
            let off = 0
            for (const b of bufs) { out.set(b, off); off += b.length }
            return out
          }
          static isBuffer(obj) { return obj instanceof BufferPolyfill }
          toString(encoding) {
            if (encoding === 'base64') return btoa(String.fromCharCode(...this))
            return td.decode(this)
          }
        }
        window.Buffer = BufferPolyfill
      }
    })
    return ctx
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTRAIT PASS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════')
  console.log('  PORTRAIT PASS')
  console.log('════════════════════════════════')

  const ctxPortrait = await makeContext(PORTRAIT)

  try {
    const loggedIn = await doLogin(ctxPortrait, 'P')
    if (loggedIn) {
      await enableAppSettings('P')
      await runPodcastFlow('P')
    } else {
      console.log('  ❌ Portrait login failed — skipping podcast flow')
    }
  } catch (err) {
    console.error('\n❌ Portrait error:', err)
    try { await shot('P-ERROR-state', 200) } catch { /* the page may be gone; the error is already logged */ }
  } finally {
    await ctxPortrait.close()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LANDSCAPE PASS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════')
  console.log('  LANDSCAPE PASS')
  console.log('════════════════════════════════')

  const ctxLandscape = await makeContext(LANDSCAPE)
  try {
    const loggedIn = await doLogin(ctxLandscape, 'L')
    if (loggedIn) {
      await runPodcastFlow('L')
    } else {
      console.log('  ❌ Landscape login failed — skipping podcast flow')
    }
  } catch (err) {
    console.error('\n❌ Landscape error:', err)
    try { await shot('L-ERROR-state', 200) } catch { /* the page may be gone; the error is already logged */ }
  } finally {
    await ctxLandscape.close()
  }

  await browser.close()

  // ── REPORT ──────────────────────────────────────────────────────────────────
  const shots = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png')).sort()
  console.log(`\n✅ ${shots.length} screenshots → ${OUT_DIR}`)
  shots.forEach(f => console.log(`   ${f}`))

  if (consoleErrors.length) {
    console.log(`\n⚠️  Console errors (${consoleErrors.length}):`)
    consoleErrors.slice(0, 40).forEach(e => console.log(`   ${e}`))
  } else {
    console.log('\n✅ No JS console errors')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
