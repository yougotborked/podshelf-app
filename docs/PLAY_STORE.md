# Publishing Podshelf to Google Play

What the repository already does, and what only a human with the Play Console can do.

**Automated:**

- `.github/workflows/publish-play.yml` — builds a signed AAB and uploads it to a Play track.
  Every push to master goes to **internal testing**; a `v*` tag goes to **closed testing**.
- `.github/workflows/sync-play-listing.yml` — pushes the title, descriptions, icon, feature
  graphic and screenshots from `docs/store/` **on a tag**. On master it validates the content
  and sends nothing (see *Why committing an edit cancels a review* below). The listing lives in
  the repo and is reviewable in a diff rather than typed into the Console.

**Not automatable, because Google exposes no API for it:**

- Registering the developer account — it is identity verification, deliberately human.
- **Creating the app record.** The Publishing API only operates on apps that already exist;
  there is no create method for a public app. (`playcustomapp.accounts.customApps.create` exists
  but is for private enterprise apps.)
- The content rating questionnaire and the data safety form — legal declarations.
- Granting the service account permission in Play Console.

**Not automated on purpose:** generating the upload key. A private key that passes through a
terminal, a chat window or a CI log is a key you have to treat as compromised. Step 3 is one
command you run yourself.

Everything below is one-time. After it, releases and listing updates are a `git tag` and a
`git push`.

---

## 0. Know the gate before you start

If your Play account is a **personal** account created after 13 November 2023, you cannot publish
to production until you have run a **closed** test with at least **12 testers opted in
continuously for 14 days**, and then applied for production access — and meeting the bar only
makes you eligible, it is not automatic
([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465)).

**Internal testing does not count toward that.** Only the closed track does.

If the only person using this is you, stop at **internal testing**: up to 100 testers, live within
minutes, no gate and no waiting, and you get the app on your phone from Play with automatic
updates. That is most of the benefit for none of the cost. Production can wait until there is a
reason for it.

---

## 1. Play Console account

