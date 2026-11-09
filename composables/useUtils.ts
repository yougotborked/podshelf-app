import { formatDistance, format, addDays, isDate, setDefaultOptions } from 'date-fns'
import * as locales from 'date-fns/locale'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { AbsFileSystem } from '~/plugins/capacitor'

// @capacitor/status-bar is not in the Android build - see AbsSystemBars.kt - so on Android the
// status bar is shown and hidden through the app's own plugin, and on iOS through that one.
const AbsSystemBars = registerPlugin<{ setStatusBarVisible(options: { visible: boolean }): Promise<void> }>('AbsSystemBars')

export function useUtils() {
  const showHideStatusBar = async (show: boolean): Promise<void> => {
    if (Capacitor.getPlatform() === 'web') return
    if (Capacitor.getPlatform() === 'android') {
      await AbsSystemBars.setStatusBarVisible({ visible: show })
      return
    }
    if (show) {
      await StatusBar.show()
    } else {
      await StatusBar.hide()
    }
  }

  const isDev = process.env.NODE_ENV !== 'production'

  const getAndroidSDKVersion = async (): Promise<number | null> => {
    if (Capacitor.getPlatform() !== 'android') return null
    const data = await AbsFileSystem.getSDKVersion()
    if (isNaN(data?.version)) return null
    return Number(data.version)
  }

  const encodeUriPath = (path: string): string =>
    path.replace(/\\/g, '/').replace(/%/g, '%25').replace(/#/g, '%23')

  const setDateFnsLocale = (localeString: string): void => {
    const loc = (locales as Record<string, unknown>)[localeString]
    if (!loc) return
    setDefaultOptions({ locale: loc as Parameters<typeof setDefaultOptions>[0]['locale'] })
  }

  const dateDistanceFromNow = (unixms: number | null): string => {
    if (!unixms) return ''
    return formatDistance(unixms, Date.now(), { addSuffix: true })
  }

  const formatDate = (unixms: number | null, fnsFormat = 'MM/dd/yyyy HH:mm'): string => {
    if (!unixms) return ''
    return format(unixms, fnsFormat)
  }

  const formatJsDate = (jsdate: Date | null, fnsFormat = 'MM/dd/yyyy HH:mm'): string => {
    if (!jsdate || !isDate(jsdate)) return ''
    return format(jsdate, fnsFormat)
  }

  const addDaysToToday = (daysToAdd: number): Date | null => {
    const date = addDays(new Date(), daysToAdd)
    if (!date || !isDate(date)) return null
    return date
  }

  const addDaysToDate = (jsdate: Date, daysToAdd: number): Date | null => {
    const date = addDays(jsdate, daysToAdd)
    if (!date || !isDate(date)) return null
    return date
  }

  const bytesPretty = (bytes: number, decimals = 2): string => {
    if (isNaN(bytes) || bytes === null) return 'Invalid Bytes'
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  const elapsedPretty = (seconds: number, useFullNames = false): string => {
    if (!(seconds > 0)) seconds = 0
    if (seconds < 60) {
      return `${Math.floor(seconds)} sec${useFullNames ? 'onds' : ''}`
    }
    let minutes = Math.floor(seconds / 60)
    if (minutes < 70) {
      return `${minutes} min${useFullNames ? `ute${minutes === 1 ? '' : 's'}` : ''}`
    }
    let hours = Math.floor(minutes / 60)
    minutes -= hours * 60
    if (!minutes) {
      return `${hours} ${useFullNames ? 'hours' : 'hr'}`
    }
    return `${hours} ${useFullNames ? `hour${hours === 1 ? '' : 's'}` : 'hr'} ${minutes} ${useFullNames ? `minute${minutes === 1 ? '' : 's'}` : 'min'}`
  }

  const elapsedPrettyExtended = (seconds: number, useDays = true, showSeconds = true): string => {
    if (isNaN(seconds) || seconds === null) return ''
    seconds = Math.round(seconds)
    let minutes = Math.floor(seconds / 60)
    seconds -= minutes * 60
    let hours = Math.floor(minutes / 60)
    minutes -= hours * 60
    let days = 0
    if (useDays || Math.floor(hours / 24) >= 100) {
      days = Math.floor(hours / 24)
      hours -= days * 24
    }
    if (minutes && seconds && !showSeconds) {
      if (seconds >= 30) minutes++
    }
    const strs: string[] = []
    if (days) strs.push(`${days}d`)
    if (hours) strs.push(`${hours}h`)
    if (minutes) strs.push(`${minutes}m`)
    if (seconds && showSeconds) strs.push(`${seconds}s`)
    return strs.join(' ')
  }

  const secondsToTimestamp = (seconds: number): string => {
    // A negative or NaN duration is meaningless, and the arithmetic below turns it into a
    // nonsense timestamp rather than something obviously wrong: -0.001 comes out as "-1:59:59",
    // which is what the player showed for elapsed time when its position briefly went negative.
    if (!(seconds > 0)) seconds = 0
    let _seconds = seconds
    let _minutes = Math.floor(seconds / 60)
    _seconds -= _minutes * 60
    const _hours = Math.floor(_minutes / 60)
    _minutes -= _hours * 60
    _seconds = Math.floor(_seconds)
    if (!_hours) {
      return `${_minutes}:${_seconds.toString().padStart(2, '0')}`
    }
    return `${_hours}:${_minutes.toString().padStart(2, '0')}:${_seconds.toString().padStart(2, '0')}`
  }

  const secondsToTimestampFull = (seconds: number): string => {
    if (!(seconds > 0)) seconds = 0
    let _seconds = Math.round(seconds)
    let _minutes = Math.floor(seconds / 60)
    _seconds -= _minutes * 60
    const _hours = Math.floor(_minutes / 60)
    _minutes -= _hours * 60
    _seconds = Math.floor(_seconds)
    return `${_hours.toString().padStart(2, '0')}:${_minutes.toString().padStart(2, '0')}:${_seconds.toString().padStart(2, '0')}`
  }

  const sanitizeFilename = (input: string, colonReplacement = ' - '): string | false => {
    if (typeof input !== 'string') return false
    const MAX_FILENAME_LEN = 240
    const illegalRe = /[\/\?<>\\:\*\|"]/g
    const controlRe = /[\x00-\x1f\x80-\x9f]/g
    const reservedRe = /^\.+$/
    const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i
    const windowsTrailingRe = /[\. ]+$/
    const lineBreaks = /[\n\r]/g
    let sanitized = input
      .replace(':', colonReplacement)
      .replace(illegalRe, '')
      .replace(controlRe, '')
      .replace(reservedRe, '')
      .replace(lineBreaks, '')
      .replace(windowsReservedRe, '')
      .replace(windowsTrailingRe, '')
    if (sanitized.length > MAX_FILENAME_LEN) {
      const lenToRemove = sanitized.length - MAX_FILENAME_LEN
      const lastDot = sanitized.lastIndexOf('.')
      const ext = lastDot >= 0 ? sanitized.slice(lastDot) : ''
      let basename = lastDot >= 0 ? sanitized.slice(0, lastDot) : sanitized
      basename = basename.slice(0, basename.length - lenToRemove)
      sanitized = basename + ext
    }
    return sanitized
  }

  const xmlToJson = (xml: string): Record<string, unknown> => {
    const json: Record<string, unknown> = {}
    for (const res of xml.matchAll(/(?:<(\w*)(?:\s[^>]*)*>)((?:(?!<\1).)*)(?:<\/\1>)|<(\w*)(?:\s*)*\/>/gm)) {
      const key = res[1] || res[3]
      const value = res[2] && xmlToJson(res[2])
      json[key] = (value && Object.keys(value).length ? value : res[2]) || null
    }
    return json
  }

  const encode = (text: string): string => {
    const bytes = new TextEncoder().encode(text)
    return encodeURIComponent(btoa(String.fromCharCode(...bytes)))
  }
  const decode = (text: string): string => {
    const binary = atob(decodeURIComponent(text))
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  const setOrientationLock = (orientationLockSetting: string | undefined): void => {
    if (!window.screen?.orientation) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orientation = window.screen.orientation as any
    if (orientationLockSetting === 'PORTRAIT') {
      orientation.lock?.('portrait')?.catch(console.error)
    } else if (orientationLockSetting === 'LANDSCAPE') {
      orientation.lock?.('landscape')?.catch(console.error)
    } else {
      orientation.unlock?.()
    }
  }

  const copyToClipboard = (str: string): Promise<void> => Clipboard.write({ string: str })

  const sanitizeSlug = (str: string): string => {
    if (!str) return ''
    str = str.replace(/^\s+|\s+$/g, '').toLowerCase()
    const from = 'àáäâèéëêìíïîòóöôùúüûñçěščřžýúůďťň·/,:;'
    const to   = 'aaaaeeeeiiiioooouuuuncescrzyuudtn-----'
    for (let i = 0; i < from.length; i++) {
      str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i))
    }
    return str
      .replace('.', '-')
      .replace(/[^a-z0-9 -_]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/\//g, '')
  }

  const isValidVersion = (currentVersion: string, minVersion: string): boolean => {
    if (!currentVersion || !minVersion) return false
    const currentParts = currentVersion.split('.').map(Number)
    const minParts = minVersion.split('.').map(Number)
    for (let i = 0; i < minParts.length; i++) {
      if (currentParts[i] > minParts[i]) return true
      if (currentParts[i] < minParts[i]) return false
    }
    return true
  }

  return {
    showHideStatusBar,
    isDev,
    getAndroidSDKVersion,
    encodeUriPath,
    setDateFnsLocale,
    dateDistanceFromNow,
    formatDate,
    formatJsDate,
    addDaysToToday,
    addDaysToDate,
    bytesPretty,
    elapsedPretty,
    elapsedPrettyExtended,
    secondsToTimestamp,
    secondsToTimestampFull,
    sanitizeFilename,
    xmlToJson,
    encode,
    decode,
    setOrientationLock,
    copyToClipboard,
    sanitizeSlug,
    isValidVersion
  }
}
