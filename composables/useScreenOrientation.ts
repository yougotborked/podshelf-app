/**
 * The Screen Orientation API, or undefined where the webview does not have it.
 *
 * iOS WebKit has no `screen.orientation`, but lib.dom types it as always present. So every guard
 * on it - the right ones - read as dead code to the type checker, and the one place that did not
 * guard it (the fullscreen cover) would throw on an iPhone the first time it opened. Going through
 * this makes "might not exist" part of the type, so a missing guard is a compile error.
 */
export function getScreenOrientation(): (Omit<ScreenOrientation, 'lock' | 'unlock'> & { lock?: (orientation: string) => Promise<void>; unlock?: () => void }) | undefined {
  const screenObject = (globalThis as { screen?: { orientation?: ScreenOrientation } }).screen
  return screenObject?.orientation as ReturnType<typeof getScreenOrientation>
}
