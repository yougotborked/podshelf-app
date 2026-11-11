<template>
  <div v-if="show" :data-theme="ereaderTheme" class="group fixed top-0 left-0 right-0 layout-wrapper w-full z-40 pt-8 data-[theme=black]:bg-black data-[theme=black]:text-white data-[theme=dark]:bg-[#232323] data-[theme=dark]:text-white data-[theme=light]:bg-white data-[theme=light]:text-black" :class="{ 'reader-player-open': isPlayerOpen }">
    <!-- toolbar -->
    <div class="w-full px-2 fixed top-0 left-0 z-30 transition-transform bg-md-surface-1 text-md-on-surface" :class="`${showingToolbar ? 'translate-y-0' : '-translate-y-36'} ${isIos ? 'pt-14 h-36' : 'pt-10 h-32'}`" :style="{ boxShadow: showingToolbar ? '0px 8px 8px #11111155' : '' }" @touchstart.stop @mousedown.stop @touchend.stop @mouseup.stop>
      <div class="flex items-center mb-2">
        <button type="button" class="inline-flex mx-2" @click.stop="show = false">
          <span class="material-symbols text-3xl text-md-on-surface">chevron_left</span>
        </button>
        <div class="flex-grow" />
        <button v-if="isComic || isEpub" type="button" class="inline-flex mx-2" @click.stop="clickTOCBtn">
          <span class="material-symbols text-2xl text-md-on-surface">format_list_bulleted</span>
        </button>
        <button v-if="isEpub" type="button" class="inline-flex mx-2" @click.stop="clickSettingsBtn">
          <span class="material-symbols text-2xl text-md-on-surface">settings</span>
        </button>
        <button v-if="comicHasMetadata" type="button" class="inline-flex mx-2" @click.stop="clickMetadataBtn">
          <span class="material-symbols text-2xl text-md-on-surface">more</span>
        </button>
      </div>

      <p class="text-center truncate">{{ title }}</p>
    </div>

    <!-- ereader -->
    <component v-if="readerComponentName" ref="readerComponent" :is="readerComponentName" :url="ebookUrl" :library-item="selectedLibraryItem" :is-local="isLocal" :keep-progress="keepProgress" :showing-toolbar="showingToolbar" @touchstart="touchstart" @touchend="touchend" @loaded="readerLoaded" @hook:mounted="readerMounted" />

    <!-- table of contents modal -->
    <modals-fullscreen-modal v-model="showTOCModal" :theme="ereaderTheme">
      <div class="flex items-end justify-between h-20 px-4 pb-2">
        <h1 class="text-lg">{{ $strings.HeaderTableOfContents }}</h1>
        <button class="flex" @click.stop="showTOCModal = false">
          <span class="material-symbols">close</span>
        </button>
      </div>

      <!-- chapters list -->
      <div class="w-full overflow-y-auto overflow-x-hidden h-full max-h-[calc(100vh-85px)]">
        <div class="w-full h-full px-4">
          <ul>
            <li v-for="chapter in chapters" :key="chapter.id" class="py-1">
              <a :href="chapter.href" class="opacity-80 hover:opacity-100" @click.prevent="goToChapter(chapter.href)">{{ chapter.label }}</a>
              <ul v-if="chapter.subitems?.length">
                <li v-for="subchapter in chapter.subitems" :key="subchapter.id" class="py-1 pl-4">
                  <a :href="subchapter.href" class="opacity-80 hover:opacity-100" @click.prevent="goToChapter(subchapter.href)">{{ subchapter.label }}</a>
                </li>
              </ul>
            </li>
          </ul>
          <div v-if="!chapters.length" class="flex h-full items-center justify-center">
            <p class="text-xl">{{ $strings.MessageNoChapters }}</p>
          </div>
        </div>
      </div>
    </modals-fullscreen-modal>

    <!-- ereader settings modal -->
    <modals-fullscreen-modal v-model="showSettingsModal" :theme="ereaderTheme" threeQuartersScreen>
      <div style="box-shadow: 0px -8px 8px #11111155">
        <div class="flex items-end justify-between h-14 px-4 pb-2 mb-6">
          <h1 class="text-lg">{{ $strings.HeaderEreaderSettings }}</h1>
          <button class="flex" @click="showSettingsModal = false">
            <span class="material-symbols">close</span>
          </button>
        </div>
        <div class="w-full overflow-y-auto overflow-x-hidden h-[calc(75vh-85px)] min-h-[320px] short:min-h-0 short:h-[calc(100vh-85px)]">
          <div class="w-full h-full px-4">
            <div class="flex items-center mb-6">
              <div class="w-32">
                <p class="text-sm">{{ $strings.LabelTheme }}</p>
              </div>
              <ui-toggle-btns v-model="ereaderSettings.theme" name="theme" :items="themeItems" @update:modelValue="settingsUpdated" />
            </div>
            <div class="flex items-center mb-6">
              <div class="w-32">
                <p class="text-sm">{{ $strings.LabelFontFamily }}</p>
              </div>
              <ui-toggle-btns v-model="ereaderSettings.font" name="font" :items="fontItems" @update:modelValue="settingsUpdated" />
            </div>
            <div class="flex items-center mb-6">
              <div class="w-32">
                <p class="text-sm">{{ $strings.LabelFontScale }}</p>
              </div>
              <ui-range-input v-model="ereaderSettings.fontScale" :min="5" :max="300" :step="5" input-width="180px" @update:modelValue="settingsUpdated" />
            </div>
            <div class="flex items-center mb-6">
              <div class="w-32">
                <p class="text-sm">{{ $strings.LabelLineSpacing }}</p>
              </div>
              <ui-range-input v-model="ereaderSettings.lineSpacing" :min="100" :max="300" :step="5" input-width="180px" @update:modelValue="settingsUpdated" />
            </div>
            <div class="flex items-center mb-6">
              <div class="w-32">
                <p class="text-sm">{{ $strings.LabelFontBoldness }}</p>
              </div>
              <ui-range-input v-model="ereaderSettings.textStroke" :min="0" :max="300" :step="5" input-width="180px" @update:modelValue="settingsUpdated" />
            </div>
            <div class="flex items-center mb-6">
              <div class="w-32">
                <p class="text-sm">{{ $strings.LabelLayout }}</p>
              </div>
              <ui-toggle-btns v-model="ereaderSettings.spread" name="spread" :items="spreadItems" @update:modelValue="settingsUpdated" />
            </div>
            <div class="flex items-center mb-6">
              <div class="w-32">
                <p class="text-sm">{{ $strings.LabelNavigateWithVolume }}</p>
              </div>
              <ui-toggle-btns v-model="ereaderSettings.navigateWithVolume" name="navigate-volume" :items="navigateWithVolumeItems" @update:modelValue="settingsUpdated" />
            </div>
            <div class="flex items-center mb-6">
              <div class="w-32">
                <p class="text-sm">{{ $strings.LabelNavigateWithVolumeWhilePlaying }}</p>
              </div>
              <ui-toggle-btns v-model="ereaderSettings.navigateWithVolumeWhilePlaying" name="navigate-volume-playing" :items="onOffToggleButtonItems" @update:modelValue="settingsUpdated" />
            </div>
            <div class="flex items-center mb-6">
              <div class="w-32">
                <p class="text-sm">{{ $strings.LabelKeepScreenAwake }}</p>
              </div>
              <ui-toggle-btns v-model="ereaderSettings.keepScreenAwake" name="keep-awake" :items="onOffToggleButtonItems" @update:modelValue="settingsUpdated" />
            </div>
          </div>
        </div>
      </div>
    </modals-fullscreen-modal>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { Capacitor } from '@capacitor/core'
