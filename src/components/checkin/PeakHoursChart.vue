<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  points: { type: Array, required: true }, // [{ hour, count }], una entrada por hora, ascendente, sin huecos
  checkpoints: { type: Array, default: () => [8.5, 11, 13, 15, 18] }, // horas de referencia (8:30, 11:00, 1:00, 3:00, 6:00)
})

const WIDTH = 640
const HEIGHT = 220
const PAD = { left: 32, right: 12, top: 36, bottom: 28 }
const chartWidth = WIDTH - PAD.left - PAD.right
const chartHeight = HEIGHT - PAD.top - PAD.bottom

const hourRange = computed(() => {
  if (!props.points.length) return [0, 1]
  return [props.points[0].hour, props.points[props.points.length - 1].hour]
})

const maxCount = computed(() => Math.max(1, ...props.points.map((p) => p.count)))

function xFor(hour) {
  const [min, max] = hourRange.value
  const span = max - min || 1
  return PAD.left + ((hour - min) / span) * chartWidth
}

function yFor(count) {
  return PAD.top + chartHeight - (count / maxCount.value) * chartHeight
}

function fmtHour(h) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const linePath = computed(() =>
  props.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.hour).toFixed(1)},${yFor(p.count).toFixed(1)}`).join(' '),
)

const areaPath = computed(() => {
  if (!props.points.length) return ''
  const base = PAD.top + chartHeight
  const first = props.points[0]
  const last = props.points[props.points.length - 1]
  const body = props.points.map((p) => `L${xFor(p.hour).toFixed(1)},${yFor(p.count).toFixed(1)}`).join(' ')
  return `M${xFor(first.hour).toFixed(1)},${base} ${body} L${xFor(last.hour).toFixed(1)},${base} Z`
})

const peak = computed(() => {
  if (!props.points.length) return null
  return props.points.reduce((best, p) => (p.count > best.count ? p : best), props.points[0])
})

const yTicks = computed(() => {
  const max = maxCount.value
  const step = Math.max(1, Math.ceil(max / 4))
  const ticks = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] !== max) ticks.push(max)
  return ticks
})

const visibleCheckpoints = computed(() => {
  const [min, max] = hourRange.value
  return props.checkpoints.filter((h) => h >= min && h <= max)
})

const hoveredIndex = ref(null)
const hovered = computed(() => (hoveredIndex.value === null ? null : props.points[hoveredIndex.value]))
const hoveredPos = computed(() => {
  if (!hovered.value) return null
  return { left: `${(xFor(hovered.value.hour) / WIDTH) * 100}%`, top: `${(yFor(hovered.value.count) / HEIGHT) * 100}%` }
})
</script>

<template>
  <div class="relative w-full">
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <!-- gridlines horizontales -->
      <line
        v-for="t in yTicks"
        :key="`grid-${t}`"
        :x1="PAD.left" :x2="WIDTH - PAD.right"
        :y1="yFor(t)" :y2="yFor(t)"
        stroke="currentColor" class="text-base-300" stroke-width="1"
      />
      <text
        v-for="t in yTicks"
        :key="`ytick-${t}`"
        :x="PAD.left - 6" :y="yFor(t) + 3"
        text-anchor="end" font-size="9" class="fill-base-content/50"
      >{{ t }}</text>

      <!-- referencias de horario (8:30, 11:00, 1:00, 3:00, 6:00) -->
      <g v-for="cp in visibleCheckpoints" :key="`cp-${cp}`">
        <line
          :x1="xFor(cp)" :x2="xFor(cp)"
          :y1="PAD.top" :y2="PAD.top + chartHeight"
          stroke="currentColor" class="text-base-300" stroke-width="1" stroke-dasharray="3,3"
        />
        <text :x="xFor(cp)" :y="HEIGHT - 8" text-anchor="middle" font-size="9" class="fill-base-content/50">{{ fmtHour(cp) }}</text>
      </g>

      <!-- área bajo la curva -->
      <path :d="areaPath" fill="#1d4ed8" fill-opacity="0.1" stroke="none" />

      <!-- línea -->
      <path :d="linePath" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

      <!-- puntos de cada hora (el pico se resalta aparte, más grande) -->
      <circle
        v-for="p in points" :key="`dot-${p.hour}`"
        v-show="p.hour !== peak?.hour"
        :cx="xFor(p.hour)" :cy="yFor(p.count)" r="3" fill="#1d4ed8" stroke="white" stroke-width="1.5"
      />

      <!-- pico resaltado -->
      <g v-if="peak">
        <circle :cx="xFor(peak.hour)" :cy="yFor(peak.count)" r="10" fill="none" stroke="#1d4ed8" stroke-width="2" />
        <circle :cx="xFor(peak.hour)" :cy="yFor(peak.count)" r="4" fill="#1d4ed8" stroke="white" stroke-width="2" />
        <text :x="xFor(peak.hour)" :y="yFor(peak.count) - 16" text-anchor="middle" font-size="9" font-weight="bold" class="fill-base-content/70">
          Pico: {{ peak.count }}
        </text>
      </g>

      <!-- puntos con hit target para hover -->
      <circle
        v-for="(p, i) in points" :key="`hit-${p.hour}`"
        :cx="xFor(p.hour)" :cy="yFor(p.count)" r="10" fill="transparent"
        @mouseenter="hoveredIndex = i" @mouseleave="hoveredIndex = null"
      />
      <circle
        v-if="hovered"
        :cx="xFor(hovered.hour)" :cy="yFor(hovered.count)" r="4" fill="#1d4ed8" stroke="white" stroke-width="2"
      />
    </svg>

    <div
      v-if="hovered"
      class="absolute pointer-events-none bg-base-content text-base-100 text-xs rounded px-2 py-1 -translate-x-1/2 -translate-y-full"
      :style="{ left: hoveredPos.left, top: hoveredPos.top, marginTop: '-6px' }"
    >{{ fmtHour(hovered.hour) }}h — {{ hovered.count }} cliente(s)</div>
  </div>
</template>
