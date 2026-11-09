<template>
  <!--
    Stats were reachable only from the side drawer, which is the definition of buried for the one
    number a listener is actually keeping. This puts the streak where they already look - above
    the queue they are about to play from - and makes it the way in.

    It renders nothing until there is a streak to show: a chip reading "0 days" on a new install
    is a scolding, not an invitation.
  -->
  <nuxt-link v-if="streak.current > 0" to="/stats" class="flex items-center gap-1 rounded-md-full bg-md-surface-3 pl-2 pr-2.5 py-1 active:opacity-60" :aria-label="`${streak.current} day listening streak`">
    <span class="material-symbols text-base leading-none text-md-primary">local_fire_department</span>
    <span class="text-md-label-m text-md-on-surface tabular-nums leading-none">{{ streak.current }}</span>
  </nuxt-link>
</template>

<script setup lang="ts">
import { listeningStreak, type ListeningStreak } from '~/composables/useAchievements'

const appStore = useAppStore()
const nativeHttp = useNativeHttp()

const streak = ref<ListeningStreak>({ current: 0, longest: 0 })

async function load() {
  // Offline there is nothing to ask and nothing to show; the chip simply stays hidden rather
  // than spending a timeout on a request that cannot succeed.
  if (appStore.isOffline) return
  try {
    const stats = (await nativeHttp.get('/api/me/listening-stats', { connectTimeout: 10000 })) as { days?: Record<string, number> } | null
    streak.value = listeningStreak(stats?.days || {})
  } catch (error) {
    console.error('[StreakChip] Failed to load listening stats', error)
  }
}

onMounted(load)

// The chip can mount before the server connection has loaded - on a cold start it usually does.
// Loading only on mount meant it stayed hidden until the next visit, so it loads again as soon
// as there is a server to ask. Without this the request used to go out anyway, relative, and
// get the app's own index.html back as "stats".
watch(
  () => useUserStore().serverConnectionConfig?.address,
  (address, previous) => {
    if (address && address !== previous) void load()
  }
)
</script>
