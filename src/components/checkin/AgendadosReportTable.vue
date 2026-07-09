<script setup>
import { computed } from 'vue'
import DateRangeToolbar from './DateRangeToolbar.vue'
import { exportToExcel } from '@/utils/excelExport'
import { DETALLE_FIELDS } from './reportFields'

const props = defineProps({
  rows: { type: Array, required: true },
  dateStart: { type: String, required: true },
  dateEnd: { type: String, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:dateStart', 'update:dateEnd', 'shift', 'refresh'])

const agendadosDetail = computed(() => props.rows.filter((r) => Number(r.turn) === 0))
const agendadosOrdersCount = computed(() => agendadosDetail.value.reduce((acc, r) => acc + (r.erp_order_count || 0), 0))

function exportAgendados() {
  exportToExcel(agendadosDetail.value, DETALLE_FIELDS, `ReporteAgendados_${props.dateStart}_a_${props.dateEnd}.xlsx`)
}
</script>

<template>
  <div>
    <DateRangeToolbar
      class="mb-4"
      :date-start="dateStart"
      :date-end="dateEnd"
      :loading="loading"
      @update:date-start="emit('update:dateStart', $event)"
      @update:date-end="emit('update:dateEnd', $event)"
      @shift="emit('shift', $event)"
      @refresh="emit('refresh')"
    >
      <template #actions>
        <button class="btn btn-sm btn-success" @click="exportAgendados">⬇ Exportar Excel</button>
      </template>
    </DateRangeToolbar>

    <div v-if="loading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else class="overflow-x-auto">
      <p class="text-sm text-base-content/60 mb-2">Conteo de pedidos: {{ agendadosOrdersCount }} • {{ agendadosDetail.length }} registros</p>
      <table class="table table-sm">
        <thead>
          <tr class="text-sm">
            <th>Cliente</th><th>Pedido</th><th>Cant.</th><th>Estado</th>
            <th>Llegó</th><th>Empezó a surtir</th><th>Se surtió</th>
            <th>Empezó a entregar</th><th>Se entregó</th><th>Se canceló</th>
            <th>T. almacén</th><th>T. total</th><th>Lo surtió</th><th>Lo entregó</th>
            <th>Razón cancelación</th><th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="agendadosDetail.length === 0"><td colspan="16" class="text-center text-base-content/40">Sin registros.</td></tr>
          <tr v-for="(r, i) in agendadosDetail" :key="r.id ?? i" class="text-sm">
            <td class="max-w-48 truncate" :title="r.name">{{ r.name }}</td>
            <td>{{ r.erp_order_grouped }}</td><td>{{ r.quantity }}</td><td>{{ r.status_label }}</td>
            <td>{{ r.time_arrive_at }}</td><td>{{ r.time_at_stock_at }}</td><td>{{ r.time_stocked_at }}</td>
            <td>{{ r.time_at_deliver_at }}</td><td>{{ r.time_delivered_at }}</td><td>{{ r.time_canceled_at }}</td>
            <td>{{ r.diff_warehouse_at }}</td><td>{{ r.diff_total_at }}</td>
            <td>{{ r.usr_name_at_stock }}</td><td>{{ r.usr_name_delivered }}</td>
            <td>{{ r.cancel_comment }}</td><td>{{ String(r.arrive_at || '').slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
