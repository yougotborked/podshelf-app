import { expect, type Page } from '@playwright/test'
import { MOCK_SERVER_CONFIG, installMockServer, type MockServerHandle } from './mock-server'

/**
 * Widths worth looking at, in CSS pixels.
 *
 * 600dp is where Android's medium window size class begins and where orientation locks stop
 * being honoured, so the fixture brackets it rather than guessing at one "mobile" size.
 */
export const VIEWPORTS = {
  /** An ordinary phone, and the narrowest layout that has to work. */
  phone: { width: 412, height: 915 },
  /** A folded Z Fold's cover screen - tall, narrow, still compact class. */
  foldCover: { width: 404, height: 968 },
  /** The same device opened. Past 600dp, so the large-screen rules apply. */
  foldOpen: { width: 673, height: 841 },
  /** Opened and held in landscape, which is where stretched layouts look worst. */
  foldOpenLandscape: { width: 841, height: 673 }
} as const

export type ViewportName = keyof typeof VIEWPORTS

export type BootedApp = {
  server: MockServerHandle
  /** Anything the page logged at error level, plus uncaught exceptions. */
  errors: string[]
}

/**
 * Boots the app in a desktop browser against the fake server, signed in and on `path`.
 *
 * The app normally talks to Kotlin for its database, so the seeded `device` key is what the
 * web implementation of AbsDatabase reads - that is the whole of "being logged in" here.
 */
export async function bootApp(page: Page, path: string, viewport: ViewportName = 'phone'): Promise<BootedApp> {
  await page.setViewportSize(VIEWPORTS[viewport])

  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(`uncaught: ${err.message}`))

  await page.addInitScript((config) => {
    localStorage.setItem(
      'device',
      JSON.stringify({
        serverConnectionConfigs: [config],
        lastServerConnectionConfigId: config.id,
        currentLocalPlaybackSession: null,
        deviceSettings: {}
      })
    )
  }, MOCK_SERVER_CONFIG)

  const server = await installMockServer(page)

  await page.goto(path, { waitUntil: 'networkidle' })
  await page.waitForLoadState('networkidle')

  return { server, errors }
}

/**
 * Fails when the page came up empty.
 *
 * This is the point of the assertion: the previous harness wrote a screenshot whether or not the
 * app had rendered, so a boot failure looked exactly like a passing run and the images were
 * trusted anyway. A blank page is now a red test.
 */
export async function expectAppRendered(page: Page, booted: BootedApp): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText.trim())

  // A mistyped route renders Nuxt's error page, which is full of text and so sailed past the
  // length check below - the stats shot was a 404 for as long as it existed. A screenshot of the
  // wrong screen is worse than no screenshot, because it looks like the real thing.
  if (/\b404\b/.test(text) && /page not found/i.test(text)) {
    throw new Error(`App rendered a 404 at ${page.url()} - the route does not exist.`)
  }

  if (text.length < 40) {
    throw new Error(`App did not render at ${page.url()} - only ${text.length} characters of visible text.\n` + `Console errors:\n  ${booted.errors.slice(0, 10).join('\n  ') || '(none)'}`)
  }

  // A mounted-hook crash leaves a partly built page that still has plenty of text, so the
  // text check alone would pass. Uncaught exceptions are never expected here.
  const uncaught = booted.errors.filter((e) => e.startsWith('uncaught:'))
  expect(uncaught, `uncaught exceptions at ${page.url()}`).toEqual([])
}

/** Settles layout before a screenshot: fonts loaded, transitions finished, art decoded. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
}

/**
 * Go to a page the way the app itself does, by its router, after booting somewhere else.
 *
 * For a page that needs the server connection: loaded cold from the URL bar it mounts before
 * the connection has been read from storage, fails to load its item, and leaves - which is
 * what a cold deep link does, and not what someone tapping through the app sees.
 */
export async function navigateInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push(to: string): unknown } } } } }).__vue_app__.config.globalProperties.$router.push(to), path)
}
