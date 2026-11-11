<template>
  <div ref="container" class="w-full my-6">
    <h1 class="text-2xl mb-4">{{ strings.HeaderStatsMinutesListeningChart }}</h1>
    <div class="relative w-full h-72">
      <div class="absolute top-0 left-0">
        <template v-for="lbl in yAxisLabels" :key="lbl">
          <div :style="{ height: lineSpacing + 'px' }" class="flex items-center justify-end">
            <p class="text-xs font-semibold">{{ lbl }}</p>
          </div>
        </template>
      </div>

      <template v-for="n in 7" :key="n">
        <div class="absolute pointer-events-none left-0 h-px bg-md-outline-variant" :style="{ top: n * lineSpacing - lineSpacing / 2 + 'px', width: chartContentWidth + 'px', marginLeft: chartContentMarginLeft + 'px' }" />

        <div class="absolute z-10" :style="{ left: points[n - 1]?.x + 'px', bottom: points[n - 1]?.y + 'px' }">
          <div class="h-2 w-2 bg-md-primary/80 hover:bg-md-primary rounded-full transform duration-150 transition-transform hover:scale-125" />
        </div>
      </template>

      <div v-for="(line, index) in pointLines" :key="`line-${index}`" class="absolute h-0.5 bg-md-primary origin-bottom-left pointer-events-none" :style="{ width: line.width + 'px', left: line.x + 'px', bottom: line.y + 'px', transform: `rotate(${line.angle}deg)` }" />

      <div class="absolute -bottom-2 left-0 flex ml-6">
        <template v-for="dayObj in last7Days" :key="dayObj.date">
          <div :style="{ width: daySpacing + daySpacing / 14 + 'px' }">
            <p class="text-sm">{{ dayObj.dayOfWeek.slice(0, 3) }}</p>
          </div>
        </template>
      </div>
    </div>
    <div class="flex justify-between pt-12">
      <div>
        <p class="text-sm text-center">{{ strings.LabelStatsWeekListening }}</p>
        <p class="text-5xl font-semibold text-center" style="line-height: 0.85">{{ formatNumber(totalMinutesListeningThisWeek) }}</p>
        <p class="text-sm text-center">{{ strings.LabelStatsMinutes }}</p>
      </div>
      <div>
        <p class="text-sm text-center">{{ strings.LabelStatsDailyAverage }}</p>
        <p class="text-5xl font-semibold text-center" style="line-height: 0.85">{{ formatNumber(averageMinutesPerDay) }}</p>
        <p class="text-sm text-center">{{ strings.LabelStatsMinutes }}</p>
      </div>
      <div>
        <p class="text-sm text-center">{{ strings.LabelStatsBestDay }}</p>
        <p class="text-5xl font-semibold text-center" style="line-height: 0.85">{{ formatNumber(mostListenedDay) }}</p>
        <p class="text-sm text-center">{{ strings.LabelStatsMinutes }}</p>
      </div>
      <div>
        <p class="text-sm text-center">{{ strings.LabelStatsDays }}</p>
        <p class="text-5xl font-semibold text-center" style="line-height: 0.85">{{ formatNumber(daysInARow) }}</p>
        <p class="text-sm text-center">{{ strings.LabelStatsInARow }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { listeningStreak } from '~/composables/useAchievements'

const props = defineProps<{
  listeningStats: Record<string, unknown> | null
}>()

const strings = useStrings()
const utils = useUtils()

const chartHeight = 288
const chartContentHeight = 268
/** Width reserved for the y-axis labels, to the left of the plotted area. */
const AXIS_GUTTER = 24
/** Below this the plot is too cramped to read, so it scrolls rather than collapsing. */
const MIN_CHART_WIDTH = 280

const container = ref<HTMLElement | null>(null)
const chartWidth = ref(384)

function measure() {
  const width = container.value?.clientWidth
  if (width) chartWidth.value = Math.max(width, MIN_CHART_WIDTH)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  measure()
  // The container's width changes with orientation and with a fold opening, neither of which
  // fires a resize on the element itself in every engine
  if (typeof ResizeObserver !== 'undefined' && container.value) {
    observer = new ResizeObserver(measure)
    observer.observe(container.value)
  }
  window.addEventListener('resize', measure)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})

