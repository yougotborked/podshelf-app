import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { AbsDownloader, AbsFileSystem } from '@/plugins/capacitor'
import enUsStrings from '~/strings/en-us.json'

const defaultCode = 'en-us'

export const languageCodeMap: Record<string, { label: string; dateFnsLocale: string }> = {
  be: { label: 'Беларуская', dateFnsLocale: 'be' },
  bn: { label: 'বাংলা', dateFnsLocale: 'bn' },
  bg: { label: 'Български', dateFnsLocale: 'bg' },
  ca: { label: 'Català', dateFnsLocale: 'ca' },
  cs: { label: 'Čeština', dateFnsLocale: 'cs' },
  da: { label: 'Dansk', dateFnsLocale: 'da' },
  de: { label: 'Deutsch', dateFnsLocale: 'de' },
  'en-us': { label: 'English', dateFnsLocale: 'enUS' },
  es: { label: 'Español', dateFnsLocale: 'es' },
  fi: { label: 'Suomi', dateFnsLocale: 'fi' },
  fr: { label: 'Français', dateFnsLocale: 'fr' },
  hr: { label: 'Hrvatski', dateFnsLocale: 'hr' },
  it: { label: 'Italiano', dateFnsLocale: 'it' },
  lt: { label: 'Lietuvių', dateFnsLocale: 'lt' },
  hu: { label: 'Magyar', dateFnsLocale: 'hu' },
  nl: { label: 'Nederlands', dateFnsLocale: 'nl' },
  no: { label: 'Norsk', dateFnsLocale: 'no' },
  pl: { label: 'Polski', dateFnsLocale: 'pl' },
  'pt-br': { label: 'Português (Brasil)', dateFnsLocale: 'ptBR' },
  ru: { label: 'Русский', dateFnsLocale: 'ru' },
  sl: { label: 'Slovenščina', dateFnsLocale: 'sl' },
  sv: { label: 'Svenska', dateFnsLocale: 'sv' },
  tr: { label: 'Türkçe', dateFnsLocale: 'tr' },
  uk: { label: 'Українська', dateFnsLocale: 'uk' },
  'vi-vn': { label: 'Tiếng Việt', dateFnsLocale: 'vi' },
  'zh-cn': { label: '简体中文 (Simplified Chinese)', dateFnsLocale: 'zhCN' }
}

export const languageCodeOptions = Object.keys(languageCodeMap).map((code) => ({
  text: languageCodeMap[code].label,
  value: code
}))

export const languageCodes = {
  default: defaultCode,
  current: defaultCode,
  local: null as string | null,
  server: null as string | null
}

type StringsMap = Record<string, string>

const _strings = ref<StringsMap>({ ...enUsStrings as StringsMap })
const _translations: Record<string, StringsMap> = { [defaultCode]: enUsStrings as StringsMap }

function supplant(str: string, subs: Record<string, string | number>): string {
  return str.replace(/{([^{}]*)}/g, (a, b) => {
    const r = subs[b]
    return typeof r === 'string' || typeof r === 'number' ? String(r) : a
  })
}

export function useStrings() {
  return _strings.value
}

export function getString(key: string, subs?: (string | number)[]): string {
  const str = _strings.value[key]
  if (!str) return ''
  if (subs && Array.isArray(subs) && subs.length) {
    return supplant(str, Object.fromEntries(subs.map((v, i) => [String(i), v])))
  }
  return str
}

export function formatNumber(num: number): string {
  return Intl.NumberFormat(languageCodes.current).format(num)
}

async function loadTranslationStrings(code: string): Promise<StringsMap | null> {
  try {
    const fileContents = await import(`~/strings/${code}.json`)
    return fileContents.default as StringsMap
  } catch (error) {
    console.error('Failed to load i18n strings', code, error)
    return null
  }
}

export async function setLanguageCode(code: string): Promise<boolean> {
  if (!code) return false
  if (languageCodes.current === code) return false

  const strings = _translations[code] || await loadTranslationStrings(code)
  if (!strings) {
    console.warn(`Invalid lang code ${code}`)
    return false
  }

  _translations[code] = strings
  languageCodes.current = code
  const localStore = useLocalStore()
  await localStore.setLanguage(code)

  const defaultStrings = _translations[defaultCode]
  for (const key in _strings.value) {
    _strings.value[key] = strings[key] || defaultStrings[key]
  }

  const { setDateFnsLocale } = useUtils()
  setDateFnsLocale(languageCodeMap[code]?.dateFnsLocale || 'enUS')

  syncNativeStrings()
  useEventBus().emit('change-lang', code)
  return true
}

/**
 * Pushes translated strings into the native layer.
 *
 * The download notification and the folder picker are built in Kotlin, outside the webview, so
 * they cannot read the string table directly - the current translations are handed over instead,
 * and refreshed whenever the language changes.
 */
function syncNativeStrings(): void {
  if (Capacitor.getPlatform() !== 'android') return

  AbsDownloader.setDownloadNotificationStrings({
    preparing: _strings.value.MessagePreparingDownloads,
    downloadingFile: _strings.value.MessageDownloadingFile,
    waitingForStorage: _strings.value.MessageWaitingForAvailableStorage,
    downloads: _strings.value.HeaderDownloads,
    cancel: _strings.value.ButtonCancel
  }).catch((error: unknown) => console.warn('Failed to update download notification strings', error))

  AbsFileSystem.setFolderPickerStrings({
    writeAccessRequired: _strings.value.MessageStorageWriteAccessRequired,
    allow: _strings.value.ButtonAllow,
    cancel: _strings.value.ButtonCancel,
    accessDenied: _strings.value.MessageStorageAccessDenied,
    permissionDenied: _strings.value.MessageStoragePermissionDenied
  }).catch((error: unknown) => console.warn('Failed to update folder picker strings', error))
}

export function setServerLanguageCode(code: string): void {
  if (!code) return
  if (!languageCodeMap[code]) {
    console.warn('invalid server language in', code)
    return
  }
  languageCodes.server = code
  if (!languageCodes.local && code !== defaultCode) {
    void setLanguageCode(code)
  }
}

export async function initializeI18n(): Promise<void> {
  try {
    const localStore = useLocalStore()
    const localLanguage = await localStore.getLanguage()
    if (!localLanguage) return
    if (!languageCodeMap[localLanguage]) {
      console.warn('Invalid local language code', localLanguage)
      await localStore.setLanguage(defaultCode)
      return
    }
    languageCodes.local = localLanguage
    await setLanguageCode(localLanguage)
  } finally {
    // Runs even when the language was left at the default, which does not go through
    // setLanguageCode - the native side still needs the English strings
    syncNativeStrings()
  }
}
