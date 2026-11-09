<template>
  <div ref="wrapper" :style="{ height: height + 'px', width: width + 'px' }" class="relative">
    <div v-if="noValidCovers" class="absolute top-0 left-0 w-full h-full flex items-center justify-center box-shadow-book" :style="{ padding: `${sizeMultiplier}rem` }">
      <p :style="{ fontSize: sizeMultiplier + 'rem' }">{{ name }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  id?: string
  name?: string
  bookItems?: Record<string, unknown>[]
  width?: number
  height?: number
  groupTo?: string
  bookCoverAspectRatio?: number
}>()

const globalsStore = useGlobalsStore()

// State
const noValidCovers = ref(false)
const coverDiv = ref<HTMLElement | null>(null)
const coverWrapperEl = ref<HTMLElement | null>(null)
const coverImageEls = ref<HTMLElement[]>([])
const coverWidth = ref(0)
const offsetIncrement = ref(0)
const isInit = ref(false)

// Refs
const wrapper = ref<HTMLElement | null>(null)

// Computed
const sizeMultiplier = computed(() => {
  if (props.bookCoverAspectRatio === 1) return (props.width || 0) / (120 * 1.6 * 2)
  return (props.width || 0) / 240
})

// Watch
watch(() => props.bookItems, (newVal) => {
  if (newVal) {
    void nextTick(init)
  }
}, { immediate: true })

// Methods
function getCoverUrl(book: Record<string, unknown>): string {
  return globalsStore.getLibraryItemCoverSrc(book, '')
}

async function buildCoverImg(coverData: { id: string; coverUrl: string }, bgCoverWidth: number, offsetLeft: number, zIndex: number, forceCoverBg = false): Promise<HTMLElement> {
  const src = coverData.coverUrl

  const showCoverBgResult =
    forceCoverBg ||
    (await new Promise<boolean>((resolve) => {
      const image = new Image()

      image.onload = () => {
        const { naturalWidth, naturalHeight } = image
        const aspectRatio = naturalHeight / naturalWidth
        const arDiff = Math.abs(aspectRatio - (props.bookCoverAspectRatio || 1.6))

        if (arDiff > 0.15) {
          resolve(true)
        } else {
          resolve(false)
        }
      }
      image.onerror = (err) => {
        console.error(err)
        resolve(false)
      }
      image.src = src
    }))

  const imgdiv = document.createElement('div')
  imgdiv.style.height = (props.height || 0) + 'px'
  imgdiv.style.width = bgCoverWidth + 'px'
  imgdiv.style.left = offsetLeft + 'px'
  imgdiv.style.zIndex = String(zIndex)
  imgdiv.dataset.audiobookId = coverData.id
  imgdiv.className = 'absolute top-0 box-shadow-book transition-transform'
  imgdiv.style.boxShadow = '4px 0px 4px rgb(var(--md-scrim) / 0.4)'

  if (showCoverBgResult) {
    const coverbgwrapper = document.createElement('div')
    coverbgwrapper.className = 'absolute top-0 left-0 w-full h-full overflow-hidden rounded-sm bg-md-surface-3'

    const coverbg = document.createElement('div')
    coverbg.className = 'absolute cover-bg'
    coverbg.style.backgroundImage = `url("${src}")`

    coverbgwrapper.appendChild(coverbg)
    imgdiv.appendChild(coverbgwrapper)
  }

  const img = document.createElement('img')
  img.src = src
  img.className = 'absolute top-0 left-0 w-full h-full'
  img.style.objectFit = showCoverBgResult ? 'contain' : 'cover'

  imgdiv.appendChild(img)
  return imgdiv
}

async function init() {
  if (isInit.value) return
  isInit.value = true

  if (coverDiv.value) {
    coverDiv.value.remove()
    coverDiv.value = null
  }
  let validCovers = (props.bookItems || [])
    .map((bookItem) => ({
      id: bookItem.id as string,
      coverUrl: getCoverUrl(bookItem)
    }))
    .filter((b) => b.coverUrl !== '')

  if (!validCovers.length) {
    noValidCovers.value = true
    return
  }
  noValidCovers.value = false

  validCovers = validCovers.slice(0, 10)

  let cw = props.width || 0
  let widthPer = props.width || 0
  if (validCovers.length > 1) {
    cw = (props.height || 0) / (props.bookCoverAspectRatio || 1.6)
    widthPer = ((props.width || 0) - cw) / (validCovers.length - 1)
  }
  coverWidth.value = cw
  offsetIncrement.value = widthPer

  const outerdiv = document.createElement('div')
  outerdiv.id = `group-cover-${props.id}`
  coverWrapperEl.value = outerdiv
  outerdiv.className = 'w-full h-full relative box-shadow-book'

  const els: HTMLElement[] = []
  let offsetLeft = 0
  for (let i = 0; i < validCovers.length; i++) {
    offsetLeft = widthPer * i
    const zIdx = validCovers.length - i
    const img = await buildCoverImg(validCovers[i], cw, offsetLeft, zIdx, validCovers.length === 1)
    outerdiv.appendChild(img)
    els.push(img)
  }

  coverImageEls.value = els

  if (wrapper.value) {
    coverDiv.value = outerdiv
    wrapper.value.appendChild(outerdiv)
  }
}

onBeforeUnmount(() => {
  if (coverWrapperEl.value) coverWrapperEl.value.remove()
  if (coverImageEls.value && coverImageEls.value.length) {
    coverImageEls.value.forEach((el) => el.remove())
  }
  if (coverDiv.value) coverDiv.value.remove()
})
</script>