const chartContentWidth = computed(() => chartWidth.value - AXIS_GUTTER)

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(n)
}

const chartContentMarginLeft = computed(() => AXIS_GUTTER)
const chartContentMarginBottom = computed(() => chartHeight - chartContentHeight)
const lineSpacing = computed(() => chartHeight / 7)
const daySpacing = computed(() => chartContentWidth.value / 7)

const last7Days = computed(() => {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const _date = utils.addDaysToToday(i * -1)
    days.push({
      dayOfWeek: utils.formatJsDate(_date, 'EEEE'),
      date: utils.formatJsDate(_date, 'yyyy-MM-dd')
    })
  }
  return days
})

const listeningStatsDays = computed(() => {
  return props.listeningStats ? (props.listeningStats.days as Record<string, number> | null | undefined) || {} : {}
})

function getMinutesListeningForDate(date: string) {
  if (!props.listeningStats || !(props.listeningStats.days as Record<string, number> | null | undefined)) return 0
  return Math.round(((props.listeningStats.days as Record<string, number>)[date] || 0) / 60)
}

const last7DaysOfListening = computed(() => {
  const listeningDays: Record<number, { dayOfWeek: string; minutesListening: number }> = {}
  let _index = 0
  last7Days.value.forEach((dayObj) => {
    listeningDays[_index++] = {
      dayOfWeek: dayObj.dayOfWeek,
      minutesListening: getMinutesListeningForDate(dayObj.date)
    }
  })
  return listeningDays
})

const mostListenedDay = computed(() => {
  const sorted = Object.values(last7DaysOfListening.value)
    .map((dl) => ({ ...dl }))
    .sort((a, b) => b.minutesListening - a.minutesListening)
  return sorted[0]?.minutesListening ?? 0
})

const yAxisFactor = computed(() => {
  const factor = Math.ceil(mostListenedDay.value / 5)
  if (factor > 25) {
    return Math.ceil(factor / 5) * 5
  }
  return Math.max(1, factor)
})

const yAxisLabels = computed(() => {
  const lbls = []
  for (let i = 6; i >= 0; i--) {
    lbls.push(i * yAxisFactor.value)
  }
  return lbls
})

const points = computed(() => {
  const data = []
  for (let i = 0; i < 7; i++) {
    const listeningObj = last7DaysOfListening.value[i]
    const minutesListening = listeningObj?.minutesListening || 0
    const yPercent = minutesListening / (yAxisFactor.value * 7)
    data.push({
      x: 4 + chartContentMarginLeft.value + (daySpacing.value + daySpacing.value / 14) * i,
      y: chartContentMarginBottom.value + chartHeight * yPercent - 2
    })
  }
  return data
})

function getAngleBetweenPoints(cx: number, cy: number, ex: number, ey: number) {
  const dy = ey - cy
  const dx = ex - cx
  let theta = Math.atan2(dy, dx)
  theta *= 180 / Math.PI
  return theta * -1
}

const pointLines = computed(() => {
  const lines = []
  for (let i = 1; i < 7; i++) {
    const lastPoint = points.value[i - 1]
    const nextPoint = points.value[i]
    if (!lastPoint || !nextPoint) continue
    const x1 = lastPoint.x
    const x2 = nextPoint.x
    const y1 = lastPoint.y
    const y2 = nextPoint.y
    lines.push({
      x: x1 + 4,
      y: y1 + 2,
      angle: getAngleBetweenPoints(x1, y1, x2, y2),
      width: Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2)) - 2
    })
  }
  return lines
})

const totalMinutesListeningThisWeek = computed(() => {
  let _total = 0
  Object.values(last7DaysOfListening.value).forEach((listeningObj) => (_total += listeningObj.minutesListening))
  return _total
})

const averageMinutesPerDay = computed(() => Math.round(totalMinutesListeningThisWeek.value / 7))

// The streak rule lives in useAchievements so it can be tested and so the badges agree with the
// number shown here. This was a `while (true)` loop with overflow protection standing in for a
// terminating condition.
const daysInARow = computed(() => listeningStreak(listeningStatsDays.value).current)
</script>
