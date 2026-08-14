<script setup lang="ts">
// A minimal canvas signature pad. White background + dark stroke so the stored
// PNG renders consistently in light or dark mode. Parent captures the drawing
// via the exposed toDataURL(); `change` fires as content appears/clears.
const emit = defineEmits<{ change: [hasContent: boolean] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let hasContent = false

function fillBackground() {
  if (!ctx || !canvas.value) return
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height)
}

onMounted(() => {
  const el = canvas.value
  if (!el) return
  ctx = el.getContext('2d')
  if (!ctx) return
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#111827'
  fillBackground()
})

// Map a pointer event to canvas pixel coordinates (canvas is CSS-scaled).
function pos(e: PointerEvent) {
  const el = canvas.value!
  const rect = el.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (el.width / rect.width),
    y: (e.clientY - rect.top) * (el.height / rect.height),
  }
}

function start(e: PointerEvent) {
  if (!ctx) return
  drawing = true
  canvas.value?.setPointerCapture(e.pointerId)
  const p = pos(e)
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}
function move(e: PointerEvent) {
  if (!drawing || !ctx) return
  const p = pos(e)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  if (!hasContent) {
    hasContent = true
    emit('change', true)
  }
}
function end() {
  drawing = false
}

function clear() {
  fillBackground()
  hasContent = false
  emit('change', false)
}
function toDataURL() {
  return canvas.value?.toDataURL('image/png') ?? ''
}
function isEmpty() {
  return !hasContent
}

defineExpose({ clear, toDataURL, isEmpty })
</script>

<template>
  <div class="flex flex-col gap-2">
    <canvas
      ref="canvas"
      width="600"
      height="180"
      class="w-full h-40 rounded-md border border-default touch-none cursor-crosshair bg-white"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="end"
      @pointerleave="end"
    />
    <div class="flex justify-end">
      <UButton label="Clear" icon="i-lucide-eraser" color="neutral" variant="ghost" size="xs" @click="clear" />
    </div>
  </div>
</template>
