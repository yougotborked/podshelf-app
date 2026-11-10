<template>
  <div class="w-full bg-md-surface-3/40">
    <div class="w-full h-14 flex items-center px-4 bg-md-surface-3">
      <p class="pr-4">{{ strings.HeaderCollectionItems }}</p>

      <div class="w-6 h-6 md:w-7 md:h-7 bg-md-on-surface/10 rounded-full flex items-center justify-center">
        <span class="text-xs md:text-sm font-mono leading-none">{{ books.length }}</span>
      </div>

      <div class="flex-grow" />
      <p v-if="totalDuration" class="text-sm text-md-on-surface">{{ totalDurationPretty }}</p>
    </div>
    <template v-for="book in booksCopy" :key="book.id">
      <tables-collection-book-table-row :book="book" :collection-id="collectionId" class="item collection-book-item" @edit="editBook" />
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  collectionId?: string
  books: Record<string, unknown>[]
}>()

const strings = useStrings()
const utils = useUtils()

const booksCopy = ref<Record<string, unknown>[]>([])

const totalDuration = computed(() => {
  let _total = 0
  props.books.forEach((book) => {
    _total += ((book.media as Record<string, unknown> | null | undefined)?.duration as number) || 0
  })
  return _total
})

const totalDurationPretty = computed(() => utils.elapsedPrettyExtended(totalDuration.value))

function editBook(_book: Record<string, unknown>) {
  // setBookshelfBookIds / showEditModal are legacy Vuex mutations not yet ported — no-op
}

function init() {
  booksCopy.value = props.books.map((b) => ({ ...b }))
}

watch(() => props.books, () => {
  init()
})

onMounted(() => {
  init()
})
</script>

<style>
.collection-book-item {
  transition: all 0.4s ease;
}

.collection-book-enter-from,
.collection-book-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.collection-book-leave-active {
  position: absolute;
}
</style>