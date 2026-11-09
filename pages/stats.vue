<template>
  <!--
    Mobile-first, and capped at 600dp like the rest of the app: this was a desktop layout with
    md: breakpoints, a fixed w-80 session column and a chart scaled to 90% to make it fit, which
    on a phone meant three headline numbers squeezed into a row and a chart drawn smaller than
    the space it had.
  -->
  <div class="w-full h-full overflow-y-auto min-[600px]:max-w-3xl min-[600px]:mx-auto">
    <stats-year-in-review-banner v-if="showYearInReviewBanner" />

    <h1 class="text-md-title-l text-md-on-surface px-4 pt-4 pb-3">{{ $strings.HeaderYourStats }}</h1>

    <!-- The totals. One row, but each figure gets a third of the width rather than fighting for it -->
    <div class="grid grid-cols-3 gap-2 px-4">
      <div v-for="total in totals" :key="total.label" class="rounded-md-lg bg-md-surface-2 px-2 py-3 text-center">
        <p class="text-md-headline-s text-md-on-surface font-semibold tabular-nums leading-none">{{ $formatNumber(total.value) }}</p>
        <p class="text-md-label-s text-md-on-surface-variant mt-1.5 leading-tight">{{ total.label }}</p>
      </div>
    </div>

    <stats-achievement-shelf :summary="listeningSummary" :streak="streak" class="mt-6 mb-7" />

    <div class="px-4">
      <stats-daily-listening-chart :listening-stats="listeningStats" />
    </div>

    <div class="px-4 pb-6">
      <h2 class="text-md-title-m text-md-on-surface mb-2">{{ $strings.HeaderStatsRecentSessions }}</h2>
      <p v-if="!mostRecentListeningSessions.length" class="text-md-body-m text-md-on-surface-variant">{{ $strings.MessageNoListeningSessions }}</p>
      <div v-for="(item, index) in mostRecentListeningSessions" :key="item.id" class="flex items-center gap-3 py-2 border-b border-md-outline-variant/30 last:border-b-0">
        <p class="text-md-label-m text-md-on-surface-variant tabular-nums w-5 shrink-0">{{ index + 1 }}</p>
        <div class="min-w-0 flex-1">
          <p class="text-md-body-m text-md-on-surface truncate">{{ item.mediaMetadata ? item.mediaMetadata.title : '' }}</p>
          <p class="text-md-body-s text-md-on-surface-variant">{{ $dateDistanceFromNow(item.updatedAt ?? null) }}</p>
        </div>
        <p class="text-md-label-m text-md-on-surface tabular-nums shrink-0">{{ $elapsedPretty(item.timeListening ?? 0) }}</p>
      </div>
    </div>

    <stats-year-in-review-banner v-if="!showYearInReviewBanner" />
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from '~/stores/user'
import { useLibrariesStore } from '~/stores/libraries'
import { listeningStreak, type ListeningSummary } from '~/composables/useAchievements'

const userStore = useUserStore()
const strings = useStrings()
const librariesStore = useLibrariesStore()
const nativeHttp = useNativeHttp()

type ListeningSession = { id: string; mediaMetadata?: { title?: string }; updatedAt?: number; timeListening?: number; [key: string]: unknown }
type ListeningStats = { recentSessions?: ListeningSession[]; totalTime?: number; days?: Record<string, unknown> }

const listeningStats = ref<ListeningStats | null>(null)
const showYearInReviewBanner = ref(false)

const user = computed(() => userStore.user)
const currentLibraryId = computed(() => librariesStore.currentLibraryId)
const userMediaProgress = computed(() => (user.value ? (user.value.mediaProgress as Record<string, unknown>[]) : []))
const userItemsFinished = computed(() => userMediaProgress.value.filter((lip) => !!lip.isFinished))
const mostRecentListeningSessions = computed(() => {
  if (!listeningStats.value) return []
  return listeningStats.value.recentSessions || []
})
const totalMinutesListening = computed(() => {
  if (!listeningStats.value) return 0
  return Math.round((listeningStats.value.totalTime || 0) / 60)
})
const totalDaysListened = computed(() => {
  if (!listeningStats.value) return 0
  // Days the server recorded against, not days heard - a zero is a recorded day with no listening
  return Object.values((listeningStats.value.days || {}) as Record<string, number>).filter(Boolean).length
})

const streak = computed(() => listeningStreak((listeningStats.value?.days || {}) as Record<string, number>))

const totals = computed(() => [
  { value: userItemsFinished.value.length, label: strings.LabelStatsItemsFinished },
  { value: totalDaysListened.value, label: strings.LabelStatsDaysListened },
  { value: totalMinutesListening.value, label: strings.LabelStatsMinutesListening }
])

const listeningSummary = computed<ListeningSummary>(() => ({
  totalMinutes: totalMinutesListening.value,
  itemsFinished: userItemsFinished.value.length,
  daysListened: totalDaysListened.value,
  currentStreak: streak.value.current,
  longestStreak: streak.value.longest
}))

watch(currentLibraryId, (newVal) => {
  if (newVal) {
    void init()
  }
})

async function init() {
  listeningStats.value = (await nativeHttp.get(`/api/me/listening-stats`, { connectTimeout: 10000 }).catch((err: Error) => {
    console.error('Failed to load listening sesions', err)
    return []
  })) as ListeningStats | null

  const month = new Date().getMonth()
  // January and December show year in review banner
  if (month === 11 || month === 0) {
    showYearInReviewBanner.value = true
  }
}

onMounted(() => {
  void init()
})
</script>
