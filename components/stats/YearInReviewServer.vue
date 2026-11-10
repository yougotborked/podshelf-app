<template>
  <div>
    <div v-if="processing" class="max-w-[800px] h-80 md:h-[800px] mx-auto flex items-center justify-center">
      <widgets-loading-spinner />
    </div>
    <img v-else-if="dataUrl" :src="dataUrl" class="mx-auto" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { isShareCancellation, shareImage } from '~/composables/useShareImage'

const props = withDefaults(defineProps<{
  variant?: number
  processing: boolean
  year: number
}>(), {
  variant: 0
})

const emit = defineEmits<{
  'update:processing': [value: boolean]
}>()

const globalsStore = useGlobalsStore()
const nativeHttp = useNativeHttp()
const toast = useToast()
const utils = useUtils()

const canvas = ref<HTMLCanvasElement | null>(null)
const dataUrl = ref<string | null>(null)
const yearStats = ref<Record<string, unknown> | null>(null)

watch(() => props.variant, () => {
  init()
})

async function initCanvas() {
  if (!yearStats.value) return

  const c = document.createElement('canvas')
  c.width = 800
  c.height = 800
  const ctx = c.getContext('2d')!

  const createRoundedRect = (x: number, y: number, w: number, h: number) => {
    const grd1 = ctx.createLinearGradient(x, y, x + w, y + h)
    grd1.addColorStop(0, '#44444455')
    grd1.addColorStop(1, '#ffffff11')
    ctx.fillStyle = grd1
    ctx.strokeStyle = '#C0C0C088'
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, [20])
    ctx.fill()
    ctx.stroke()
  }

  const addText = (text: unknown, fontSize: string, fontWeight: string, color: string, letterSpacing: string, x: number, y: number, maxWidth = 0) => {
    let t = String(text)
    ctx.fillStyle = color
    ctx.font = `${fontWeight} ${fontSize} Source Sans Pro`
    ;(ctx as unknown as Record<string, unknown>).letterSpacing = letterSpacing

    if (maxWidth) {
      let txtWidth = ctx.measureText(t).width
      while (txtWidth > maxWidth) {
        console.warn(`Text "${t}" is greater than max width ${maxWidth} (width:${txtWidth})`)
        if (t.endsWith('...')) t = t.slice(0, -4)
        else t = t.slice(0, -3)
        t += '...'
        txtWidth = ctx.measureText(t).width
        console.log(`Checking text "${t}" (width:${txtWidth})`)
      }
    }

    ctx.fillText(t, x, y)
  }

  // Bg color
  ctx.fillStyle = '#232323'
  ctx.fillRect(0, 0, c.width, c.height)

  // Cover image tiles
  let imgsToAdd: Record<string, unknown> = {}

  const ys = yearStats.value as Record<string, unknown>
  const booksAddedWithCovers = ys.booksAddedWithCovers as string[]

  if (booksAddedWithCovers.length) {
    let index = 0
    ctx.globalAlpha = 0.25
    ctx.save()
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate((-Math.PI / 180) * 25)
    ctx.translate(-c.width / 2, -c.height / 2)
    ctx.translate(-130, -120)
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const coverIndex = index % booksAddedWithCovers.length
        const libraryItemId = booksAddedWithCovers[coverIndex]
        index++

        await new Promise<void>((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.addEventListener('load', () => {
            let sw = img.width
            if (img.width > img.height) {
              sw = img.height
            }
            const sx = -(sw - img.width) / 2
            const sy = -(sw - img.height) / 2
            ctx.drawImage(img, sx, sy, sw, sw, 215 * x, 215 * y, 215, 215)
            if (!imgsToAdd[libraryItemId]) {
              imgsToAdd[libraryItemId] = { img, sx, sy, sw }
            }
            resolve()
          })
          img.addEventListener('error', () => { resolve() })
          img.src = globalsStore.getLibraryItemCoverSrcById(libraryItemId)
        })
      }
    }
    ctx.restore()
  }

  ctx.globalAlpha = 1
  ctx.textBaseline = 'middle'

  // Create gradient
  const grd1 = ctx.createLinearGradient(0, 0, c.width, c.height)
  grd1.addColorStop(0, '#000000aa')
  grd1.addColorStop(1, '#cd9d49aa')
  ctx.fillStyle = grd1
  ctx.fillRect(0, 0, c.width, c.height)

  // Top Abs icon
  const tanColor = '#ffdb70'
  ctx.fillStyle = tanColor
  ctx.font = '42px absicons'
  ctx.fillText('\ue900', 15, 36)

  // Top text
  addText('audiobookshelf', '28px', 'normal', tanColor, '0px', 65, 28)
  addText(`${props.year} YEAR IN REVIEW`, '18px', 'bold', 'white', '1px', 65, 51)

  // Top left box
  createRoundedRect(40, 100, 230, 100)
  ctx.textAlign = 'center'
  addText(ys.numBooksAdded, '48px', 'bold', 'white', '0px', 155, 140)
  addText('books added', '18px', 'normal', tanColor, '0px', 155, 170)

  // Box top right
  createRoundedRect(285, 100, 230, 100)
  addText(ys.numAuthorsAdded, '48px', 'bold', 'white', '0px', 400, 140)
  addText('authors added', '18px', 'normal', tanColor, '0px', 400, 170)

  // Box bottom left
  createRoundedRect(530, 100, 230, 100)
  addText(ys.numListeningSessions, '48px', 'bold', 'white', '0px', 645, 140)
  addText('sessions', '18px', 'normal', tanColor, '1px', 645, 170)

  // Text stats
  if (ys.totalBooksAddedSize) {
    addText('Your book collection grew to...', '24px', 'normal', tanColor, '0px', c.width / 2, 260)
    addText(utils.bytesPretty(ys.totalBooksSize as number), '36px', 'bolder', 'white', '0px', c.width / 2, 300)
    addText('+' + utils.bytesPretty(ys.totalBooksAddedSize as number), '20px', 'lighter', 'white', '0px', c.width / 2, 330)
  }

  if (ys.totalBooksAddedDuration) {
    addText('With a total duration of...', '24px', 'normal', tanColor, '0px', c.width / 2, 400)
    addText(utils.elapsedPrettyExtended(ys.totalBooksDuration as number, true, false), '36px', 'bolder', 'white', '0px', c.width / 2, 440)
    addText('+' + utils.elapsedPrettyExtended(ys.totalBooksAddedDuration as number, true, false), '20px', 'lighter', 'white', '0px', c.width / 2, 470)
  }

  if (!props.variant) {
    // Bottom images
    const imgsArr = Object.values(imgsToAdd) as Array<{ img: HTMLImageElement; sx: number; sy: number; sw: number }>
    if (imgsArr.length > 0) {
      addText('Some additions include...', '24px', 'normal', tanColor, '0px', c.width / 2, 540)

      for (let i = 0; i < Math.min(5, imgsArr.length); i++) {
        const imgToAdd = imgsArr[i]
        ctx.drawImage(imgToAdd.img, imgToAdd.sx, imgToAdd.sy, imgToAdd.sw, imgToAdd.sw, 40 + 145 * i, 580, 140, 140)
      }
    }
  } else if (props.variant === 1) {
    // Text stats
    ctx.textAlign = 'left'
    const topAuthors = ys.topAuthors as Array<{ name: string }>
    if (topAuthors.length) {
      addText('TOP AUTHORS', '24px', 'normal', tanColor, '1px', 70, 549)
      for (let i = 0; i < topAuthors.length; i++) {
        addText(topAuthors[i].name, '36px', 'bolder', 'white', '0px', 70, 609 + i * 60, 330)
      }
    }

    const topNarrators = ys.topNarrators as Array<{ name: string }>
    if (topNarrators.length) {
      addText('TOP NARRATORS', '24px', 'normal', tanColor, '1px', 430, 549)
      for (let i = 0; i < topNarrators.length; i++) {
        addText(topNarrators[i].name, '36px', 'bolder', 'white', '0px', 430, 609 + i * 60, 330)
      }
    }
  } else if (props.variant === 2) {
    // Text stats
    ctx.textAlign = 'left'
    const topAuthors = ys.topAuthors as Array<{ name: string }>
    if (topAuthors.length) {
      addText('TOP AUTHORS', '24px', 'normal', tanColor, '1px', 70, 549)
      for (let i = 0; i < topAuthors.length; i++) {
        addText(topAuthors[i].name, '36px', 'bolder', 'white', '0px', 70, 609 + i * 60, 330)
      }
    }

    const topGenres = ys.topGenres as Array<{ genre: string }>
    if (topGenres.length) {
      addText('TOP GENRES', '24px', 'normal', tanColor, '1px', 430, 549)
      for (let i = 0; i < topGenres.length; i++) {
        addText(topGenres[i].genre, '36px', 'bolder', 'white', '0px', 430, 609 + i * 60, 330)
      }
    }
  }

  canvas.value = c
  dataUrl.value = c.toDataURL('png')
}

async function share() {
  if (!dataUrl.value) return
  try {
    await shareImage(dataUrl.value, `audiobookshelf_server_${props.year}.png`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isShareCancellation(message)) return
    console.error('Failed to share', message)
    toast.error('Failed to share: ' + message)
  }
}

function refresh() {
  init()
}

function init() {
  emit('update:processing', true)
  nativeHttp
    .get(`/api/stats/year/${props.year}`)
    .then((data) => {
      yearStats.value = (data as Record<string, unknown> | null | undefined) || {}
      return initCanvas()
    })
    .catch((error: Error) => {
      console.error('Failed', error)
      toast.error('Failed to load year stats')
    })
    .finally(() => {
      emit('update:processing', false)
    })
}

defineExpose({ share, refresh })

onMounted(() => {
  init()
})
</script>
