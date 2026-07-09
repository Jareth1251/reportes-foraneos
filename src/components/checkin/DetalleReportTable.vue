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

const realDetail = computed(() => props.rows.filter((r) => Number(r.turn) > 0))
const totalOrdersCount = computed(() => realDetail.value.reduce((acc, r) => acc + (r.erp_order_count || 0), 0))

function exportDetalle() {
  exportToExcel(realDetail.value, DETALLE_FIELDS, `ReporteTurnos_${props.dateStart}_a_${props.dateEnd}.xlsx`)
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
        <button class="btn btn-sm btn-success" @click="exportDetalle">⬇ Exportar Excel</button>
      </template>
    </DateRangeToolbar>

    <div v-if="loading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else class="overflow-x-auto">
      <p class="text-sm text-base-content/60 mb-2">Conteo de pedidos: {{ totalOrdersCount }} • {{ realDetail.length }} turnos</p>
      <table class="table table-sm">
        <thead>
          <tr class="text-sm">
            <th>Turno</th><th>Cliente</th><th>Pedido</th><th>Cant.</th><th>Estado</th>
            <th>Llegó</th><th>Registró Turno</th>
            <th>Lo atendió piso</th><th>Se creó pedido</th><th>Lo atendió cajas</th>
            <th>Finalizó Pago</th><th>Empezó a surtir</th><th>Se surtió</th>
            <th>Empezó a entregar</th><th>Se entregó</th><th>Se canceló</th>
            <th>T. atención piso</th><th>T. creación pedido</th><th>T. atención cajas</th>
            <th>T. pago</th><th>T. en almacén</th><th>T. surtir</th><th>T. entrega</th>
            <th>T. total tienda</th><th>Motivo pausa</th><th>T. pausado</th>
            <th>Razón cancelación</th><th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="realDetail.length === 0"><td colspan="27" class="text-center text-base-content/40">Sin registros.</td></tr>
          <tr v-for="(r, i) in realDetail" :key="r.id ?? i" class="text-sm">
            <td>{{ r.turn }}</td><td class="max-w-48 truncate" :title="r.name">{{ r.name }}</td>
            <td>{{ r.erp_order_grouped }}</td><td>{{ r.quantity }}</td><td>{{ r.status_label }}</td>
            <td>{{ r.time_arrive_at }}</td><td>{{ r.usr_arrive_name }}</td>
            <td>{{ r.time_creating_order_at }}</td><td>{{ r.time_order_created_at }}</td><td>{{ r.time_paying_at }}</td>
            <td>{{ r.time_order_received_at }}</td><td>{{ r.time_at_stock_at }}</td><td>{{ r.time_stocked_at }}</td>
            <td>{{ r.time_at_deliver_at }}</td><td>{{ r.time_delivered_at }}</td><td>{{ r.time_canceled_at }}</td>
            <td>{{ r.diff_creating_order_at }}</td><td>{{ r.diff_order_created_at }}</td><td>{{ r.diff_paying_at }}</td>
            <td>{{ r.diff_payment_time }}</td><td>{{ r.diff_warehouse_at }}</td><td>{{ r.diff_stocked_at }}</td><td>{{ r.diff_delivered_at }}</td>
            <td>{{ r.diff_total_at }}</td><td>{{ r.paused_comment }}</td><td>{{ r.diffpaused_at }}</td>
            <td>{{ r.cancel_comment }}</td><td>{{ String(r.arrive_at || '').slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
