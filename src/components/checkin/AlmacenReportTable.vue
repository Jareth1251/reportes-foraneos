<script setup>
import { computed } from 'vue'
import DateRangeToolbar from './DateRangeToolbar.vue'
import { exportToExcel } from '@/utils/excelExport'
import { getAverageTime } from '@/utils/reportTime'
import { ALMACEN_FIELDS } from './reportFields'

const props = defineProps({
  rows: { type: Array, required: true },
  dateStart: { type: String, required: true },
  dateEnd: { type: String, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:dateStart', 'update:dateEnd', 'shift', 'refresh'])

const ALMACEN_STATUSES = ['stocked', 'at_stock', 'at_deliver', 'delivered', 'empacando', 'enviado', 'entregado']
const almacenDetail = computed(() => props.rows.filter((r) => ALMACEN_STATUSES.includes(r.status)))
const almacenOrdersCount = computed(() => almacenDetail.value.reduce((acc, r) => acc + (r.erp_order_count || 0), 0))

function exportAlmacen() {
  exportToExcel(almacenDetail.value, ALMACEN_FIELDS, `ReporteAlmacen_${props.dateStart}_a_${props.dateEnd}.xlsx`)
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
      <template #actions>
        <button class="btn btn-sm btn-success" @click="exportAlmacen">⬇ Exportar Excel</button>
      </template>
    </DateRangeToolbar>

    <div class="text-sm mb-4">
      <h4 class="font-bold mb-1">Promedios</h4>
      <ul class="list-none space-y-0.5">
        <li>⏱️ Tiempo Total Promedio: {{ getAverageTime(almacenDetail, 'diff_total_at') }}</li>
        <li>📦 Recibe a Asignar Surtidor: {{ getAverageTime(almacenDetail, 'diff_at_stock_at') }}</li>
        <li>📦 Surtiendo / surtido: {{ getAverageTime(almacenDetail, 'diff_stocked_at') }}</li>
        <li>🚚 Tiempo surtido a entrega: {{ getAverageTime(almacenDetail, 'diff_surtido_entregado') }}</li>
      </ul>
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else class="overflow-x-auto">
      <p class="text-sm text-base-content/60 mb-2">Conteo de pedidos: {{ almacenOrdersCount }} • {{ almacenDetail.length }} turnos</p>
      <table class="table table-sm">
        <thead>
          <tr class="text-sm">
            <th>Turno</th><th>Cliente</th><th>Pedido</th><th>Cant.</th><th>Estado</th>
            <th>T. Total</th><th>Recibe/Asigna Surtidor</th><th>Surtiendo/Surtido</th><th>Surtido/Entregado</th>
            <th>Lo atendió en Almacén</th><th>Lo surtió</th><th>Lo entregó</th><th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="almacenDetail.length === 0"><td colspan="13" class="text-center text-base-content/40">Sin registros.</td></tr>
          <tr v-for="(r, i) in almacenDetail" :key="r.id ?? i" class="text-sm">
            <td>{{ r.turn }}</td><td class="max-w-48 truncate" :title="r.name">{{ r.name }}</td>
            <td>{{ r.erp_order_grouped }}</td><td>{{ r.quantity }}</td><td>{{ r.status_label }}</td>
            <td>{{ r.diff_total_at }}</td><td>{{ r.diff_at_stock_at }}</td><td>{{ r.diff_stocked_at }}</td><td>{{ r.diff_surtido_entregado }}</td>
            <td>{{ r.usr_name_stocked }}</td><td>{{ r.usr_name_at_stock }}</td><td>{{ r.usr_name_delivered }}</td>
            <td>{{ String(r.arrive_at || '').slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
