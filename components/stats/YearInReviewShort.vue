<template>
  <div>
    <div v-if="processing" class="max-w-[600px] h-32 sm:h-[200px] flex items-center justify-center">
      <widgets-loading-spinner />
    </div>
    <img v-else-if="dataUrl" :src="dataUrl" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { isShareCancellation, shareImage } from '~/composables/useShareImage'

const props = defineProps<{
  processing: boolean
  year: number
}>()

const emit = defineEmits<{
  'update:processing': [value: boolean]
}>()

const globalsStore = useGlobalsStore()
const nativeHttp = useNativeHttp()
const toast = useToast()

const canvas = ref<HTMLCanvasElement | null>(null)
const dataUrl = ref<string | null>(null)
const yearStats = ref<Record<string, unknown> | null>(null)

async function initCanvas() {
  if (!yearStats.value) return

  const c = document.createElement('canvas')
  c.width = 600
  c.height = 200
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
  const ys = yearStats.value
  const bookCovers = [...(ys.finishedBooksWithCovers as string[])]
  bookCovers.push(...(ys.booksWithCovers as string[]))

  if (bookCovers.length) {
    let index = 0
    ctx.globalAlpha = 0.25
    ctx.save()
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate((-Math.PI / 180) * 25)
    ctx.translate(-c.width / 2, -c.height / 2)
    ctx.translate(-10, -90)
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 3; y++) {
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
            ctx.drawImage(img, sx, sy, sw, sw, 155 * x, 155 * y, 155, 155)
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
  addText('podshelf', '28px', 'normal', tanColor, '0px', 65, 28)
  addText(`${props.year} YEAR IN REVIEW`, '18px', 'bold', 'white', '1px', 65, 51)

  // Top left box
  createRoundedRect(15, 75, 280, 110)
  addText(ys.numBooksFinished, '48px', 'bold', 'white', '0px', 105, 120)
  addText('books finished', '20px', 'normal', tanColor, '0px', 105, 155)
  const readIconPath = new Path2D()
  readIconPath.addPath(new Path2D('M19 1H5c-1.1 0-1.99.9-1.99 2L3 15.93c0 .69.35 1.3.88 1.66L12 23l8.11-5.41c.53-.36.88-.97.88-1.66L21 3c0-1.1-.9-2-2-2zm-9 15l-5-5 1.41-1.41L10 13.17l7.59-7.59L19 7l-9 9z'), { a: 1.5, d: 1.5, e: 55, f: 115 })
  ctx.fillStyle = '#ffffff'
  ctx.fill(readIconPath)

  createRoundedRect(305, 75, 280, 110)
  addText(ys.numBooksListened, '48px', 'bold', 'white', '0px', 400, 120)
  addText('books listened to', '20px', 'normal', tanColor, '0px', 400, 155)
  addIcon('local_library', 'white', '42px', 345, 130)

  canvas.value = c
  dataUrl.value = c.toDataURL('png')
}

async function share() {
  if (!dataUrl.value) return
  try {
    await shareImage(dataUrl.value, `podshelf_my_${props.year}_short.png`)
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
