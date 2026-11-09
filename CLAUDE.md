# CLAUDE.md

## Build & Dev Commands

All commands must run inside the `audiobookshelf-dev` distrobox (Ubuntu container):

```bash
distrobox enter audiobookshelf-dev -- bash -c "cd ~/workspace/audiobookshelf-app && COMMAND"
```

| Task | Command |
|------|---------|
| Dev server | `npm run dev` → nuxi dev on `0.0.0.0:1337` |
| Static build | `npm run generate` |
| Run every local check | `npm run verify` (see **Verification** below) |
| TypeScript check | `npm run typecheck` — **not** `npx nuxi typecheck` or `npx vue-tsc` |
| JS unit tests | `npm run test:unit` (`test:unit:watch` to watch) |
| Kotlin unit tests | `npm run test:android` |
| Screenshots of the app | `npm run screenshots` → `docs/screenshots/` |
| Full Android debug APK | `npm run generate && npx cap sync android && cd android && ./gradlew assembleDebug --no-daemon` |
| Watch debug APK | `cd android && ./gradlew :wear:assembleDebug --no-daemon` (no Capacitor sync needed) |

Java 21 (Temurin) is required for Android builds (`jvmToolchain(21)` in `build.gradle`).

## Android modules

| Module | What it is |
|--------|------------|
| `:app` | The phone app: a Capacitor webview plus the native player service |
| `:wear` | The Wear OS app: native Compose, its own player, no webview |
| `:wear-sync` | The phone ↔ watch contract. A plain JVM module, so both can depend on it |

**The phone decides what plays next; the watch is told.** "What plays next" is defined once, in
`composables/useListeningQueue.ts`. The phone resolves the queue and pushes the result to the
watch over the Wearable Data Layer. Do not re-derive the ordering in Kotlin for the watch — a
second definition drifts, and the drift shows up as the two devices disagreeing about the next
episode. `:wear-sync` holds the payload shapes and the rules that are genuinely the watch's own
(resume position, stream URL, when a cached queue is too old or belongs to another server).

`:wear-sync` is a plain `org.jetbrains.kotlin.jvm` module on purpose: no Android types, so its
rules are unit tested with `:wear-sync:test` — no device, no emulator, no Robolectric.

**On the watch, a network's transport is not the interesting question.** Wear OS routes an app's
traffic over Bluetooth proxied through the paired phone, over Wi-Fi, or over LTE, and swaps
between them without telling the app. That abstraction is right for a small request — ask for the
default network and it works wherever the watch is. It is wrong for an episode: while the phone
is in range the default network is usually the phone proxy, at a few hundred kbps, and the
platform will not bring up Wi-Fi on its own to make a download faster. Bulk transfers have to
request Wi-Fi (`HighBandwidthNetwork`), bind to it, and **release it in a finally** — the watch
stays on Wi-Fi as long as the request is registered. Judge a network by
`suitableForBulkDownload`, not by which radio it happens to be.

## Build toolchain

AGP 9.4.1, Gradle 9.8.2, `compileSdk`/`targetSdk` 37, Kotlin 2.3.20. Three AGP 9 facts that
will bite otherwise:

- **AGP 9 compiles Kotlin itself.** Applying `kotlin-android` / `org.jetbrains.kotlin.android`
  on top of it is now an error, not a no-op.
- **`android.kotlinOptions` is gone.** Compiler settings go in the top-level `kotlin` block's
  `compilerOptions`.
- **`compileSdk 37` is the `platforms;android-37.0` package**, not `android-37`, and only
  cmdline-tools 23+ can see it — the minor-versioned SDKs introduced version 4 of the remote
  repository XML, and an older `sdkmanager` reports the platform as simply not existing.
  `scripts/install-android-sdk.sh` handles both; CI runs the same script.

One AGP 9 compromise is recorded in [docs/TECH_DEBT.md](docs/TECH_DEBT.md) — read it before
touching `android/gradle.properties`.

## Verification

`scripts/verify.sh` (`npm run verify`) runs lint, typecheck, the i18n sort check, the JS unit
tests and the Kotlin unit tests, and prints a pass/fail summary. `scripts/verify.sh --list` shows the
steps; `scripts/verify.sh all` adds the debug APK. Every step works in a bare container —
no distrobox, no preinstalled Android tooling — so an agent session can verify its own work
instead of pushing to find out.

**Run it before pushing.** CI (`.github/workflows/build-apk.yml`) runs the same checks: the
`web` job does lint + typecheck + i18n + vitest, the `main` job does `staticAnalysis
testDebugUnitTest assembleDebug`. Its `publish` and `release` jobs are gated to
`refs/heads/master` and show as **skipped** on every other branch — that is the gate, not a
failure.