1. Register at [play.google.com/console](https://play.google.com/console) — US$25, one time.
2. Complete identity verification. This can take a few days.
3. Organization accounts (which need a D-U-N-S number) are reportedly exempt from the
   12-tester gate; personal accounts are not. Worth confirming against the help page above if
   that difference matters to you.

## 2. Create the app

In the Play Console, create an app with package name **`com.podshelf.app`**.

This must match `applicationId` in `android/app/build.gradle` exactly, and **can never be changed
afterwards**. The publish workflow assumes the app already exists; it uploads to it, it does not
create it.

Accept **Play App Signing** when offered. Google then holds the real app signing key and you hold
only an *upload* key — which means a lost upload key can be reset, rather than ending the app.

## 3. Generate the upload key

```shell
keytool -genkeypair -v \
  -keystore podshelf-upload.jks \
  -alias podshelf-upload \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Podshelf, O=Podshelf, C=US"
```

Without `-dname`, keytool asks for a name, organisation, city, state and country. **None of it has
to be real.** Those fields are X.509 certificate metadata; under Play App Signing, Google re-signs
the app with a key it holds, and Android never shows a certificate to the user. `-dname` above just
answers them up front. Pressing Enter through the prompts is equally fine — the fields become
`Unknown`.

Two things that *do* matter. The DN is readable from any signed artifact
(`apksigner verify --print-certs`), so do not put a home address in it. And let keytool prompt for
the password rather than passing `-storepass`, which would leave it in your shell history.

Keep `podshelf-upload.jks` and its passwords somewhere you will still have them in five years —
a password manager, not this repository. **Never commit it.** `.gitignore` does not need to cover
it because it should not live in the working tree at all.

Then base64 it for the GitHub secret:

```shell
base64 -w0 podshelf-upload.jks > podshelf-upload.jks.base64
```

## 4. GitHub secrets

Repository → Settings → Secrets and variables → Actions. The workflow checks all five are present
before it builds and fails with a readable message if any is missing.

| Secret | Value |
|---|---|
| `PLAY_UPLOAD_KEYSTORE_BASE64` | contents of `podshelf-upload.jks.base64` |
| `PLAY_KEYSTORE_PASSWORD` | keystore password from step 3 |
| `PLAY_KEY_ALIAS` | `podshelf-upload` |
| `PLAY_KEY_PASSWORD` | key password from step 3 |
| `PLAY_SERVICE_ACCOUNT_JSON` | the whole JSON file from step 5 |

The workflow uses a `play` [environment](https://docs.github.com/en/actions/deployment/targeting-different-environments),
so you can scope these secrets to it and add a required reviewer if you ever want a manual gate
before anything reaches Play.

## 5. Service account, so CI can upload

Most of this is scripted. Run it signed in as yourself — it needs your Google credentials, which
is why it is a script you run rather than something done for you:

```shell
gcloud auth login
bash scripts/setup-play-service-account.sh
```

It creates the project, enables the Google Play Android Developer API, creates the service
account and writes a key file. It grants no project-level IAM role on purpose: publishing rights
come from Play Console, and a role here would widen what the key reaches without helping.

Two steps it cannot do, and prints instructions for:

1. **Invite the service account in Play Console** → *Users and permissions* → *Invite new user*,
   and grant it, for this app:
   - **Manage store presence** — required to sync the store listing. Without it the service
     account can still authenticate, open an edit and upload every image, and only the final
     commit is refused with a bare "The caller does not have permission".
   - *Release to testing tracks*
   - *View app information and download bulk reports*
   - *Release to production* — only if you want tagged builds to go live.

   There is no API for granting Play Console access. Permission changes can take minutes, and
   occasionally up to 24 hours, to reach the API: if a 403 persists straight after granting one,
   wait and retry before changing anything else.
2. **Add the key as `PLAY_SERVICE_ACCOUNT_JSON`**, then delete the local copy. A key file left in
   a working tree is a key that eventually gets committed.

## 6. Store listing assets

Generated from the app and its mark, so they cannot drift from it:

| Asset | Where | Regenerate with |
|---|---|---|
| Icon, 512×512 | `docs/store/icon-512.png` | `npm run store:assets` |
| Feature graphic, 1024×500 | `docs/store/feature-graphic-1024x500.png` | `npm run store:assets` |
| Phone screenshots, 1080×1920 | `docs/store/screenshots/` | `npm run screenshots` |

**Retake the screenshots on a real device before you publish.** The generated ones come from the
test harness against mock data, so they carry two artifacts: the home screen shows a stub
"Test Book" placeholder from the web database stub, and every screen shows the offline badge
because the harness never connects a socket. They are a usable starting point and the right
sizes; they are not a good listing.

The listing copy lives in `docs/store/listing.en-US.json` and is pushed by
`npm run store:listing` (or the sync workflow). Validate it without sending anything:

```shell
node scripts/sync-play-listing.mjs --dry-run
```

That checks Play's length limits — title 30, short description 80, full description 4000 — which
otherwise fail the commit with a message that does not say which field. Adding another language
is another `listing.<language>.json` beside it.

**Privacy policy URL** — required, even though the app collects nothing:

```
https://yougotborked.github.io/podshelf-app/privacy.html
```

It is published automatically with the test page on every push to master, from
`.github/privacy-policy.html`.

## 7. Data safety form

Answers that match what the code actually does, as of this writing — a scan found no analytics,
crash reporting or advertising SDK, and the only third-party host contacted is Podcast Index:

- **Does your app collect or share any of the required user data types?** → **No**.
- **Is all user data encrypted in transit?** → Yes, assuming your server uses HTTPS. The app also
  allows plain HTTP, because self-hosted servers on a LAN often have no certificate; say so if
  the form gives you room.
- **Do you provide a way for users to request data deletion?** → There is no account and no
  server of ours to delete from. Uninstalling removes everything local.

Two things are worth mentioning in the listing description rather than hiding:

- Searching for a new podcast sends the search terms to `api.podcastindex.org`.
- Everything else goes only to the Audiobookshelf server the user configures.

Re-check this form whenever a dependency is added that talks to the network.

## 7b. Foreground service declaration

Play asks what each foreground service permission is for. The answers follow from the manifest,
so they are recorded here rather than re-derived every release.

| Permission | Declared by | Answer |
|---|---|---|
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | `PlayerNotificationService` (`mediaPlayback`) | **Media playback** |
| `FOREGROUND_SERVICE_DATA_SYNC` | `DownloadService` (`dataSync`) | **Network processing → Other** |

Not *Backing up, restoring* — nothing here is a backup. Description, if asked:

> Downloads podcast episodes the user has selected, or enabled auto-download for, from their
> self-hosted Audiobookshelf server so they can be played without a connection. A progress
> notification is shown for the duration. The service runs in the foreground so a download
> completes while the user is in another app rather than restarting.

Play often asks for a short video for a `dataSync` declaration. Filming a download starting, the
notification showing progress, and the episode playing offline afterwards covers it.

## 7c. The two upload warnings, and why both are ignorable

**"No deobfuscation file."** Release builds are R8-minified now and the publish workflow uploads the
mapping files, so this warning should not appear. If it does, the upload step failed.

**Do not enable R8 to silence it.** Three dependencies resolve types reflectively — Jackson
serialises every data class, paperdb does the same for storage, and Capacitor resolves plugins by
name. Without correct keep rules those fail *at runtime, not at build time*: the unit tests stay
green and the app breaks on a device. It is a deliberate piece of work with a device pass, not a
pre-launch tweak.

**"No native debug symbols."** The bundle contains one native library,
`libandroidx.graphics.path.so`, which comes from AndroidX and ships stripped. This project builds
no native code — there is no `externalNativeBuild` — so there is no symbol file to produce.
`ndk.debugSymbolLevel` only covers native code the project compiles itself. Unactionable.

## 8. Listing copy

- **App name:** Podshelf
- **Short description:** A podcast player for your own Audiobookshelf server.
- **Full description:** start from `readme.md`, which already describes the catch-up workflow,
  Android Auto and offline behaviour.
- **Category:** Music & Audio
- Say plainly that it **requires an Audiobookshelf server** and provides no content. The old
  upstream string already in the app says this; the listing should too, or you will get
  one-star reviews from people who installed it expecting a podcast directory.
- Do not imply any affiliation with the Audiobookshelf project. Podshelf is an independent fork;
  describe it as a client *for* an Audiobookshelf server.

### Tags

Up to five, from Google's fixed list under **Grow users → Store presence → Store settings →
Manage tags**. Not free text.

**There is no Podcast tag.** The audio-related ones are: Audio recorder, Audiobook, Music &
audio, Music instrument, Radio, Ringtone, Sound effect, Karaoke, Guitar, Lyrics. Only two of them
are honest here:

1. **Audiobook** — true (Podshelf is an Audiobookshelf client and plays books), and it reaches
   people already running a server, who are the actual audience.
2. **Music & audio** — generic, but accurate.

That is the whole list. Two is fine; Google assigns further tags on its own, and padding with
inaccurate ones is worse than leaving slots empty.

**Not Radio**, however adjacent podcasts feel. Radio means streamed stations. Someone searching
it would install Podshelf, find an app that needs a server they do not have, and leave a one-star
review — which a new listing with no ratings cannot absorb. It is the only other tempting tag and
it is a trap.

**Because no Podcast tag exists, the word has to reach Play search through the title and
descriptions**, which Play indexes. The title has a 30-character budget and currently uses 8:

| Title | Length |
|---|---|
| `Podshelf` | 8 |
| `Podshelf: Podcast Player` | 24 |
| `Podshelf: Self-hosted Podcasts` | 30 |

A store title is not the launcher name — changing it does not rename the app on anyone's device.
Weigh discoverability against wanting the brand to stand alone.

Tag changes take up to 24 hours to appear, and Google suggests changing them only after
significant feature changes.

## 9. Publish

Everything above is one-time. After that there are two cadences, because "can my testers have
this" and "this is a release" are different decisions.

**Every push to master publishes to internal testing, automatically.** Nothing to run. Internal
testing reaches the accounts on the internal list within minutes and **skips Google's review
entirely**, so there is nothing to weigh up per commit — the same build already goes to the
Releases page as a debug APK, and this just puts it somewhere a phone can install from Play
instead of sideloading.

**A tag publishes to closed testing (`alpha`),** which *is* reviewed by Google before testers
see it. That review is the reason this stays deliberate:

```shell
git tag v0.14.0
git push origin v0.14.0
```

Both paths leave the watch bundle out — see the three Play Console steps below. Run the workflow
from the Actions tab to choose a different track, or to include the watch once its form factor
exists.

Promoting between tracks afterwards is a Play Console action rather than a re-upload: a version
code can only be uploaded once, so the track here decides where a release *lands*, not where it
can ever go.

### The Play build is a different app from the one you sideloaded

`applicationId` is `com.podshelf.app`, and debug builds carry `applicationIdSuffix ".debug"`.
So a build installed from Play is `com.podshelf.app` and every APK ever sideloaded from the
Releases page is `com.podshelf.app.debug` — **two separate applications**, installed side by
side, sharing nothing.

Installing the Play build therefore gives a *fresh* app: no server connection, no library, no
downloads, no queue, no settings. Nothing is missing from the build — the web assets are built
the same way in both workflows (`npm run generate` then `cap sync`), and `minifyEnabled` is
false for release, so nothing is stripped either. It is simply a first run. Sign in again and
it has everything master has.

The watch does not bridge the two either, for two independent reasons:

- The Wearable Data Layer only delivers between apps sharing **both** an applicationId and a
  signing certificate. A sideloaded watch app is `com.podshelf.app.debug` signed with the debug
  key; a Play phone app is `com.podshelf.app` signed with the upload key. They cannot see each
  other.
- Until the Wear OS form factor exists in Play Console there is no `wear:` track to publish
  the watch to, so a Play install is the phone app alone.

For watch testing, keep the sideloaded debug pair together, or get the watch onto Play and use
that pair. Mixing one of each will not work and is not a bug.

### Shipping the watch through Play

Both bundles go up on every publish. There is no switch for the watch, and there deliberately
isn't one: internal testing is master's tip on *both* devices or it is not doing its job.

**The two bundles go to two different tracks.** Adding the Wear OS form factor gives it
dedicated tracks, named by prefixing the mobile one — `internal` for the phone,
`wear:internal` for the watch ([track naming][tracks], [dedicated form factor tracks][ff]).
They are not interchangeable, and Play checks each bundle's manifest against the track it
arrives on:

| Bundle | Track | Result |
|---|---|---|
| phone | `internal` | fine |
| phone | `wear:internal` | *"APKs or Android App Bundles in this track must require the following features: android.hardware.type.watch"* |
| watch | `wear:internal` | fine |
| watch | `internal` | rejected for requiring that feature |

So the workflow calls the upload action **twice**, once per bundle. It sends every
`releaseFiles` entry to every track it is given, which cannot express "this one there, that one
here". `android/wear/src/main/AndroidManifest.xml` states `android:required="true"` on the
watch feature explicitly — it is already the default, but it is what the routing turns on.

That split is also why the watch needs no gate. There used to be one, because while both
bundles shared a track Play failed the **whole** release if a Wear artifact arrived before the
Wear form factor existed — the watch could take the phone release down with it. Separate tracks
are separate edits: the phone upload has already committed by the time the watch one runs, so a
watch problem is a failed step and a red run rather than a phone release that never happened.

[tracks]: https://developers.google.com/android-publisher/tracks
[ff]: https://support.google.com/googleplay/android-developer/answer/13295490

### Why committing an edit cancels a review

Committing **any** Play edit while a release is in review cancels that submission and opens a
new one covering everything still unreviewed. It does not matter that the edit is unrelated: a
listing-only edit, which never mentions a track, still gets the pending Closed testing release
folded into it.

This is not theoretical. Between Oct 23 and Oct 29 the listing sync ran eight times on master
and produced eight submissions, each reading *"Closed testing - Alpha, Store Listing, App
Content, Store settings"* — seven cancelled, one in review. versionCode 1300 never finished
review, because every push to master restarted it.

Two rules follow, and both are enforced in the workflows:

- **The listing is only *sent* on a tag.** A push to master validates it and stops.
**An internal upload does not create a submission at all**, which the same timings show from
the other direction: the internal upload finished at 2:11 PM and the internal release reads
2:10 PM, with no submission for it. Submission #1 is 2:25 PM, one minute after the 2:24 PM
Closed testing release. So internal-track changes do not go to review, and automatic publishing
on master leaves the review queue alone once the listing sync is tag-gated.

`changesNotSentForReview: true` is **not** the lever for this, and is not available here. Play
rejects it for this app:

```
Changes are sent for review automatically.
The query parameter changesNotSentForReview must not be set.
```

### Version numbering

One implementation, `scripts/app-version.sh`, used by the publish workflow, the debug builds and
local Gradle alike. It asks git for the newest `v*` tag and counts the commits since it:

| HEAD | versionName | versionCode |
|------|-------------|-------------|
| no tag at all | `0.0.0-untagged` | `1` |
| exactly `v0.13.0` | `0.13.0` | `1300000` |
| 72 commits later | `0.13.0-dev.72` | `1300072` |
| exactly `v0.14.0` | `0.14.0` | `1400000` |

```
code = (major × 10000 + minor × 100 + patch) × 1000 + commits-since-tag
```

The tag must be `vMAJOR.MINOR.PATCH`, and minor and patch must each stay under 100; anything else
fails before a build starts, because a malformed tag would otherwise produce a nonsense code that
Play would accept and then never let us go below.

**Why a build component exists at all.** Play rejects a versionCode it has already seen, and
refuses one lower than what a track already holds. Publishing on every master push means far more
uploads than there are tags, so each needs a code of its own. Multiplying the semver part by 1000
leaves room for 999 builds between tags while keeping the ordering that matters: a master build
always sorts above the tag it follows, and the next tag always sorts above every master build
before it. Past 999 commits without a tag the script fails rather than wrapping — wrapping would
hand Play a number it has seen, which cannot be undone.

`test/appVersion.test.ts` drives the script against real throwaway git repositories and asserts
that ordering directly, because the failures that actually happened were about what git reported
on a shallow clone, not about the arithmetic.

> The codes jumped by a factor of 1000 when this scheme arrived — `0.13.0` was `1300` under the
> old one and would be `1300000` now. That direction is safe (Play only needs each upload to be
> higher), but it is why the watch's offset had to move too; see below.

### Before the watch can go to Play at all

Three things have to exist in Play Console first, and none of them is code. Play fails the
**whole release** if a Wear artifact arrives before they do — not just that artifact — so an
unconfigured watch listing blocks the phone release with it.

1. **Add the Wear OS form factor.** Test and release → Advanced settings → Form factors →
   **+ Add form factor** → Wear OS. Until this is done there is nowhere to put a watch build or
   its screenshots.
2. ~~At least one Wear OS screenshot~~ — **done, and generated here.**
   `./gradlew :wear:recordRoborazziDebug` renders the watch's real composables at 384 × 384 into
   `docs/store/wear/`, and `sync-play-listing.mjs` uploads them as `wearScreenshots`.

   Roborazzi draws them through Robolectric rather than a device, which is what makes this
   possible at all: there is no Wear emulator here (no KVM, so one would be software-rendered)
   and the web screenshot harness cannot help, since it drives the Nuxt app in a browser while
   this module is native Compose. The previews render the *same* composables the watch draws -
   `QueueRow`, `NowPlayingContent` - so the screenshot stays evidence about the real screen
   rather than a picture of a mock-up.
3. ~~Mention "Wear OS" in the listing~~ — **done**, in `docs/store/listing.en-US.json`.

So only the form factor is left, and only step 1 needs a human. Once it exists, nothing else has
to be turned on: every publish sends the watch to its `wear:` track alongside the phone.

Before it exists there is no `wear:internal` to upload to, and the watch step fails — loudly,
and without affecting the phone release, which has already committed by then.

### Looking at the watch screens

`./gradlew :wear:recordRoborazziDebug` writes them; `verifyRoborazziDebug` fails if they have
drifted. They are worth looking at after any change to the watch UI, for the same reason the web
screenshots are: the first render of the now-playing screen had "Queue" clipped to "Queu" and
both bottom controls running off the edge of a round display. Nothing else catches that — a
384 px circle is not a shape any assertion describes.

### The watch's version code

The watch app ships under the same `applicationId` and the same signing key as the phone app, so
Play treats them as one listing with two device targets — one store page, one set of reviews, and
the watch app installs by itself when someone with a paired watch installs Podshelf.

Its version code must **not** equal the phone's. A version code has to be unique across every
form factor in a listing, and Play rejects a release where two artifacts share one. It is also
deliberately *higher*: a watch can match the phone artifact as well, and Play offers a device the
highest code it qualifies for.

`podshelfWearVersionCode` is therefore `podshelfVersionCode + 1000000000`. A constant offset
rather than a separate counter, so the watch's codes rise exactly as often as the phone's and
neither can fall behind its own last release.

**The offset has to clear the phone's whole range, not just its current value.** It was
`1000000`, which was fine while a phone code was the semver part alone (`0.13.0` → `1300`). Once
the build component arrived and phone codes became seven digits, the watch's `0.13.0` code landed
on `2300072` — which is exactly what the phone's `v0.23.0-dev.72` would ask for a few releases
later. Reserving a clear decade above every phone code the scheme can produce is the only version
of this that cannot come back.

`android/variables.gradle` fails the build if the phone's code ever reaches the reserved range, or
if the watch's exceeds the 2100000000 that Play and the platform allow. It used to check whether
the two codes were *equal*, which a constant non-zero offset makes impossible — that check could
not fail, and so it did not notice the overlap above. Play's own error names the upload rather
than the codes, and an `.aab` is not an APK, so a workflow step that tried to read the codes back
out of the artifacts would silently pass.

---

## Path to production

Read from the Publishing API with `play-status.yml` (Actions -> Play status -> Run workflow), which
also asks Play whether it would accept the build on each track. As of 2026-11-11:

| Track | State |
|---|---|
| `internal`, `wear:internal` | live, 0.14.0-dev.68 |
| `alpha` (closed testing) | live, 0.14.0 |
| `beta` (open testing), `production`, `wear:production` | empty, and **Play refuses to assign a release to `beta` or `production`** (`FAILED_PRECONDITION`) |

The refusal is real and not a quirk of the probe: the same release is accepted on `internal` and
`alpha` in the same edit, and rejected on `beta` and `production`. It is the personal-account rule
from section 0 - no open testing or production until a closed test has run with at least 12 testers
opted in for 14 days **and Google has granted production access** - so the next steps are a clock,
and one click that only the account owner has.

The store listing is not what is in the way: title, short and full description, four phone
screenshots, two watch screenshots, icon, feature graphic, contact email and website are all
present. Tablet screenshots (7" and 10") are absent; they are not required, but they help on a
tablet's store page.

1. **Get 12+ testers into the closed test and keep them there for 14 days.** Play Console ->
   Testing -> Closed testing -> Testers. The API shows no tester groups for any track, and does not
   expose individual email lists, so the real count has to be read in the Console. The 14 days run
   from when the 12th tester opted in, and they must stay opted in continuously.
2. **Keep a current build in front of them.** A tag publishes to `alpha` (reviewed by Google).
   Cut one when there is something worth testing, and not more often than that: every listing or
   release commit while a release is in review restarts the review (see *Why committing an edit
   cancels a review*).
3. **Watch for crashes** with `play-vitals.yml` while the clock runs. A crash-free 14 days is also
   what makes the production application read well.
4. **Apply for production access** (Console -> Dashboard -> "Apply for production"), which asks
   how testing went. Only the account owner can; there is no API.
5. **Then** promote the tested build to `production` (and the matching watch build to
   `wear:production`). Start with a staged rollout - 10-20% - and widen it while vitals stay clean.

Also confirm once, in the Console, that the Dashboard's setup tasks are all ticked (content rating,
data safety, target audience, ads declaration, app access). They are not visible through the API,
and a missing one blocks the release at the last step rather than at the first.

---

## A note on the licence

Podshelf is GPL-3.0, inherited from Audiobookshelf. Distributing GPL software through Play is
generally considered workable — the source stays public and the licence is preserved — but there
is real history around GPL and app store terms, and this is not legal advice. Worth reading up
before you publish rather than discovering it afterwards.
