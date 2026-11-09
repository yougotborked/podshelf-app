import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every native plugin the app depends on is in the Android build, except the ones left out on
 * purpose.
 *
 * capacitor.config.json lists android.includePlugins to keep @capacitor/status-bar out of the
 * Android build (see AbsSystemBars.kt). An include list fails quietly: a plugin added to
 * package.json and not to the list is simply absent on Android, and its calls reject at runtime
 * with "not implemented" - on the one platform nobody tests in a browser. This keeps the list
 * and the dependencies in step.
 */
const ROOT = resolve(__dirname, '..')
const read = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))

/** Left out of Android deliberately, with the reason next to each. */
const EXCLUDED_ON_ANDROID: Record<string, string> = {
  '@capacitor/status-bar': 'calls APIs Android 15 deprecated; replaced by AbsSystemBars'
}

function nativePlugins(): string[] {
  const deps = Object.keys(read('package.json').dependencies ?? {})
  return deps.filter((name) => {
    let pkg: Record<string, unknown>
    try {
      pkg = read(`node_modules/${name}/package.json`)
    } catch {
      return false
    }
    const capacitor = pkg.capacitor as Record<string, unknown> | undefined
    return !!capacitor?.android || !!pkg.cordova
  })
}

describe('android.includePlugins', () => {
  const included: string[] = read('capacitor.config.json').android?.includePlugins ?? []

  it('names every native plugin except the deliberate exclusions', () => {
    const expected = nativePlugins().filter((name) => !(name in EXCLUDED_ON_ANDROID))
    expect([...included].sort()).toEqual(expected.sort())
  })

  it('names nothing that is not a dependency', () => {
    const plugins = new Set(nativePlugins())
    expect(included.filter((name) => !plugins.has(name))).toEqual([])
  })
})
