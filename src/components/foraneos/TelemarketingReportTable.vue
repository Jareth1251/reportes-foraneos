<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { normalize } from '@/utils/reportTime'
import { exportToExcel } from '@/utils/excelExport'

const props = defineProps({
  dateStart: { type: String, default: '' },
  dateEnd: { type: String, default: '' },
})

// Reporte armado en el backend (routes/telemarketing.js): parte del QAD para
// saber TODOS los pedidos que creó cada agente del dept 005 y los cruza con
// remote_orders para el estado real (entregado / facturado / creado sin facturar).
const rows = ref([])
const agentsFailed = ref([])
const loading = ref(false)
const errored = ref(false)

async function fetchReport() {
  loading.value = true
  errored.value = false
  try {
    const params = new URLSearchParams({ from: props.dateStart, to: props.dateEnd })
    const res = await fetch(`/node-api/telemarketing-report?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    rows.value = Array.isArray(data?.rows) ? data.rows : []
    agentsFailed.value = Array.isArray(data?.agents_failed) ? data.agents_failed : []
  } catch (err) {
    console.error('[telemarketing-report]', err)
    rows.value = []
    errored.value = true
  } finally {
    loading.value = false
  }
}

onMounted(fetchReport)
watch(() => [props.dateStart, props.dateEnd], fetchReport)

// ── Filtro ────────────────────────────────────────────────────────────────
const agentFilter = ref('')

const filteredRows = computed(() => {
  const q = normalize(agentFilter.value)
  if (!q) return rows.value
  return rows.value.filter((r) =>
    normalize(r.agente || '').includes(q) ||
    normalize(r.agente_code || '').includes(q),
  )
})

// Se recalcula sobre las filas visibles, así responde al filtro de agente.
const summary = computed(() => {
  const list = filteredRows.value
  return {
    total: list.length,
    facturados: list.filter((r) => r.facturado).length,
    entregados: list.filter((r) => r.entregado).length,
    sin_facturar: list.filter((r) => !r.facturado).length,
    en_flujo_foraneo: list.filter((r) => r.in_remote_orders).length,
  }
})

function estadoClass(estado) {
  switch (estado) {
    case 'Entregado': return 'text-green-700 font-semibold'
    case 'Facturado': return 'text-blue-700'
    case 'En proceso': return 'text-amber-600'
    case 'Devuelto': return 'text-red-600'
    case 'Creado sin facturar': return 'text-base-content/60'
    default: return ''
  }
}

// ── Exportar ──────────────────────────────────────────────────────────────
const EXPORT_FIELDS = {
  customer_name: 'Cliente',
  erp_order_id: 'Pedido',
  agente: 'Agente Telemarketing',
  estado: 'Estado',
  invoice_id: 'Factura',
  carrier: 'Paquetería',
  fecha: 'Fecha',
}

function exportReport() {
  const data = filteredRows.value.map((r) => ({
    ...r,
    invoice_id: r.invoice_id || '',
    carrier: r.carrier || '',
  }))
  exportToExcel(data, EXPORT_FIELDS, `ReporteTelemarketing_${props.dateStart}_a_${props.dateEnd}.xlsx`)
}
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap gap-3 items-center">
      <div class="flex items-center gap-1">
        <input
          v-model="agentFilter"
          type="text"
          placeholder="Filtrar por Agente de Telemarketing..."
          class="input input-bordered input-sm w-64"
        />
        <button v-if="agentFilter" class="btn btn-sm btn-ghost" @click="agentFilter = ''">✕</button>
      </div>
      <div class="ml-auto flex gap-2">
        <button class="btn btn-sm" @click="fetchReport">↻ Actualizar</button>
        <button class="btn btn-sm btn-success" :disabled="filteredRows.length === 0" @click="exportReport">
          ⬇ Exportar Excel
        </button>
      </div>
    </div>

    <div v-if="!loading && !errored" class="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <span><b>{{ summary.total }}</b> creados</span>
      <span class="text-blue-700"><b>{{ summary.facturados }}</b> facturados</span>
      <span class="text-green-700"><b>{{ summary.entregados }}</b> entregados</span>
      <span class="text-base-content/60"><b>{{ summary.sin_facturar }}</b> sin facturar</span>
      <span class="text-base-content/50">{{ summary.en_flujo_foraneo }} en flujo foráneo</span>
    </div>

    <div v-if="agentsFailed.length" class="mb-3 text-xs text-amber-600">
      ⚠ No se pudo consultar QAD para: {{ agentsFailed.join(', ') }}
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else-if="errored" class="text-error py-6">
      No se pudo generar el reporte. Revisa la conexión con QAD e intenta de nuevo.
    </div>

    <div v-else class="card bg-base-100 shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table table-sm w-full">
          <thead class="sticky top-0 bg-base-200 z-10 text-sm font-bold">
            <tr>
              <th>Cliente</th><th>Pedido</th><th>Agente Telemarketing</th>
              <th>Estado</th><th>Factura</th><th>Paquetería</th><th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredRows.length === 0">
              <td colspan="7" class="text-center text-base-content/40">Sin registros.</td>
            </tr>
            <tr v-for="r in filteredRows" :key="r.erp_order_id" class="text-sm">
              <td>{{ r.customer_name || '—' }}</td>
              <td class="tabular-nums whitespace-nowrap">{{ r.erp_order_id || '—' }}</td>
              <td class="whitespace-nowrap">{{ r.agente || '—' }}</td>
              <td class="whitespace-nowrap" :class="estadoClass(r.estado)">{{ r.estado }}</td>
              <td class="tabular-nums whitespace-nowrap">{{ r.invoice_id || '—' }}</td>
              <td class="whitespace-nowrap">{{ r.carrier || '—' }}</td>
              <td class="tabular-nums whitespace-nowrap">{{ r.fecha || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