### Seeing the app

`npm run screenshots` boots the real app in headless Chromium against a fake Audiobookshelf
server (`test/e2e/fixtures/`) and captures the main screens at four widths either side of the
600dp boundary plus all three themes. Use it before claiming a layout or theming change works.

It is not a visual-regression suite — nothing is compared against a baseline — but
`expectAppRendered` fails on an empty body or any uncaught exception, so a boot failure is a red
test instead of a blank PNG. That assertion is the whole point: the previous harness wrote an
image whether or not anything had rendered, which let it sit broken for months.

Two things that bit before and will again:

- The fake server lives on **its own origin** (`http://abs-mock.test`). Matching API calls with
  `**/api/**` also matches the dev server's own modules — one of them is
  `/_nuxt/node_modules/@vue/devtools-api/lib/esm/api/index.js` — and serving that as JSON kills
  the module graph, blanking every screenshot.
- Shots are **viewport-sized, not `fullPage`**. The shelves window their rows, so `fullPage`
  stretches past anything that was ever rendered and writes out half-built rows below the fold:
  an image that reads as a layout bug and is not one.

### Where tests go

| Kind | Location | Runner |
|------|----------|--------|
| Pure TS logic | `test/*.test.ts` | vitest, plain Node |
| Kotlin / Android | `android/app/src/test/java/...`, `android/wear/src/test/java/...` | JUnit via Gradle |
| Phone ↔ watch rules | `android/wear-sync/src/test/java/...` | JUnit, plain JVM |
| Screenshots | `test/e2e/*.spec.ts` | Playwright, `npm run screenshots` |

The extensions matter: `vitest.config.ts` includes `test/**/*.test.ts`, so a Playwright spec must
be `.spec.ts` or vitest will try to run it without a browser.

`vitest.config.ts` aliases the Capacitor modules to `test/stubs/capacitor.ts`, so a composable
can be imported for its pure exports without a native bridge. There is deliberately no
component-test setup: the bugs in this repo have been in decision logic — what counts as
finished, whether a request reached the server, how long to wait before retrying — not in
rendering.

**Make a fix testable, then test it.** Most of the bugs here were a rule buried where nothing
could reach it: a threshold inlined at four call sites, reachability inferred from error text,
a pause discarded inside a listener callback. Pulling the rule into a named pure function and
testing it is what stops the same bug coming back on a different screen. A test that cannot
fail is worth nothing — reintroduce the bug, watch the test go red, then put the fix back.

### R8 on the phone app

The phone app's release build is R8-minified (Play requires obfuscation from February 2027), and
its keep rules can only be judged by running what R8 produced: a class reached by name and
renamed fails at runtime, never at build time. `scripts/check-app-r8.sh` (`verify.sh r8`, in
`verify.sh all`) re-runs the release shrink to class files and checks the shrunk app parses a
real server payload and reads records stored by the current app exactly as the current app does.
Paper writes class and field names to disk, so a bad rule there loses every user's downloads and
progress on update. **Run it after changing `android/app/proguard-rules.pro` or adding a
library.** It caught kotlin-reflect loading `kotlin.jvm.functions.Function1` by name before that
shipped.

### Kotlin changes are verifiable locally

`npm run test:android` compiles the Android sources and runs the tests in `:app`, `:wear` and
`:wear-sync`. It
installs the Android SDK into `/opt/android-sdk` on first run (~400MB) and applies
`scripts/gradle-mirror.init.gradle`.

That init script exists because Maven Central answers **429 Too Many Requests** through
shared outbound proxies, and Gradle treats a 429 as a hard repository failure — one
throttled request fails the whole build. The script puts Google's Maven Central mirror
first. It is applied explicitly, never wired into the build, so CI still resolves from the
canonical repositories.

**Put player logic in a pure function so it can be tested.** Decisions that currently sit
inside `Player.Listener` callbacks need a live player and cannot be exercised. Extracting
the condition into a named pure function next to its caller — as
`player/PauseEventFilter.kt` does for `PlayerListener.onIsPlayingChanged` — makes the rule
testable and puts the reasoning somewhere it can be read. Prefer that over commenting a
condition in place.

### Typecheck runs against a baseline

The Nuxt 2 → 3 migration left pre-existing type errors (56 at the time of writing), so a
bare `vue-tsc` run always fails and gets ignored. `scripts/typecheck.mjs` compares against
`scripts/typecheck-baseline.json` and fails only on a **new** error. Entries are keyed by
file + error code + message, not line number, so edits above an error do not look new.

