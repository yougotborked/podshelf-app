import { describe, expect, it } from 'vitest'
import { asVoidHandler, describeRejection } from '~/composables/useRejectionLog'

describe('describeRejection', () => {
  it('names an Error and where it came from', () => {
    const error = new TypeError('boom')
    const text = describeRejection(error)
    expect(text).toContain('TypeError: boom')
    expect(text).toContain('(')
  })

  it('does not need a stack', () => {
    const error = new Error('no stack')
    error.stack = undefined
    expect(describeRejection(error)).toBe('Error: no stack')
  })

  it('reads the message off a Capacitor-style plain object', () => {
    expect(describeRejection({ message: 'plugin failed', code: 'UNAVAILABLE' })).toBe('plugin failed')
  })

  it('serialises an object with no message', () => {
    expect(describeRejection({ code: 7 })).toBe('{"code":7}')
  })

  it('survives an object that cannot be serialised', () => {
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(describeRejection(loop)).toBe('[object Object]')
  })

  it('says so when there is no reason at all', () => {
    expect(describeRejection(undefined)).toBe('(rejected with no reason)')
    expect(describeRejection(null)).toBe('(rejected with no reason)')
    expect(describeRejection('')).toBe('(empty rejection)')
  })

  it('passes a string through and stringifies anything else', () => {
    expect(describeRejection('network down')).toBe('network down')
    expect(describeRejection(404)).toBe('404')
  })
})

describe('asVoidHandler', () => {
  it('passes the arguments through and returns nothing', async () => {
    const calls: unknown[][] = []
    const wrapped = asVoidHandler(async (a: string, b: number) => {
      calls.push([a, b])
      return 'ignored'
    })
    expect(wrapped('x', 2)).toBeUndefined()
    await Promise.resolve()
    expect(calls).toEqual([['x', 2]])
  })

  it('does not throw into the caller when the handler rejects', async () => {
    const seen: unknown[] = []
    const onRejection = (reason: unknown) => seen.push(reason)
    process.once('unhandledRejection', onRejection)
    const wrapped = asVoidHandler(async () => {
      throw new Error('late failure')
    })
    expect(() => wrapped()).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 10))
    // Left unhandled on purpose, so the global listener can log it.
    expect(seen).toHaveLength(1)
  })
})
