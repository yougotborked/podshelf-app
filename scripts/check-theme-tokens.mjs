#!/usr/bin/env node
// Fails when a component reaches for a colour outside the Material token set.
//
// Two things this catches, for different reasons:
//
//   - The retired alias tokens (text-fg, bg-primary, border-border …). These used to be defined
//     as exact duplicates of Material tokens, which is how two vocabularies for one palette grew
//     side by side. The definitions are gone now, so a stray one renders *no colour at all* -
//     a silent failure that a screenshot of the wrong theme might not even show.
//   - Raw Tailwind palette colours (text-gray-400, bg-slate-200 …). These are fixed values that
//     do not change between themes, so they look deliberate in dark and wrong in light. That is
//     exactly how the light theme ended up with unreadable secondary text.
//   - Raw colour values in CSS (#fb8c00, rgb(26, 214, 145), rgba(0,0,0,.3) …). Both rules above
//     match Tailwind *class names*, so a colour written as a CSS value was invisible to this
//     script by construction - which is how the player's seek bar kept a hardcoded green that
//     no theme could reach. Worse than a palette class, because those declarations carried
//     !important and so actively beat the token rather than merely sitting beside it.
//
//   node scripts/check-theme-tokens.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN = ['pages', 'components', 'layouts', 'assets']

// Retired in favour of their Material equivalents; see assets/tailwind.css.
const RETIRED = ['fg-muted', 'fg', 'bg-hover', 'bg-toggle-selected', 'bg-toggle', 'bg', 'border', 'primary', 'secondary', 'accent', 'dynamic-primary', 'dynamic-surface']
const PREFIX = 'text|bg|border|ring|from|to|via|divide|placeholder|fill|stroke|outline|shadow|caret'
const retiredRe = new RegExp(`\\b(${PREFIX})-(${RETIRED.join('|')})\\b`, 'g')
const paletteRe = /\b(text|bg|border|ring|from|to|via|divide|fill|stroke)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g

// white and black have no numeric suffix, which is why paletteRe never saw them. They are the same
// defect as text-gray-400 - a fixed value on a surface that changes - except where the thing under
// them is not a theme surface at all: cover art, a scrim, a reader's own paper. Those are in ALLOW.
const whiteBlackRe = /\b(text|bg|border|ring|from|to|via|divide|fill|stroke)-(white|black)(\/\d+)?\b/g

// A colour written as a value rather than a class. rgb()/rgba() only when the first argument is
// a digit, so `rgb(var(--md-primary) / 0.3)` - the correct form - is not flagged.
const literalRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d[^)]*\)|hsla?\(\s*\d[^)]*\)/g

// Deliberate exceptions, each with a reason.
const ALLOW = new Map([
  // Chosen against the cover art's own lightness, not against the theme - the pairing is the
  // point, and no token can express "whatever contrasts with this artwork".
  ['components/app/AudioPlayer.vue', [
    /text-gray-800/,
    // The same pairing's light half, and the scrim lift on dark artwork: drawn over the cover art,
    // not a theme surface, so white here is chosen against the artwork too.
    /^(text|bg)-white(\/\d+)?$/,
    // The fallback until fast-average-color reports the artwork's own colour. A token cannot
    // stand in for "whatever this cover happens to be".
    /rgb\(55, 56, 56\)/
  ]],

  // Overlays and badges sit on the cover thumbnail; a scrim darkens the art whatever the theme.
  ['components/cards/AuthorCard.vue', [/^(bg|text)-(white|black)(\/\d+)?$/]],
  ['components/cards/LazyBookCard.vue', [/^(bg|text|to)-(white|black)(\/\d+)?$/]],
  // The heading in a modal's #outer slot sits on the scrim above the sheet, not on the sheet.
  ['components/modals/BookmarksModal.vue', [/^text-white$/]],
  ['components/modals/ChaptersModal.vue', [/^text-white$/]],
  ['components/modals/CustomHeadersModal.vue', [/^text-white$/]],
  ['components/modals/ItemDetailsModal.vue', [/^text-white$/]],
  ['components/modals/PodcastEpisodesFeedModal.vue', [/^text-white$/]],
  ['components/modals/SelectLocalFolderModal.vue', [/^text-white$/]],
  // The close button floats on the scrim, so it carries its own dark disc.
  ['components/modals/Modal.vue', [/^(bg-black\/\d+|text-white)$/]],
  // Status buttons are drawn on the fixed status palette (bg-warning, bg-error, bg-info ...), which
  // does not follow the theme either, so their label colour is fixed with them.
  ['components/ui/Btn.vue', [/^text-white$/]],
  // A focus-ring shadow, not a surface.
  ['components/ui/MultiSelect.vue', [/^ring-black\/5$/]],

  // Rendered into a shareable image. It should look the same in everyone's feed rather than
  // following whichever theme the person who generated it happened to be using.
  ['components/stats/YearInReview.vue', [/^#[0-9a-fA-F]{3,8}$/]],
  ['components/stats/YearInReviewServer.vue', [/^#[0-9a-fA-F]{3,8}$/]],
  ['components/stats/YearInReviewShort.vue', [/^#[0-9a-fA-F]{3,8}$/]],

  // The reader carries its own themes - white, sepia, dark - chosen for reading rather than to
  // match the app chrome, so its colours are deliberately independent of the Material set.
  ['components/readers/EpubReader.vue', [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\(\s*\d[^)]*\)$/, /^(text|bg)-(white|black)(\/\d+)?$/]],
  ['components/readers/Reader.vue', [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\(\s*\d[^)]*\)$/, /^(text|bg)-(white|black)(\/\d+)?$/]],
  // A PDF or Mobi page is paper: white with a dark hairline whatever the app theme is.
  ['components/readers/MobiReader.vue', [/^(bg-white|border-black\/20)$/]],
  ['components/readers/PdfReader.vue', [/^(bg-white|border-black\/20|text-white(\/\d+)?)$/]]
])

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (/\.(vue|css)$/.test(path)) yield path
  }
}

const problems = []
for (const base of SCAN) {
  for (const path of walk(join(ROOT, base))) {
    const rel = relative(ROOT, path)
    // tailwind.css defines the tokens; it is allowed to name them
    if (rel === 'assets/tailwind.css') continue
    const allowed = ALLOW.get(rel) || []
    const source = readFileSync(path, 'utf8')
    source.split('\n').forEach((line, i) => {
      for (const re of [retiredRe, paletteRe, whiteBlackRe, literalRe]) {
        re.lastIndex = 0
        for (const match of line.matchAll(re)) {
          if (allowed.some((a) => a.test(match[0]))) continue
          problems.push({ rel, line: i + 1, token: match[0] })
        }
      }
    })
  }
}

if (!problems.length) {
  console.log('✓ no retired classes, palette classes or raw colour values')
  process.exit(0)
}

console.error(`✗ ${problems.length} colour(s) outside the token set:\n`)
for (const p of problems) console.error(`  ${p.rel}:${p.line}  ${p.token}`)
console.error(
  '\nUse the Material tokens in assets/tailwind.css (md-surface-*, md-on-surface*, md-outline*,\n' +
    'md-primary*, md-scrim, md-shadow). In CSS that is rgb(var(--md-primary) / 0.3), not a literal.\n' +
    'If a colour genuinely must not follow the theme, add it to ALLOW in this file with the reason.'
)
process.exit(1)