import { VolumeButtons } from '@capacitor-community/volume-buttons'
import { KeepAwake } from '@capacitor-community/keep-awake'

// The slice of a library item the reader looks at.
interface ReaderEbookFile {
  ino?: string
  ebookFormat?: string
  isLocal?: boolean
  localFileId?: string
  contentUrl?: string
  metadata: { ext: string }
}
interface ReaderLibraryItem {
  id: string
  media?: { metadata?: { title?: string }; ebookFile?: ReaderEbookFile | null }
  libraryFiles: ReaderEbookFile[]
}
interface ReaderChapter {
  id?: string
  href: string
  label: string
  subitems?: ReaderChapter[]
}
type EbookType = 'mobi' | 'epub' | 'pdf' | 'comic'
// What each reader component (epub, pdf, comic, mobi) exposes; they differ, so all optional.
interface ReaderComponentApi {
  updateSettings?: (settings: Record<string, unknown>) => void
  goToChapter?: (href: string) => void
  clickShowInfoMenu?: () => void
  clickShowPageMenu?: () => void
  chapters?: ReaderChapter[]
  next?: () => void
  prev?: () => void
}

export default defineComponent({
  setup() {
    const appStore = useAppStore()
    const eventBus = useEventBus()
    const platform = usePlatform()
    const { showHideStatusBar } = useUtils()
    return { appStore, eventBus, platform, showHideStatusBar }
  },
  data() {
    return {
      touchstartX: 0,
      touchstartY: 0,
      touchendX: 0,
      touchendY: 0,
      touchstartTime: 0,
      touchIdentifier: null as number | null,
      showingToolbar: false,
      showTOCModal: false,
      showSettingsModal: false,
      comicHasMetadata: false,
      chapters: [] as ReaderChapter[],
      isInittingWatchVolume: false,
      ereaderSettings: {
        theme: 'dark',
        font: 'serif',
        fontScale: 100,
        lineSpacing: 115,
        spread: 'auto',
        textStroke: 0,
        navigateWithVolume: 'enabled',
        navigateWithVolumeWhilePlaying: false,
        keepScreenAwake: false
      }
    }
  },
  watch: {
    show: {
      handler(newVal: boolean) {
        if (newVal) {
          this.comicHasMetadata = false
          this.registerListeners()
          this.hideToolbar()
        } else {
          this.unregisterListeners()
          void this.showHideStatusBar(true)
        }
      }
    },
    isPlayerOpen(newVal: boolean, oldVal: boolean) {
      // Closed player
      if (!newVal && oldVal) {
        void this.initWatchVolume()
      }
    }
  },
  computed: {
    show: {
      get(): boolean {
        return this.appStore.showReader
      },
      set(val: boolean) {
        this.appStore.showReader = val
      }
    },
    isIos() {
      return this.platform === 'ios'
    },
    title() {
      return this.mediaMetadata.title || 'No Title'
    },
    selectedLibraryItem(): ReaderLibraryItem | null {
      return this.appStore.selectedLibraryItem as ReaderLibraryItem | null
    },
    media(): ReaderLibraryItem['media'] | null {
      return this.selectedLibraryItem?.media || null
    },
    mediaMetadata(): { title?: string } {
      return this.media?.metadata || {}
    },
    ereaderTheme() {
      if (this.isEpub) return this.ereaderSettings.theme
      return document.documentElement.dataset.theme || 'dark'
    },
    spreadItems() {
      return [
        {
          text: this.$strings.LabelLayoutSinglePage,
          value: 'none'
        },
        {
          text: this.$strings.LabelLayoutAuto,
          value: 'auto'
        }
      ]
    },
    navigateWithVolumeItems() {
      return [
        {
          text: this.$strings.LabelOn,
          value: 'enabled'
        },
        {
          text: this.$strings.LabelNavigateWithVolumeMirrored,
          value: 'mirrored'
        },
        {
          text: this.$strings.LabelOff,
          value: 'none'
        }
      ]
    },
    onOffToggleButtonItems() {
      return [
        {
          text: this.$strings.LabelOn,
          value: true
        },
        {
          text: this.$strings.LabelOff,
          value: false
        }
      ]
    },
    themeItems() {
      return [
        {
          text: this.$strings.LabelThemeBlack,
          value: 'black'
        },
        {
          text: this.$strings.LabelThemeDark,
          value: 'dark'
        },
        {
          text: this.$strings.LabelThemeLight,
          value: 'light'
        }
      ]
    },
    fontItems() {
      return [
        {
          text: this.$strings.LabelFontFamilySans,
          value: 'sans-serif'
        },
        {
          text: this.$strings.LabelFontFamilySerif,
          value: 'serif'
        }
      ]
    },
    readerComponentName() {
      if (this.ebookType === 'epub') return 'readers-epub-reader'
      else if (this.ebookType === 'mobi') return 'readers-mobi-reader'
      else if (this.ebookType === 'comic') return 'readers-comic-reader'
      else if (this.ebookType === 'pdf') return 'readers-pdf-reader'
      return null
    },
    ebookFile(): ReaderEbookFile | null | undefined {
      if (!this.media || !this.selectedLibraryItem) return null
      // ebook file id is passed when reading a supplementary ebook
      if (this.ebookFileId) {
        return this.selectedLibraryItem.libraryFiles.find((lf) => lf.ino === this.ebookFileId)
      }
      return this.media.ebookFile
    },
    ebookFormat() {
      if (!this.ebookFile) return null
      // Use file extension for supplementary ebook
      if (!this.ebookFile.ebookFormat) {
        return this.ebookFile.metadata.ext.toLowerCase().slice(1)
      }
      return this.ebookFile.ebookFormat
    },
    ebookType(): EbookType | null {
      if (this.isMobi) return 'mobi'
      else if (this.isEpub) return 'epub'
      else if (this.isPdf) return 'pdf'
      else if (this.isComic) return 'comic'
      return null
    },
    isEpub() {
      return this.ebookFormat == 'epub'
    },
    isMobi() {
      return this.ebookFormat == 'mobi' || this.ebookFormat == 'azw3'
    },
    isPdf() {
      return this.ebookFormat == 'pdf'
    },
    isComic() {
      return this.ebookFormat == 'cbz' || this.ebookFormat == 'cbr'
    },
    isLocal() {
      return !!this.ebookFile?.isLocal || !!this.ebookFile?.localFileId
    },
    localContentUrl() {
      return this.ebookFile?.contentUrl
    },
    ebookUrl() {
      if (!this.ebookFile || !this.selectedLibraryItem) return null
      if (this.localContentUrl) {
        return Capacitor.convertFileSrc(this.localContentUrl)
      }

      if (this.ebookFileId) {
        return `/api/items/${this.selectedLibraryItem.id}/ebook/${this.ebookFileId}`
      }
      return `/api/items/${this.selectedLibraryItem.id}/ebook`
    },
    isPlayerOpen() {
      return this.appStore.getIsPlayerOpen
    },
    keepProgress() {
      return this.appStore.ereaderKeepProgress
    },
    ebookFileId() {
      return this.appStore.ereaderFileId
    }
  },
  methods: {
    settingsUpdated() {
      this.readerApi()?.updateSettings?.(this.ereaderSettings)
      localStorage.setItem('ereaderSettings', JSON.stringify(this.ereaderSettings))

      void this.initWatchVolume()
      void this.initKeepScreenAwake()
    },
    // The mounted reader component, whichever of the four it is.
    readerApi(): ReaderComponentApi | undefined {
      return this.$refs.readerComponent as ReaderComponentApi | undefined
    },
    goToChapter(href: string) {
      this.showTOCModal = false
      this.readerApi()?.goToChapter?.(href)
    },
    readerMounted() {
      if (this.isEpub) {
        this.loadEreaderSettings()
      }
    },
    readerLoaded(data: { hasMetadata: boolean }) {
      if (this.isComic) {
        this.comicHasMetadata = data.hasMetadata
      }
    },
    clickMetadataBtn() {
      this.readerApi()?.clickShowInfoMenu?.()
    },
    clickTOCBtn() {
      this.hideToolbar()
      if (this.isComic) {
        this.readerApi()?.clickShowPageMenu?.()
      } else {
        this.chapters = this.readerApi()?.chapters || []
        this.showTOCModal = true
      }
    },
    clickSettingsBtn() {
      this.hideToolbar()
      this.showSettingsModal = true
    },
    next() {
      this.readerApi()?.next?.()
    },
    prev() {
      this.readerApi()?.prev?.()
    },
    handleGesture() {
      // Touch must be less than 1s. Must be > 60px drag and X distance > Y distance
      const touchTimeMs = Date.now() - this.touchstartTime
      if (touchTimeMs >= 1000) {
        return
      }

      const touchDistanceX = Math.abs(this.touchendX - this.touchstartX)
      const touchDistanceY = Math.abs(this.touchendY - this.touchstartY)
      const touchDistance = Math.sqrt(Math.pow(this.touchstartX - this.touchendX, 2) + Math.pow(this.touchstartY - this.touchendY, 2))
      if (touchDistance < 30) {
        if (this.showSettingsModal) {
          this.showSettingsModal = false
        } else {
          this.toggleToolbar()
        }
        return
      }

      if (touchDistanceX < 60 || touchDistanceY > touchDistanceX) {
        return
      }
      this.hideToolbar()
      if (!this.isEpub) {
        if (this.touchendX < this.touchstartX) {
          this.next()
        }
        if (this.touchendX > this.touchstartX) {
          this.prev()
        }
      }
    },
    showToolbar() {
      this.showingToolbar = true
      void this.showHideStatusBar(true)
    },
    hideToolbar() {
      this.showingToolbar = false
      void this.showHideStatusBar(false)
    },
    toggleToolbar() {
      if (this.showingToolbar) this.hideToolbar()
      else this.showToolbar()
    },
    touchstart(e: TouchEvent) {
      // Ignore rapid touch
      if (this.touchstartTime && Date.now() - this.touchstartTime < 250) {
        return
      }

      const touch = e.touches[0]
      if (!touch) return
      this.touchstartX = touch.screenX
      this.touchstartY = touch.screenY
      this.touchstartTime = Date.now()
      this.touchIdentifier = touch.identifier
    },
    touchend(e: TouchEvent) {
      const touch = e.changedTouches[0]
      if (!touch || this.touchIdentifier !== touch.identifier) {
        return
      }

      this.touchendX = touch.screenX
      this.touchendY = touch.screenY
      this.handleGesture()
    },
    closeEvt() {
      this.show = false
    },
    loadEreaderSettings() {
      try {
        const settings = localStorage.getItem('ereaderSettings')
        if (settings) {
          const saved = JSON.parse(settings) as Record<string, unknown>
          const current = this.ereaderSettings as Record<string, unknown>
          for (const key in current) {
            if (saved[key] !== undefined) {
              current[key] = saved[key]
            }
          }
          this.settingsUpdated()
        }
      } catch (error) {
        console.error('Failed to load ereader settings', error)
      }
    },
    async initWatchVolume() {
      if (this.isInittingWatchVolume || !this.isEpub) return
      this.isInittingWatchVolume = true
      const isWatching = await VolumeButtons.isWatching()

      if (this.ereaderSettings.navigateWithVolume !== 'none' && (this.ereaderSettings.navigateWithVolumeWhilePlaying || !this.isPlayerOpen)) {
        if (!isWatching.value) {
          const options = {
            disableSystemVolumeHandler: true,
            suppressVolumeIndicator: true
          }
          await VolumeButtons.watchVolume(options, this.volumePressed)
        }
      } else if (isWatching.value) {
        await VolumeButtons.clearWatch().catch((error) => {
          console.error('Failed to clear volume watch', error)
        })
      }

      this.isInittingWatchVolume = false
    },
    async initKeepScreenAwake() {
      try {
        if (this.ereaderSettings.keepScreenAwake) {
          await KeepAwake.keepAwake()
          console.log('Reader keep screen awake enabled')
        } else {
          await KeepAwake.allowSleep()
          console.log('Reader keep screen awake disabled')
        }
      } catch (error) {
        console.error('Failed to init keep screen awake', error)
      }
    },
    registerListeners() {
      this.eventBus.on('close-ebook', this.closeEvt)
      document.body.addEventListener('touchstart', this.touchstart)
      document.body.addEventListener('touchend', this.touchend)
      void this.initWatchVolume()
      void this.initKeepScreenAwake()
    },
    unregisterListeners() {
      this.eventBus.off('close-ebook', this.closeEvt)
      document.body.removeEventListener('touchstart', this.touchstart)
      document.body.removeEventListener('touchend', this.touchend)
      VolumeButtons.clearWatch().catch((error) => {
        console.error('Failed to clear volume watch', error)
      })
      KeepAwake.allowSleep().catch((error) => {
        console.error('Failed to allow sleep', error)
      })
    },
    volumePressed(e: { direction: string }) {
      if (this.ereaderSettings.navigateWithVolume == 'enabled') {
        if (e.direction == 'up') {
          this.prev()
        } else {
          this.next()
        }
      } else if (this.ereaderSettings.navigateWithVolume == 'mirrored') {
        if (e.direction == 'down') {
          this.prev()
        } else {
          this.next()
        }
      }
    }
  },
  beforeUnmount() {
    this.unregisterListeners()
  }
})
</script>
