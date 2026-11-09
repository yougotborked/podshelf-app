/**
 * What goes in the log when a promise rejects and nothing was waiting for it.
 *
 * Much of this app starts work it does not wait for - a save after a setting changes, a
 * navigation, a refresh in the background - and marks it `void promise`. That is a decision that
 * nothing downstream needs the result, not a decision that failure is fine, so a rejection has
 * to end up somewhere readable: the `unhandledrejection` listener in plugins/01.capacitor.client.ts
 * writes this line to the in-app log, where a bug report can include it.
 *
 * A rejection can be anything - `Promise.reject('text')` and `Promise.reject(undefined)` are
 * legal - and the listener must never throw while reporting one.
 */
export function describeRejection(reason: unknown): string {
  if (reason instanceof Error) {
    const where = reason.stack?.split('\n').slice(1, 3).map((line) => line.trim()).join(' <- ')
    return where ? `${reason.name}: ${reason.message} (${where})` : `${reason.name}: ${reason.message}`
  }
  if (typeof reason === 'string') return reason || '(empty rejection)'
  if (reason === undefined || reason === null) return '(rejected with no reason)'
  // Capacitor rejects with a plain object ({ message, code }) rather than an Error.
  if (typeof reason === 'object') {
    const message = (reason as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
    try {
      return JSON.stringify(reason)
    } catch {
      return Object.prototype.toString.call(reason)
    }
  }
  return String(reason)
}

/**
 * An async function as an event listener or timer callback.
 *
 * Listeners are called for their side effects and nothing reads what they return, so a promise
 * from an `async` one is simply dropped - and if it rejects, nothing was waiting. The wrapper
 * makes that explicit instead of leaving it to the type system to object, and returns one stable
 * function: removeEventListener needs the very reference addEventListener was given, so wrap
 * once at setup, not at each call.
 *
 * A rejection is not swallowed: the promise is left unhandled on purpose, so it reaches the
 * `unhandledrejection` listener and the in-app log.
 */
export function asVoidHandler<A extends unknown[]>(handler: (...args: A) => Promise<unknown>): (...args: A) => void {
  return (...args: A) => {
    void handler(...args)
  }
}
