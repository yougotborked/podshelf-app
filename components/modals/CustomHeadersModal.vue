<template>
  <modals-modal v-model="show" :width="'90%'" :max-width="'420px'" height="100%">
    <template #outer>
      <div class="absolute top-5 left-4 z-40">
        <p class="text-white text-2xl truncate">Custom Headers</p>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div ref="container" class="w-full rounded-lg bg-md-surface-3 border border-md-outline-variant overflow-y-auto overflow-x-hidden" style="max-height: 80vh" @click.stop>
        <div class="w-full h-full p-4" v-if="showAddHeader">
          <div class="mb-4">
            <ui-icon-btn icon="arrow_back" borderless @click="showAddHeader = false" />
          </div>
          <form @submit.prevent="submitForm">
            <ui-text-input-with-label v-model="newHeaderKey" label="Name" class="mb-2" />
            <ui-text-input-with-label v-model="newHeaderValue" label="Value" class="mb-4" />

            <ui-btn type="submit" class="w-full">Submit</ui-btn>
          </form>
        </div>
        <div class="w-full h-full p-4" v-else>
          <template v-for="[key, value] in Object.entries(headersCopy)" :key="key">
            <div class="w-full rounded-lg bg-md-on-surface/5 py-2 pl-4 pr-12 relative mb-2">
              <p class="text-base font-semibold text-md-on-surface leading-5">{{ key }}</p>
              <p class="text-sm text-md-on-surface-variant">{{ value }}</p>

              <div class="absolute top-0 bottom-0 right-0 h-full p-4 flex items-center justify-center text-error">
                <button @click="removeHeader(key)"><span class="material-symbols text-lg">delete</span></button>
              </div>
            </div>
          </template>
          <p v-if="!Object.keys(headersCopy).length" class="py-4 text-center">No Custom Headers</p>

          <div class="w-full flex justify-center pt-4">
            <ui-btn @click="showAddHeader = true" class="w-full">Add Custom Header</ui-btn>
          </div>
        </div>
      </div>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  customHeaders?: Record<string, string> | null
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  'update:customHeaders': [headers: Record<string, string>]
}>()

const newHeaderKey = ref('')
const newHeaderValue = ref('')
const headersCopy = ref<Record<string, string>>({})
const showAddHeader = ref(false)

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

watch(show, (val) => {
  if (val) init()
})

function removeHeader(key: string) {
  delete headersCopy.value[key]
  headersCopy.value = { ...headersCopy.value }
  emit('update:customHeaders', { ...headersCopy.value })
}

function submitForm() {
  console.log('Submit form', newHeaderKey.value, newHeaderValue.value)
  headersCopy.value[newHeaderKey.value] = newHeaderValue.value
  newHeaderKey.value = ''
  newHeaderValue.value = ''
  showAddHeader.value = false
  emit('update:customHeaders', { ...headersCopy.value })
}

function init() {
  newHeaderKey.value = ''
  newHeaderValue.value = ''
  headersCopy.value = props.customHeaders ? { ...props.customHeaders } : {}
}
</script>
