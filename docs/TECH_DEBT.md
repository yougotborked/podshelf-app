# Tech debt ledger

Every deliberate compromise that is waiting on something else, with the condition that clears
it. The point is that a workaround taken to unblock an afternoon does not quietly become
permanent: if it is here, it has an exit.

Entries are removed, not ticked off — the git history keeps the record.

## Open

### Updating the watch app over an older sideload can fail on the signing key

**Where** `android/wear/build.gradle`

A debug build of the watch app signed with a different key than the one already installed cannot
update it: Android refuses with *"signatures do not match newer version"*. The remedy is to
uninstall the watch app and install again, which also clears its cached queue and downloads.

The module now pins its debug signing to the repository's `debug.keystore`, so builds from here
on are stable. Before that it used AGP's default at `~/.android/debug.keystore`, which CI
happened to overwrite with the repository's copy — an implicit arrangement that could produce a
differently signed APK depending on what that file held when the build ran.

Any watch carrying a build from before the pin may need the one-time uninstall.

**Clears when** the watch app ships through Play, which signs every build with the upload key.

### 83 uses of text-white / bg-white are outside the token set

**Where** `components/**`, `pages/**`, `layouts/**`

`text-white`, `bg-white`, `text-black` and friends are fixed values that do not change between
themes - the same defect as a raw `text-gray-400`, and the same one the Material token rule
exists to prevent. The theme checker cannot see them: `paletteRe` requires a numeric suffix
(`-\d{2,3}`), and `white` has none.

One was found by looking at a light-theme screenshot: `ReadIconBtn` set `text-white` on the
wrapper and the unread shield drew with `currentColor`, so the mark-as-finished control was a
white icon on a near-white surface. That one is fixed. The other 82 are not audited.

They are not all wrong. White on a cover thumbnail, on a scrim, or on a filled accent button is
correct and should stay - which is exactly why this needs reading 82 call sites rather than a
regex, and why the rule cannot simply be switched on: it would fail the build on every one of
them at once.

**Clears when** the call sites have been audited, the genuinely theme-independent ones moved to
`ALLOW` with their reason, and `white|black` added to the checker so new ones cannot appear.

### The publish gate does not run the Kotlin tests

**Where** `.github/workflows/publish-play.yml`

Every push to master now publishes to Play's internal testing track automatically, and the
internal track has no review of its own, so a bad commit reaches testers within minutes. The
publish job therefore runs the checks that gate a pull request first — lint, typecheck and the
JS tests — and refuses to build if any fail.

It does **not** run `:app`, `:wear` or `:wear-sync` unit tests. Those need the Android SDK, a
~400MB install this job does not otherwise need because the release build uses the runner's
preinstalled one. The Build APK workflow runs them on the same commit, but *in parallel* rather
than before: a commit that breaks only a Kotlin test can still be published to internal testing,
and the red run shows up next to a release that already went out.

The hole is narrow — a Kotlin test failure that lint, typecheck and the JS suite all miss — and
internal testing is the cheapest track to be wrong on. But it is a hole, not a judgement that
Kotlin tests do not matter.

**Clears when** either the publish job can get the Kotlin tests cheaply (a cached SDK that makes
the install negligible), or the publish is restructured to trigger on Build APK completing green
via `workflow_run` instead of on the push itself.

### The watch's queue still arrives from one screen

**Where** `components/bookshelf/PodcastCatchUpFeed.vue`

The *session* is now published from the app layout on startup, so the watch always knows which
server it is talking to and can tell "the phone has never reached me" from "there is nothing to
play". The *queue* is still published by the one component that resolves it.

In practice that component is the landing screen for a podcast library, so opening the app
normally publishes. A user whose current library is a book library never renders it, and their
watch keeps whatever queue it last had — which is better than being wiped, and still not fresh.

Moving it means the resolved queue living somewhere a store can publish from, rather than being
a computed property of one component. That is a real refactor across two working surfaces (the
feed and minimal mode, which resolves the same queue independently), and the gap it closes is
narrow, so it is recorded rather than done.

**Clears when** the queue resolution moves into a store both surfaces read from.

### `android.r8.proguardAndroidTxt.disallowed=false`

**Where** `android/gradle.properties`

AGP 9 turned `getDefaultProguardFile('proguard-android.txt')` from a no-op into a hard error,
because that file carries `-dontoptimize`. Our own modules use the `-optimize` variant; the
flag exists for plugin build files under `node_modules/`, which are not ours to edit.

Capacitor 8 cleared almost all of it. This was a dozen plugin build files; it is now **exactly
one**, and not an official plugin:

```
node_modules/@capacitor-community/volume-buttons/android/build.gradle
```

Verified rather than assumed — removing the line and building fails on that file and nothing
else. Note this corrects the entry that used to live here, which blamed
`@webnativellc/capacitor-filesharer`. Filesharer is gone now and the flag was still needed, so
it was either never the only caller or never a caller at all.

