<template>
  <div class="w-full">
    <!-- The streak leads, because it is the one number people are keeping -->
    <div class="mx-4 mb-4 rounded-md-lg bg-md-surface-2 px-4 py-4 flex items-center gap-4">
      <div class="h-14 w-14 shrink-0 rounded-md-full flex items-center justify-center" :class="streak.current ? 'bg-md-primary text-md-on-primary' : 'bg-md-surface-4 text-md-on-surface-variant'">
        <span class="material-symbols text-3xl">local_fire_department</span>
      </div>
      <div class="min-w-0">
        <p class="text-md-title-l text-md-on-surface font-semibold leading-none">
          {{ formatNumber(streak.current) }} <span class="text-md-body-m font-normal text-md-on-surface-variant">{{ streak.current === 1 ? 'day' : 'days' }}</span>
        </p>
        <p class="text-md-body-s text-md-on-surface-variant mt-1">
          <template v-if="streak.current">Current streak · best {{ formatNumber(streak.longest) }}</template>
          <template v-else-if="streak.longest">No streak right now · best {{ formatNumber(streak.longest) }}</template>
          <template v-else>Listen two days running to start a streak</template>
        </p>
      </div>
    </div>

    <!-- What to aim at next, one per ladder -->
    <div v-if="upcoming.length" class="mx-4 mb-5 rounded-md-lg bg-md-surface-1 px-4 py-3 flex flex-col gap-3">
      <div v-for="tier in upcoming" :key="`next-${tier.id}`">
        <div class="flex items-center gap-3">
          <span class="material-symbols text-2xl shrink-0" :class="rankInk(tier.rank)">{{ tier.icon }}</span>
          <div class="min-w-0 flex-1">
            <p class="text-md-label-l text-md-on-surface truncate">{{ tier.title }}</p>
            <p class="text-md-body-s text-md-on-surface-variant truncate">{{ describeRequirement(tier) }}</p>
          </div>
          <p class="text-md-label-m text-md-on-surface-variant tabular-nums shrink-0">{{ Math.round(tier.progress * 100) }}%</p>
        </div>
        <div class="w-full h-1.5 rounded-md-full bg-md-surface-4 overflow-hidden mt-2">
          <div class="h-full rounded-md-full transition-all duration-500" :class="rankFill(tier.rank)" :style="{ width: `${Math.round(tier.progress * 100)}%` }" />
        </div>
      </div>
    </div>

    <div class="px-4 flex items-baseline justify-between mb-2">
      <h2 class="text-md-title-m text-md-on-surface">Badges</h2>
      <p class="text-md-label-m text-md-on-surface-variant tabular-nums">{{ earned.length }} / {{ evaluated.length }}</p>
    </div>

    <!-- Grouped by ladder, each in threshold order. A locked badge keeps its icon and its rank
         colour at low opacity: hiding it behind a padlock made the wall unreadable, because the
         only thing you could learn from an unearned badge was that it existed. -->
    <div v-for="group in groups" :key="group.metric" class="px-4 pb-1">
      <p class="text-md-label-m text-md-on-surface-variant mb-1.5 mt-2">{{ group.label }}</p>
      <div class="grid grid-cols-4 gap-2">
        <button v-for="tier in group.tiers" :key="tier.id" type="button" class="rounded-md-md px-1.5 py-2.5 flex flex-col items-center text-center gap-1 transition-opacity" :class="badgeClass(tier)" @click="openDetail(tier)">
          <span class="material-symbols text-2xl leading-none">{{ tier.icon }}</span>
          <p class="text-md-label-s leading-tight">{{ tier.title }}</p>
        </button>
      </div>
    </div>

    <!-- Tap a badge to find out what it is. The titles are flavour - "Archivist", "Deep
         Catalogue" - which is the point of them and no help at all in working out the ask. -->
    <!--
      Kept mounted and toggled, never `v-if`-ed into existence already open. Modal.vue starts at
      opacity-0 and fades in from a `watch` on its model value, and a watcher only fires on a
      change - so a modal mounted with the value already true never runs setShow() and sits there
      fully transparent. It was rendered, it was on top, and tapping a badge did nothing visible.
    -->
    <modals-modal v-model="detailOpen" width="88%" max-width="420px">
      <div v-if="selected" class="px-6 py-6 flex flex-col items-center text-center gap-3">
        <div class="h-20 w-20 rounded-md-full flex items-center justify-center" :class="badgeClass(selected)">
          <span class="material-symbols text-4xl leading-none">{{ selected.icon }}</span>
        </div>
        <div>
          <p class="text-md-title-m text-md-on-surface">{{ selected.title }}</p>
          <p class="text-md-label-s text-md-on-surface-variant mt-0.5">{{ BADGE_RANK_NAMES[selected.rank] }}{{ selected.earned ? ' · Earned' : '' }}</p>
        </div>
        <p class="text-md-body-m text-md-on-surface-variant">{{ selected.description }}</p>
        <div class="w-full rounded-md-md bg-md-surface-2 px-4 py-3">
          <p class="text-md-label-m text-md-on-surface">{{ describeRequirement(selected) }}</p>
          <p class="text-md-body-s text-md-on-surface-variant mt-1 tabular-nums">{{ describeProgress(selected) }}</p>
          <div v-if="!selected.earned" class="w-full h-1.5 rounded-md-full bg-md-surface-4 overflow-hidden mt-2">
            <div class="h-full rounded-md-full" :class="rankFill(selected.rank)" :style="{ width: `${Math.round(selected.progress * 100)}%` }" />
          </div>
        </div>
      </div>
    </modals-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  BADGE_RANK_NAMES,
  describeProgress,
  describeRequirement,
  earnedAchievements,
  evaluateAchievements,
  groupByMetric,
  nextPerMetric,
  type EvaluatedAchievement,
  type ListeningSummary,
  type ListeningStreak
} from '~/composables/useAchievements'
import { formatNumber } from '~/composables/useStrings'

