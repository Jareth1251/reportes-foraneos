<script setup>
import { ref, computed } from 'vue'
import DateRangeToolbar from './DateRangeToolbar.vue'
import { exportToExcel } from '@/utils/excelExport'
import { getAverageTime, normalize } from '@/utils/reportTime'
import { PISO_FIELDS } from './reportFields'

const props = defineProps({
  rows: { type: Array, required: true },
  dateStart: { type: String, required: true },
  dateEnd: { type: String, required: true },
  loading: { type: Boolean, default: false },
  spid: { type: String, default: '' },
})

const emit = defineEmits(['update:dateStart', 'update:dateEnd', 'shift', 'refresh'])

const pisoAgentFilter = ref('')

const pisoDetail = computed(() => {
  const q = normalize(pisoAgentFilter.value)
  if (!q) return props.rows
  return props.rows.filter((r) =>
    normalize(r.usr_name_order_created || '').includes(q) ||
    normalize(r.usr_name_creating_order || '').includes(q) ||
    normalize(r.usr_name_canceled || '').includes(q),
  )
})

const pisoCounts = computed(() => {
  const items = pisoDetail.value
  const web = items.filter((i) => String(i.created_by_name || '').trim().toUpperCase() === 'PAGINA WEB').length
  const piso = items.length - web
  const canceled = items.filter((i) => ['canceled', 'cancelled'].includes(String(i.status || '').toLowerCase())).length
  const created = items.filter((i) => i.usr_name_order_created || i.usr_name_creating_order).length
  return { web, piso, total: items.length, canceled, created }
})

function exportPiso() {
  exportToExcel(pisoDetail.value, PISO_FIELDS, `ReportePiso_${props.dateStart}_a_${props.dateEnd}.xlsx`)
}
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
        <input v-model="pisoAgentFilter" type="text" placeholder="Filtrar por Agente de Piso..." class="input input-bordered input-sm w-56" />
        <button v-if="pisoAgentFilter" class="btn btn-sm btn-ghost" @click="pisoAgentFilter = ''">✕</button>
      </div>
      <template #actions>
        <button class="btn btn-sm btn-success" @click="exportPiso">⬇ Exportar Excel</button>
      </template>
    </DateRangeToolbar>

    <div class="text-sm mb-4">
      <h4 class="font-bold mb-1">Promedios</h4>
      <ul class="list-none space-y-0.5">
        <li v-if="['VYAM', 'VRAT'].includes(spid)">⏱️ Promedio Atención Cliente: {{ getAverageTime(pisoDetail, 'diff_creating_order_at') }}</li>
        <li>⏱️ Tiempo Creación Pedido Promedio: {{ getAverageTime(pisoDetail, 'diff_created_order') }}</li>
        <li>📦 Pedidos creados por este agente: {{ pisoCounts.created }}</li>
        <li>🌐 Pedidos creados por PAGINA WEB: {{ pisoCounts.web }}</li>
        <li>🏬 Pedidos creados en PISO: {{ pisoCounts.piso }}</li>
        <li>❌ Pedidos cancelados: {{ pisoCounts.canceled }}</li>
      </ul>
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else class="overflow-x-auto">
      <table class="table table-sm">
        <thead>
          <tr class="text-sm">
            <th>Turno</th><th>Cliente</th><th>Pedido</th><th>Cant.</th><th>Estado Final</th>
            <th>Registró Turno</th><th>Razón Cancelación</th><th>Lo canceló</th>
            <th>T. Creación Pedido</th><th>Le creó el Pedido</th><th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="pisoDetail.length === 0"><td colspan="11" class="text-center text-base-content/40">Sin registros.</td></tr>
          <tr v-for="(r, i) in pisoDetail" :key="r.id ?? i" class="text-sm">
            <td>{{ r.turn }}</td><td class="max-w-48 truncate" :title="r.name">{{ r.name }}</td>
            <td>{{ r.erp_order_grouped }}</td><td>{{ r.quantity }}</td><td>{{ r.status_label }}</td>
            <td>{{ r.usr_arrive_name }}</td><td>{{ r.cancel_comment }}</td><td>{{ r.usr_name_canceled }}</td>
            <td>{{ r.diff_created_order }}</td><td>{{ r.created_by_name }}</td>
            <td>{{ String(r.arrive_at || '').slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