After fixing baselined errors, tighten the baseline with `npm run typecheck:update`.

**Never run `npx vue-tsc` or `npx nuxi typecheck`.** Both resolve the latest release.
vue-tsc 3.x aborts partway through this project and still prints `Found 0 errors` — a false
pass that reads exactly like success. `vue-tsc` is pinned to 2.2.10 in `devDependencies`,
and `scripts/typecheck.mjs` refuses to run on any other major.

## App identity

The app is **Podshelf**; the server it talks to is **Audiobookshelf**. Keep that distinction when
touching strings: every user-facing string mentioning Audiobookshelf is about the *server* and
should stay.

- `applicationId` is `com.podshelf.app` (`.debug` suffix on debug builds). This is permanent once
  anything is published.
- The **Kotlin package and the gradle `namespace` are still `com.audiobookshelf.app`** on purpose.
  Nothing outside the build sees them, and renaming a hundred source files is a large risky diff
  for no visible gain. Do not "fix" this.
- The mark lives in `design/podshelf-mark.svg` (master, with the reasoning and the two joint
  alignments that are wrong if you redraw it carelessly), `components/ui/PodshelfMark.vue` (in-app,
  takes `currentColor`), `static/logo.svg` (for anything that can only load a file) and
  `android/app/src/main/res/drawable/ic_launcher_foreground.xml` (the adaptive icon). Change one,
  change all four.

## Theming

Colour lives in `assets/tailwind.css` as Material 3 token sets: a `:root` default (dark) plus
`html[data-theme='black']` and `html[data-theme='light']` overrides.

**A theme must restate the whole tonal set, not just the backgrounds.** The light theme used to
override surfaces and text but no primary role, so `--md-primary-container` and friends kept their
dark-theme values — the nav pill rendered dark green on near-white and the mark-as-finished
control was invisible. Nothing catches this but looking at it, which is what
`npm run screenshots` is for.

The accent carries one meaning — where you are in something — so it belongs on progress, the
current item and the play control, and not on decoration.

**There is one vocabulary for colour: the Material tokens.** The app used to carry a second set
of aliases (`text-fg`, `bg-primary`, `border-border` …) that were defined as exact duplicates of
Material tokens in every theme, plus raw Tailwind palette colours (`text-gray-400`,
`bg-yellow-400`, `bg-green-500`) inherited from upstream. The aliases rendered correctly and so
survived unnoticed; the palette colours did not, because they are fixed values that do not change
between themes — which is how the light theme ended up with unreadable secondary text and the
player's scrubber ended up stock `yellow-300` rather than the Podshelf amber.

Both are gone, and the alias definitions were deleted so a stray one now renders *no colour at
all* rather than looking slightly off. `scripts/check-theme-tokens.mjs` (the `theme` step of
`npm run verify`) fails on either, with a small allowlist for the genuine exceptions — the player
picks its glyph colour against the cover art's lightness, which no token can express.

## Critical Constraints

**State management — Pinia only, not Vuex.**
`this.$store` does not exist. Use named store composables: `useAppStore()`, `useUserStore()`, `useGlobalsStore()`, `useLibrariesStore()`, etc.

**Never edit legacy Nuxt 2 files.**
`pages/**/_id.vue` and `pages/**/_id/**` are in `nuxt.config.ts` `ignore` list — kept for reference only.

**Never add files under `plugins/capacitor/`.**
That directory is in `ignore` — Nuxt will not auto-scan it. Capacitor is bootstrapped via the explicit plugin list in `nuxt.config.ts`.

**Component naming uses path-prefix convention.**
`components/connection/ServerConnectForm.vue` is referenced as `<connection-server-connect-form>`.

**Public assets dir is `static/`, not `public/`.**
Configured via `dir: { public: 'static' }` in `nuxt.config.ts`.

**Auto-import dirs:** `stores/`, `composables/`, `constants/` — no explicit imports needed for files in these directories.

**The Nuxt 2→3 migration is still in progress.** Do not revert to Nuxt 2 / Vuex patterns.

**ESLint needs its parser chain intact.** `.eslintrc.cjs` sets `parser: 'vue-eslint-parser'`
with `parserOptions.parser: '@typescript-eslint/parser'`. Without both, every
`<script setup lang="ts">` block fails to parse and the lint run degrades into 100+ "Parsing
error" messages that hide real findings — which is how it sat for most of the migration.
`no-extra-semi` is off on purpose: `.prettierrc` sets `"semi": false`, so Prettier emits the
leading `;(` that the rule flags.
