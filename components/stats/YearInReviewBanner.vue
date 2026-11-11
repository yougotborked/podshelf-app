<template>
  <div class="bg-md-surface-1 rounded-md shadow-lg border border-md-outline-variant p-2 sm:p-4 mb-4">
    <!-- hack to get icon fonts loaded on init -->
    <div class="h-0 w-0 overflow-hidden opacity-0">
      <span class="material-symbols">close</span>
      <span class="abs-icons icon-audiobookshelf" />
    </div>

    <div class="flex items-center">
      <p class="hidden md:block text-xl font-semibold">{{ yearInReviewYear }} Year in Review</p>
      <div class="hidden md:block flex-grow" />
      <ui-btn class="w-full md:w-auto" @click.stop="clickShowYearInReview">{{ showYearInReview ? strings.LabelYearReviewHide : strings.LabelYearReviewShow }}</ui-btn>
    </div>

    <!-- your year in review -->
    <div v-if="showYearInReview">
      <div class="w-full h-px bg-md-on-surface/10 my-4" />

      <div class="flex items-center justify-center mb-2 max-w-[800px] mx-auto">
        <!-- previous button -->
        <ui-btn small :disabled="!yearInReviewVariant || processingYearInReview" class="inline-flex items-center font-semibold" @click="yearInReviewVariant--">
          <span class="material-symbols text-lg sm:pr-1 py-px sm:py-0">chevron_left</span>
          <span class="hidden sm:inline-block pr-2">Previous</span>
        </ui-btn>
        <!-- share button -->
        <ui-btn small :disabled="processingYearInReview" class="inline-flex sm:hidden items-center font-semibold ml-1 sm:ml-2" @click="shareYearInReview"> Share </ui-btn>

        <div class="flex-grow" />
        <p class="hidden sm:block text-lg font-semibold">Your Year in Review ({{ yearInReviewVariant + 1 }})</p>
        <p class="block sm:hidden text-lg font-semibold">{{ yearInReviewVariant + 1 }}</p>
        <div class="flex-grow" />

        <!-- refresh button -->
        <ui-btn small :disabled="processingYearInReview" class="inline-flex items-center font-semibold mr-1 sm:mr-2" @click="refreshYearInReview">
          <span class="hidden sm:inline-block">Refresh</span>
          <span class="material-symbols sm:!hidden text-lg py-px">refresh</span>
        </ui-btn>
        <!-- next button -->
        <ui-btn small :disabled="yearInReviewVariant >= 2 || processingYearInReview" class="inline-flex items-center font-semibold" @click="yearInReviewVariant++">
          <span class="hidden sm:inline-block pl-2">Next</span>
          <span class="material-symbols text-lg sm:pl-1 py-px sm:py-0">chevron_right</span>
        </ui-btn>
      </div>
      <stats-year-in-review ref="yearInReview" :variant="yearInReviewVariant" :year="yearInReviewYear" v-model:processing="processingYearInReview" />

      <!-- your year in review short -->
      <div class="w-full max-w-[800px] mx-auto my-4">
        <!-- share button -->
        <ui-btn small :disabled="processingYearInReviewShort" class="inline-flex sm:hidden items-center font-semibold mb-1" @click="shareYearInReviewShort"> Share </ui-btn>
        <stats-year-in-review-short ref="yearInReviewShort" :year="yearInReviewYear" v-model:processing="processingYearInReviewShort" />
      </div>

      <!-- your server in review -->
      <div v-if="isAdminOrUp" class="w-full max-w-[800px] mx-auto mb-2 mt-4 border-t pt-4 border-md-outline-variant">
        <div class="flex items-center justify-center mb-2">
          <!-- previous button -->
          <ui-btn small :disabled="!yearInReviewServerVariant || processingYearInReviewServer" class="inline-flex items-center font-semibold" @click="yearInReviewServerVariant--">
            <span class="material-symbols text-lg sm:pr-1 py-px sm:py-0">chevron_left</span>
            <span class="hidden sm:inline-block pr-2">Previous</span>
          </ui-btn>
          <!-- share button -->
          <ui-btn small :disabled="processingYearInReviewServer" class="inline-flex sm:hidden items-center font-semibold ml-1 sm:ml-2" @click="shareYearInReviewServer"> Share </ui-btn>

          <div class="flex-grow" />
          <p class="hidden sm:block text-lg font-semibold">Server Year in Review ({{ yearInReviewServerVariant + 1 }})</p>
          <p class="block sm:hidden text-lg font-semibold">{{ yearInReviewServerVariant + 1 }}</p>
          <div class="flex-grow" />

          <!-- refresh button -->
          <ui-btn small :disabled="processingYearInReviewServer" class="inline-flex items-center font-semibold mr-1 sm:mr-2" @click="refreshYearInReviewServer">
            <span class="hidden sm:inline-block">Refresh</span>
            <span class="material-symbols sm:!hidden text-lg py-px">refresh</span>
          </ui-btn>
          <!-- next button -->
          <ui-btn small :disabled="yearInReviewServerVariant >= 2 || processingYearInReviewServer" class="inline-flex items-center font-semibold" @click="yearInReviewServerVariant++">
            <span class="hidden sm:inline-block pl-2">Next</span>
            <span class="material-symbols text-lg sm:pl-1 py-px sm:py-0">chevron_right</span>
          </ui-btn>
        </div>
      </div>
      <stats-year-in-review-server v-if="isAdminOrUp" ref="yearInReviewServer" :year="yearInReviewYear" :variant="yearInReviewServerVariant" v-model:processing="processingYearInReviewServer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const strings = useStrings()
const userStore = useUserStore()

const showYearInReview = ref(false)
const yearInReviewYear = ref(0)
const yearInReviewVariant = ref(0)
const yearInReviewServerVariant = ref(0)
const processingYearInReview = ref(false)
const processingYearInReviewShort = ref(false)
const processingYearInReviewServer = ref(false)

const yearInReview = ref<{ share: () => void; refresh: () => void } | null>(null)
const yearInReviewShort = ref<{ share: () => void; refresh: () => void } | null>(null)
const yearInReviewServer = ref<{ share: () => void; refresh: () => void } | null>(null)

const isAdminOrUp = computed(() => userStore.getIsAdminOrUp)

function shareYearInReviewServer() {
  yearInReviewServer.value?.share()
}

function shareYearInReview() {
  yearInReview.value?.share()
}

function shareYearInReviewShort() {
  yearInReviewShort.value?.share()
}

function refreshYearInReviewServer() {
  yearInReviewServer.value?.refresh()
}

function refreshYearInReview() {
  yearInReview.value?.refresh()
  yearInReviewShort.value?.refresh()
}

function clickShowYearInReview() {
  showYearInReview.value = !showYearInReview.value
}

// beforeMount logic
yearInReviewYear.value = new Date().getFullYear()
// When not December show previous year
if (new Date().getMonth() < 11) {
  yearInReviewYear.value--
}
</script>