It changes nothing for Podshelf's own shrinking: `:app` and `:wear` minify their release builds
with `proguard-android-optimize.txt`, which the check never objected to. The flag only keeps the
volume-buttons build file evaluable.

**Clears when** volume-buttons ships a build file that does not call the removed default, or
its uses are replaced — a far smaller job than when a dozen plugins needed it.

### Local network access is asked for at startup, not when it is needed

**Where** `android/app/src/main/java/com/audiobookshelf/app/MainActivity.kt`

`ACCESS_LOCAL_NETWORK` is requested in the startup batch alongside audio and notifications,
rather than at the moment the app first tries to reach a server on the LAN. That shows the
prompt to someone whose server is only ever reachable over the internet and who will never
need it.

It is where it is because a denial is not recoverable in place: without the permission a
connection to a private address does not fail, it times out after six seconds, and the connect
screen has no way to tell that apart from a server that is genuinely down. Asking later would
mean asking after a confusing failure.

**Clears when** the connect flow can resolve the server address off the main thread, notice
that it landed on a private address, and ask then — with a line of explanation attached to the
attempt that needs it.

### The watch waits for Wi-Fi rather than offering to find one

**Where** `android/wear/src/main/java/com/podshelf/wear/download/HighBandwidthNetwork.kt`

When no Wi-Fi turns up within the timeout, the download pass gives up and lets WorkManager try
again later. The user is told nothing. Google's guidance is to explain that the feature needs
Wi-Fi and offer a way into the watch's Wi-Fi settings
(`com.google.android.clockwork.settings.connectivity.wifi.ADD_NETWORK_SETTINGS`, which needs
`CHANGE_WIFI_STATE`).

Right now a watch that has never been on Wi-Fi will simply never download, and the queue rows
will say "Waiting for Wi-Fi" indefinitely with no way to act on it.

**Clears when** the watch UI can tell the difference between "downloading shortly" and "this
watch has no Wi-Fi to use", and offers the settings shortcut for the second.

### The watch's idea of the phone's position can be half a minute stale

**Where** `queueNeedsPublishing` in `android/wear-sync/.../WearSync.kt`

The watch decides whether to report its own listening by comparing its record against
`progressUpdatedAtMs` — the timestamp the phone last published. That timestamp rides along with
the position threshold rather than being compared itself, because it moves on every progress
tick and comparing it would wake the watch's radio every few seconds of playback.

So the baseline can be up to one threshold of playback out of date. For that to cause harm, both
devices have to be playing the *same* episode inside the same thirty-second window, and the
watch's write then lands on top of a slightly newer phone position. Two devices playing one
episode at once is already undefined, so this is an edge of an edge — but it is real, and it is
the price of not waking the watch constantly.

**Clears when** the phone also publishes on playback *stopping* — a rare, cheap event — which
would bound the staleness to "since you stopped".

### The Kotlin package is still `com.audiobookshelf.app`

**Where** `android/app/`

Deliberate, and documented in `CLAUDE.md`: nothing outside the build sees it, and renaming a
hundred source files is a large risky diff for no visible gain. Listed here only so nobody
mistakes it for an oversight.

**Clears when** there is an unrelated reason to touch every file in the module anyway.

### `noUncheckedIndexedAccess` is off, though Nuxt 4 turns it on

**Where** `tsconfig.json`

Nuxt 4's generated tsconfig enables `noUncheckedIndexedAccess`, which types `arr[i]` and
`record[key]` as possibly `undefined`. It is the right setting: it catches the empty-array and
missing-key crashes that `strict` alone lets through. Turning it on reported **102 new errors
across ~50 files**, one to six per file, almost all in UI components with no test coverage.

Fixing them means adding a guard at each site, and a guard is a behaviour decision - skip the
row, show a placeholder, bail out - not a type annotation. Making ~100 of those across untested
screens inside a framework upgrade is how a Nuxt bump ships a regression, so the root
`tsconfig.json` overrides it to `false` and the upgrade lands on its own.

Not added to the typecheck baseline instead, deliberately: 102 baseline entries would hide each
one individually, where one line in `tsconfig.json` is a single visible decision.

**Clears when** the 102 sites are fixed - a file at a time, each guard chosen rather than
asserted with `!` - and the override removed. `npm run typecheck` with the line deleted lists
them.

### 56 pre-existing type errors

**Where** `scripts/typecheck-baseline.json`

Left by the Nuxt 2 → 3 migration. `scripts/typecheck.mjs` fails only on a *new* error, so the
baseline keeps the check useful without a 56-error cleanup blocking everything else. Tighten it
with `npm run typecheck:update` after fixing any of them.

**Clears when** the baseline file is empty.
