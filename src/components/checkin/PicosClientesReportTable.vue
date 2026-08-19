<script setup>
import { ref, computed } from 'vue'
import DateRangeToolbar from './DateRangeToolbar.vue'
import PeakHoursChart from './PeakHoursChart.vue'
import { toSeconds, toTime } from '@/utils/reportTime'
import { SITIOS } from '@/utils/cajerasSucursalHelpers'

const props = defineProps({
  rows: { type: Array, required: true },
  dateStart: { type: String, required: true },
  dateEnd: { type: String, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:dateStart', 'update:dateEnd', 'shift', 'refresh'])

const siteFilter = ref(SITIOS[0].id)

// Horario de tienda: abre 8:30, cierra 18:00. La gráfica siempre cubre este
// rango completo (aunque no haya turnos en algunas horas) para que la curva
// suba desde la apertura y baje hasta el cierre en vez de cortarse en seco.
const STORE_OPEN_HOUR = 8.5
const STORE_CLOSE_HOUR = 18

const filteredRows = computed(() => {
  const start = props.dateStart ? new Date(props.dateStart + 'T00:00:00') : null
  const end = props.dateEnd ? new Date(props.dateEnd + 'T23:59:59') : null
  return props.rows.filter((r) => {
    if (String(r.site ?? '') !== siteFilter.value) return false
    if (!r.arrive_at) return false
    const d = new Date(r.arrive_at)
    if (isNaN(d)) return false
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
})

// Franjas horarias: la primera va de 8:30 (apertura) a 9:00, luego una por
// cada hora completa hasta el cierre (18:00). Si hay turnos fuera de este
// rango (no debería, la tienda está cerrada) se acumulan en la franja más
// cercana en vez de perderse.
const bucketEdges = computed(() => {
  const edges = [STORE_OPEN_HOUR]
  for (let h = Math.ceil(STORE_OPEN_HOUR); h < STORE_CLOSE_HOUR; h++) edges.push(h)
  edges.push(STORE_CLOSE_HOUR)
  return edges
})

// Solo cuentan los que llegaron a que un agente de piso les creara el pedido
// ahí mismo -- no los que llegan con pedido de página web o ya agendado.
function isCreatedByFloorAgent(r) {
  const creator = String(r.created_by_name || '').trim().toUpperCase()
  return creator !== '' && creator !== 'PAGINA WEB'
}

// Los picos son tráfico de piso real: pausados y cancelados no cuentan
// (nunca llegaron a estar en fila esperando pedido/creando pedido de forma
// normal). El resto sí cuenta, aunque después haya avanzado a pagado/entregado.
const peakRows = computed(() =>
  filteredRows.value.filter((r) =>
    !['canceled', 'cancelled', 'paused'].includes(String(r.status || '').toLowerCase()) && isCreatedByFloorAgent(r),
  ),
)

const peakSeries = computed(() => {
  const edges = bucketEdges.value
  const buckets = edges.slice(0, -1).map((hour, i) => ({ hour, end: edges[i + 1], count: 0 }))
  for (const r of peakRows.value) {
    const d = new Date(r.arrive_at)
    const hourFloat = d.getHours() + d.getMinutes() / 60
    const bucket = buckets.find((b) => hourFloat >= b.hour && hourFloat < b.end)
      || (hourFloat < buckets[0].hour ? buckets[0] : buckets[buckets.length - 1])
    bucket.count++
  }
  return buckets
})

// Ancla visual para que la línea baje hasta 0 justo en el cierre (18:00) en
// vez de detenerse en seco en la última franja real (17:00-18:00). No se
// muestra en la tabla de abajo, solo alimenta la gráfica.
const chartPoints = computed(() => {
  if (!peakSeries.value.length) return []
  return [...peakSeries.value, { hour: STORE_CLOSE_HOUR, count: 0 }]
})

const peak = computed(() => {
  if (!peakSeries.value.length) return null
  return peakSeries.value.reduce((best, p) => (p.count > best.count ? p : best), peakSeries.value[0])
})

// Agente más eficiente por día: prioridad a más turnos creados; en empate,
// desempata el menor promedio de tiempo de creación del pedido.
const dailyAgentStats = computed(() => {
  const byDate = new Map()
  for (const r of filteredRows.value) {
    if (['canceled', 'cancelled'].includes(String(r.status || '').toLowerCase())) continue
    if (!isCreatedByFloorAgent(r)) continue
    const agent = r.created_by_name
    const date = String(r.arrive_at || '').slice(0, 10)
    if (!agent || !date) continue
    if (!byDate.has(date)) byDate.set(date, new Map())
    const byAgent = byDate.get(date)
    if (!byAgent.has(agent)) byAgent.set(agent, { agent, turnosCreados: 0, seconds: [] })
    const stat = byAgent.get(agent)
    stat.turnosCreados++
    const secs = toSeconds(r.diff_created_order)
    if (secs !== null) stat.seconds.push(secs)
  }

  const result = []
  for (const [date, byAgent] of byDate) {
    const agents = Array.from(byAgent.values())
      .map((s) => ({
        agent: s.agent,
        turnosCreados: s.turnosCreados,
        avgSeconds: s.seconds.length ? s.seconds.reduce((a, b) => a + b, 0) / s.seconds.length : Infinity,
      }))
      .sort((a, b) => b.turnosCreados - a.turnosCreados || a.avgSeconds - b.avgSeconds)
    result.push({ date, agents })
  }
  return result.sort((a, b) => a.date.localeCompare(b.date))
})

function fmtHour(h) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function bucketRangeLabel(p) {
  return `${fmtHour(p.hour)} - ${fmtHour(p.end)}`
}

function fmtArriveTime(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Al hacer clic en una franja se muestra el detalle de los turnos que
// componen ese conteo, para poder auditar la cifra sin salir de la vista.
const selectedBucket = ref(null)

function selectBucket(p) {
  selectedBucket.value = selectedBucket.value?.hour === p.hour ? null : p
}

const selectedBucketRows = computed(() => {
  if (!selectedBucket.value) return []
  const { hour, end } = selectedBucket.value
  return peakRows.value
    .filter((r) => {
      const d = new Date(r.arrive_at)
      const hourFloat = d.getHours() + d.getMinutes() / 60
      return hourFloat >= hour && hourFloat < end
    })
    .sort((a, b) => new Date(a.arrive_at) - new Date(b.arrive_at))
})
</script>

<template>
  <div>
    <DateRangeToolbar
      class="mb-2"
      :date-start="dateStart"
      :date-end="dateEnd"
      :loading="loading"
      @update:date-start="emit('update:dateStart', $event)"
      @update:date-end="emit('update:dateEnd', $event)"
      @shift="emit('shift', $event)"
      @refresh="emit('refresh')"
    >
      <div class="flex items-center gap-1">
        <select v-model="siteFilter" class="select select-bordered select-sm w-36">
          <option v-for="s in SITIOS" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
      </div>
    </DateRangeToolbar>

    <div v-if="loading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else-if="!peakSeries.length" class="text-center text-base-content/40 py-16">Sin registros.</div>

    <div v-else class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_460px] gap-8 items-start">
      <div class="flex flex-col gap-3 min-w-0">
        <div class="flex items-baseline gap-3 flex-wrap">
          <h3 class="text-base font-bold">Picos de Clientes por Hora</h3>
          <span class="text-sm text-base-content/60">
            Pico del rango: <b class="text-base-content">{{ bucketRangeLabel(peak) }}</b> con <b class="text-base-content">{{ peak.count }}</b> clientes
          </span>
        </div>

        <div class="card bg-base-100 border border-base-300 p-4">
          <PeakHoursChart :points="chartPoints" />
        </div>

        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr class="text-sm"><th>Franja horaria</th><th>Clientes</th></tr>
            </thead>
            <tbody>
              <tr
                v-for="p in peakSeries" :key="p.hour" class="text-sm cursor-pointer hover:bg-base-200"
                :class="[
                  p.hour === peak.hour ? 'bg-primary/10 font-semibold' : '',
                  selectedBucket?.hour === p.hour ? 'outline outline-2 outline-primary outline-offset-[-2px]' : '',
                ]"
                @click="selectBucket(p)"
              >
                <td>{{ bucketRangeLabel(p) }}</td>
                <td class="flex items-center gap-2">
                  {{ p.count }}
                  <span v-if="p.hour === peak.hour" class="badge badge-primary badge-sm">Pico</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="selectedBucket" class="card bg-base-100 border border-base-300 p-4">
          <div class="flex items-center justify-between mb-2">
            <h4 class="font-bold text-sm">
              Detalle {{ bucketRangeLabel(selectedBucket) }} — {{ selectedBucketRows.length }} cliente(s)
            </h4>
            <button class="btn btn-xs btn-ghost" @click="selectedBucket = null">✕</button>
          </div>
          <div class="overflow-auto max-h-80">
            <table class="table table-xs">
              <thead>
                <tr class="text-xs">
                  <th>Turno</th><th>Cliente</th><th>Pedido</th><th>Estado Final</th><th>Hora</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in selectedBucketRows" :key="r.id" class="text-xs">
                  <td>{{ r.turn }}</td>
                  <td class="max-w-40 truncate" :title="r.name">{{ r.name }}</td>
                  <td>{{ r.erp_order_grouped }}</td>
                  <td>{{ r.status_label }}</td>
                  <td>{{ fmtArriveTime(r.arrive_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="dailyAgentStats.length" class="flex flex-col gap-3 min-w-0">
        <h3 class="text-lg font-bold">Agente Más Eficiente por Día</h3>
        <div class="flex flex-col gap-4">
          <div v-for="d in dailyAgentStats" :key="d.date" class="card bg-base-100 border border-base-300 p-6">
            <div class="text-sm text-base-content/60">{{ d.date }}</div>
            <div class="text-2xl font-bold leading-snug mt-1">🏆 {{ d.agents[0].agent }}</div>
            <div class="flex items-center gap-5 text-lg text-base-content/70 mt-3">
              <span>📦 {{ d.agents[0].turnosCreados }} turnos</span>
              <span>⏱️ {{ d.agents[0].avgSeconds === Infinity ? '—' : toTime(d.agents[0].avgSeconds) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