const props = defineProps<{
  summary: ListeningSummary
  streak: ListeningStreak
}>()

const evaluated = computed(() => evaluateAchievements(props.summary))
const earned = computed(() => earnedAchievements(evaluated.value))

// One target per ladder rather than a single global "next". Once most of the wall is earned, a
// global next picks whichever happens to be closest and says nothing about where the remaining
// room actually is - which is the moment a heavy user starts asking.
const upcoming = computed(() => nextPerMetric(evaluated.value))

// Grouped into ladders rather than sorted earned-first. A badge means more beside the ones
// either side of it: you can see what you cleared and what the next rung costs.
const groups = computed(() => groupByMetric(evaluated.value))

const selected = ref<EvaluatedAchievement | null>(null)
const detailOpen = ref(false)

function openDetail(tier: EvaluatedAchievement) {
  selected.value = tier
  detailOpen.value = true
}

// The badge is kept after closing so the sheet does not blank out mid-fade; the next tap
// replaces it.
watch(detailOpen, (open) => {
  if (!open) setTimeout(() => (selected.value = null), 200)
})

// Written out in full rather than built as `bg-md-badge-${rank}`. Tailwind generates classes by
// scanning the source for literal strings, so an interpolated name produces markup referring to
// a class that was never emitted - which renders as no colour at all and looks like a theming
// bug rather than a build one. This cost a screenshot to catch.
const RANK_SURFACE: Record<number, string> = {
  1: 'bg-md-badge-1 text-md-badge-1-on',
  2: 'bg-md-badge-2 text-md-badge-2-on',
  3: 'bg-md-badge-3 text-md-badge-3-on',
  4: 'bg-md-badge-4 text-md-badge-4-on',
  5: 'bg-md-badge-5 text-md-badge-5-on'
}
const RANK_FILL: Record<number, string> = {
  1: 'bg-md-badge-1',
  2: 'bg-md-badge-2',
  3: 'bg-md-badge-3',
  4: 'bg-md-badge-4',
  5: 'bg-md-badge-5'
}
const RANK_INK: Record<number, string> = {
  1: 'text-md-badge-1-on',
  2: 'text-md-badge-2-on',
  3: 'text-md-badge-3-on',
  4: 'text-md-badge-4-on',
  5: 'text-md-badge-5-on'
}

function badgeClass(tier: EvaluatedAchievement): string {
  // Locked badges keep their rank's colour, dimmed, rather than going grey. The point of a
  // locked badge is seeing what it is and what it is worth.
  const base = RANK_SURFACE[tier.rank] ?? RANK_SURFACE[1] ?? ''
  return tier.earned ? base : `${base} opacity-40`
}

function rankFill(rank: number): string {
  return RANK_FILL[rank] ?? RANK_FILL[1] ?? ''
}

function rankInk(rank: number): string {
  return RANK_INK[rank] ?? RANK_INK[1] ?? ''
}
</script>
