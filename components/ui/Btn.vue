<template>
  <nuxt-link v-if="to" :to="to" :class="classList" @click="click">
    <span v-if="loading" class="absolute inset-0 flex items-center justify-center bg-inherit rounded-inherit">
      <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
    </span>
    <slot />
  </nuxt-link>
  <button v-else :type="type || 'button'" :disabled="disabled || loading" :class="classList" @click="click">
    <span v-if="loading" class="absolute inset-0 flex items-center justify-center bg-inherit">
      <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
    </span>
    <slot />
  </button>
</template>

<script setup lang="ts">
const props = defineProps<{
  to?: string
  variant?: string // filled | filled-tonal | outlined | text | elevated
  color?: string   // backward-compat
  type?: 'button' | 'submit' | 'reset'
  paddingX?: number
  paddingY?: number
  small?: boolean
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  click: [e: MouseEvent]
}>()

const variant = computed(() => props.variant ?? 'filled')
const color = computed(() => props.color ?? 'primary')

const classList = computed(() => {
  const base = [
    'inline-flex items-center justify-center gap-2 font-medium select-none',
    'text-md-label-l rounded-md-full transition-md-standard relative overflow-hidden',
    'active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-md-primary',
    props.small ? 'h-8 px-4 text-md-label-m' : 'h-10 px-6',
    props.paddingX != null ? `px-${props.paddingX}` : '',
    props.paddingY != null ? `py-${props.paddingY}` : '',
    (props.disabled || props.loading) ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
  ]

  const variants: Record<string, string> = {
    'filled':       'bg-md-primary text-md-on-primary hover:brightness-110 active:brightness-90',
    'filled-tonal': 'bg-md-primary-container text-md-on-primary-container hover:brightness-110',
    'outlined':     'bg-transparent border border-md-outline text-md-primary hover:bg-md-primary/10',
    'text':         'bg-transparent text-md-primary hover:bg-md-primary/10 px-3',
    'elevated':     'bg-md-surface-1 text-md-primary elevation-1 hover:elevation-2'
  }

  // backward-compat: map old color prop to specific bg
  const legacyColorMap: Record<string, string> = {
    success:     'bg-md-primary text-white hover:brightness-110',
    warning:     'bg-warning text-white hover:brightness-110',
    error:       'bg-error text-white hover:brightness-110',
    info:        'bg-info text-white hover:brightness-110',
    successDark: 'bg-successDark text-white hover:brightness-110',
  }

  const variantClass = legacyColorMap[color.value] || variants[variant.value] || variants.filled

  return [...base, variantClass].filter(Boolean).join(' ')
})

function click(e: MouseEvent) {
  if (!props.disabled && !props.loading) emit('click', e)
}
</script>
