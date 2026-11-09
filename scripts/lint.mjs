#!/usr/bin/env node
// ESLint over the Nuxt sources, compared against a committed baseline.
//
//   node scripts/lint.mjs            fail on any finding not in the baseline
//   node scripts/lint.mjs --update   re-record the baseline (after fixing findings)
//
// The rules in .eslintrc.cjs are the strict ones - floating promises, misused promises,
// conditions the types say can never change, explicit `any` - and the code predates them:
// turning them on reported about 1,300 findings. Fixing a floating promise means deciding what
// should happen when it fails, which is not a mechanical edit, so the existing ones are recorded
// here and each new one fails. The same shape as scripts/typecheck.mjs.
//
// Entries are keyed by file + rule + message and counted, never by line, so an edit above a
// finding does not make it look new. A file that gains a second finding of the same kind does.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = resolve(ROOT, 'scripts/lint-baseline.json')
const UPDATE = process.argv.includes('--update')

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

// The type-aware rules read tsconfig.json, which extends .nuxt/tsconfig.json; a missing or
// stale .nuxt makes every auto-imported name an error in the checker, not in the code.
console.log('• running nuxi prepare to refresh auto-import types')
const prepare = spawnSync('npx', ['nuxi', 'prepare'], { cwd: ROOT, stdio: 'inherit' })
if (prepare.status !== 0) fail('nuxi prepare failed')

console.log('• linting with the type checker')
const result = spawnSync(
  resolve(ROOT, 'node_modules/.bin/eslint'),
  ['--ext', '.js,.cjs,.mjs,.ts,.vue', '--format', 'json', '.'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
)
if (result.error) fail(`could not run eslint: ${result.error.message}`)

let files
try {
  files = JSON.parse(result.stdout)
} catch {
  // A config error or a crash prints text, not JSON - never a clean run.
  console.error(`${result.stdout}${result.stderr}`.slice(-4000))
  fail('eslint did not produce a report - treat this as a broken run, not a pass.')
}

const counts = new Map()
const locations = new Map()
let total = 0
for (const file of files) {
  const path = relative(ROOT, file.filePath)
  for (const m of file.messages) {
    // A parse error has no rule. It hides every real finding in that file, so it is always new.
    const rule = m.ruleId ?? 'parse-error'
    const key = `${path}|${rule}|${m.message}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!locations.has(key)) locations.set(key, [])
    locations.get(key).push(`${path}:${m.line}:${m.column}`)
    total += 1
  }
}

if (UPDATE) {
  const parseErrors = [...counts.keys()].filter((k) => k.includes('|parse-error|'))
  if (parseErrors.length) fail(`refusing to baseline parse errors:\n  ${parseErrors.join('\n  ')}`)
  const entries = Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), totalFindings: total, entries }, null, 2)}\n`
  )
  console.log(`✓ baseline updated: ${total} pre-existing finding(s) across ${counts.size} distinct site(s)`)
  process.exit(0)
}

if (!existsSync(BASELINE)) fail('no baseline recorded. Run `node scripts/lint.mjs --update` first.')

const expected = new Map(Object.entries(JSON.parse(readFileSync(BASELINE, 'utf8')).entries ?? {}))

const added = []
for (const [key, now] of counts) {
  const was = expected.get(key) ?? 0
  if (now > was) added.push({ key, was, now })
}
let fixed = 0
for (const [key, was] of expected) fixed += Math.max(0, was - (counts.get(key) ?? 0))

if (fixed) console.log(`\n• ${fixed} baselined finding(s) no longer reported - run npm run lint:update to tighten the baseline`)

if (added.length) {
  console.error(`\n✗ ${added.length} new lint finding(s) not in the baseline:\n`)
  for (const { key, was, now } of added) {
    const [, rule, message] = key.split('|')
    console.error(`  ${locations.get(key).join(', ')}`)
    console.error(`    ${rule}: ${message}${was ? `  (${was} → ${now})` : ''}`)
  }
  console.error('\nFix them. If one is genuinely wrong, disable it on that line with the reason.')
  process.exit(1)
}

console.log(`✓ no new lint findings (${total} baselined finding(s) still present)`)
