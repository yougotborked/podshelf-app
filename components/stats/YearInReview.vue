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
  year: number
  processing: boolean
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

  const addIcon = (icon: string, color: string, fontSize: string, x: number, y: number) => {
    ctx.fillStyle = color
    ctx.font = `${fontSize} Material Symbols Rounded`
    ctx.fillText(icon, x, y)
  }

  // Bg color
  ctx.fillStyle = '#232323'
  ctx.fillRect(0, 0, c.width, c.height)

  // Cover image tiles
  const ys = yearStats.value as Record<string, unknown>
  const bookCovers = [...(ys.finishedBooksWithCovers as string[])]
  bookCovers.push(...(ys.booksWithCovers as string[]))

  let finishedBookCoverImgs: Record<string, { img: HTMLImageElement; sx: number; sy: number; sw: number }> = {}

  if (bookCovers.length) {
    let index = 0
    ctx.globalAlpha = 0.25
    ctx.save()
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate((-Math.PI / 180) * 25)
    ctx.translate(-c.width / 2, -c.height / 2)
    ctx.translate(-130, -120)
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const coverIndex = index % bookCovers.length
        const libraryItemId = bookCovers[coverIndex]
        index++
        if (!libraryItemId) continue

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
            resolve()
            if ((ys.finishedBooksWithCovers as string[]).includes(libraryItemId) && !finishedBookCoverImgs[libraryItemId]) {
              finishedBookCoverImgs[libraryItemId] = { img, sx, sy, sw }
            }
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
  addText('podshelf', '28px', 'normal', tanColor, '0px', 65, 28)
  addText(`${props.year} YEAR IN REVIEW`, '18px', 'bold', 'white', '1px', 65, 51)

  // Top left box
  createRoundedRect(50, 100, 340, 160)
  addText(ys.numBooksFinished, '64px', 'bold', 'white', '0px', 160, 165)
  addText('books finished', '28px', 'normal', tanColor, '0px', 160, 210)
  const readIconPath = new Path2D()
  readIconPath.addPath(new Path2D('M19 1H5c-1.1 0-1.99.9-1.99 2L3 15.93c0 .69.35 1.3.88 1.66L12 23l8.11-5.41c.53-.36.88-.97.88-1.66L21 3c0-1.1-.9-2-2-2zm-9 15l-5-5 1.41-1.41L10 13.17l7.59-7.59L19 7l-9 9z'), { a: 2, d: 2, e: 100, f: 160 })
  ctx.fillStyle = '#ffffff'
  ctx.fill(readIconPath)

  // Box top right
  createRoundedRect(410, 100, 340, 160)
  addText(utils.elapsedPrettyExtended(ys.totalListeningTime as number, true, false), '40px', 'bold', 'white', '0px', 500, 165)
  addText('spent listening', '28px', 'normal', tanColor, '0px', 500, 205)
  addIcon('watch_later', 'white', '52px', 440, 180)

  // Box bottom left
  createRoundedRect(50, 280, 340, 160)
  addText(ys.totalListeningSessions, '64px', 'bold', 'white', '0px', 160, 345)
  addText('sessions', '28px', 'normal', tanColor, '1px', 160, 390)
  addIcon('headphones', 'white', '52px', 95, 360)

  // Box bottom right
  createRoundedRect(410, 280, 340, 160)
  addText(ys.numBooksListened, '64px', 'bold', 'white', '0px', 500, 345)
  addText('books listened to', '28px', 'normal', tanColor, '0px', 500, 390)
  addIcon('local_library', 'white', '52px', 440, 360)

  if (!props.variant) {
    // Text stats
    const topNarrator = ys.mostListenedNarrator as { name: string; time: number } | null
    if (topNarrator) {
      addText('TOP NARRATOR', '24px', 'normal', tanColor, '1px', 70, 520)
      addText(topNarrator.name, '36px', 'bolder', 'white', '0px', 70, 564, 330)
      addText(utils.elapsedPrettyExtended(topNarrator.time, true, false), '24px', 'lighter', 'white', '1px', 70, 599)
    }

    const topGenres = ys.topGenres as Array<{ genre: string; time: number }>
    const topGenre = topGenres[0]
    if (topGenre) {
      addText('TOP GENRE', '24px', 'normal', tanColor, '1px', 430, 520)
      addText(topGenre.genre, '36px', 'bolder', 'white', '0px', 430, 564, 330)
      addText(utils.elapsedPrettyExtended(topGenre.time, true, false), '24px', 'lighter', 'white', '1px', 430, 599)
    }

    const topAuthors = ys.topAuthors as Array<{ name: string; time: number }>
    const topAuthor = topAuthors[0]
    if (topAuthor) {
      addText('TOP AUTHOR', '24px', 'normal', tanColor, '1px', 70, 670)
      addText(topAuthor.name, '36px', 'bolder', 'white', '0px', 70, 714, 330)
      addText(utils.elapsedPrettyExtended(topAuthor.time, true, false), '24px', 'lighter', 'white', '1px', 70, 749)
    }

    const mostListenedMonth = ys.mostListenedMonth as { time: number; month: number } | null
    if (mostListenedMonth?.time) {
      const jsdate = new Date(props.year, mostListenedMonth.month, 1)
      const monthName = utils.formatJsDate(jsdate, 'LLLL')
      addText('TOP MONTH', '24px', 'normal', tanColor, '1px', 430, 670)
      addText(monthName, '36px', 'bolder', 'white', '0px', 430, 714, 330)
      addText(utils.elapsedPrettyExtended(mostListenedMonth.time, true, false), '24px', 'lighter', 'white', '1px', 430, 749)
    }
  } else if (props.variant === 1) {
    // Bottom images
    const finishedImgsArr = Object.values(finishedBookCoverImgs)
    if (finishedImgsArr.length > 0) {
      ctx.textAlign = 'center'
      addText('Some books finished this year...', '28px', 'normal', tanColor, '0px', c.width / 2, 530)

      for (let i = 0; i < Math.min(5, finishedImgsArr.length); i++) {
        const imgToAdd = finishedImgsArr[i]
        if (!imgToAdd) continue
        ctx.drawImage(imgToAdd.img, imgToAdd.sx, imgToAdd.sy, imgToAdd.sw, imgToAdd.sw, 40 + 145 * i, 570, 140, 140)
      }
    }
  } else if (props.variant === 2) {
    // Text stats
    const topAuthors = ys.topAuthors as Array<{ name: string }>
    if (topAuthors.length) {
      addText('TOP AUTHORS', '24px', 'normal', tanColor, '1px', 70, 524)
      for (let i = 0; i < topAuthors.length; i++) {
        addText(topAuthors[i]?.name ?? '', '36px', 'bolder', 'white', '0px', 70, 584 + i * 60, 330)
      }
    }

    const topGenres = ys.topGenres as Array<{ genre: string }>
    if (topGenres.length) {
      addText('TOP GENRES', '24px', 'normal', tanColor, '1px', 430, 524)
      for (let i = 0; i < topGenres.length; i++) {
        addText(topGenres[i]?.genre ?? '', '36px', 'bolder', 'white', '0px', 430, 584 + i * 60, 330)
      }
    }
  }

  canvas.value = c
  dataUrl.value = c.toDataURL('png')
}

function refresh() {
  init()
}

async function share() {
  if (!dataUrl.value) return
  try {
    await shareImage(dataUrl.value, `podshelf_my_${props.year}.png`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isShareCancellation(message)) return
    console.error('Failed to share', message)
    toast.error('Failed to share: ' + message)
  }
}

function init() {
  emit('update:processing', true)
  nativeHttp
    .get(`/api/me/stats/year/${props.year}`)
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
