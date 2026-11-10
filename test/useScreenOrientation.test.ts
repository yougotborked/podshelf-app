import { afterEach, describe, expect, it, vi } from 'vitest'
import { getScreenOrientation } from '~/composables/useScreenOrientation'

afterEach(() => vi.unstubAllGlobals())

describe('getScreenOrientation', () => {
  it('returns the orientation object where the webview has one', () => {
    const orientation = { type: 'portrait-primary', addEventListener: () => {} }
    vi.stubGlobal('screen', { orientation })
    expect(getScreenOrientation()).toBe(orientation)
  })

  it('is undefined on a webview without it (iOS), not a throw', () => {
    vi.stubGlobal('screen', {})
    expect(getScreenOrientation()).toBeUndefined()
  })

  it('is undefined when there is no screen at all', () => {
    vi.stubGlobal('screen', undefined)
    expect(getScreenOrientation()).toBeUndefined()
  })
})
