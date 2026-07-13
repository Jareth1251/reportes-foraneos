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
const fieldCount = Object.keys(DETALLE_FIELDS).length

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
            <th v-for="(label, field) in DETALLE_FIELDS" :key="field">{{ label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="realDetail.length === 0"><td :colspan="fieldCount" class="text-center text-base-content/40">Sin registros.</td></tr>
          <tr v-for="(r, i) in realDetail" :key="r.id ?? i" class="text-sm">
            <td v-for="(label, field) in DETALLE_FIELDS" :key="field" :class="{ 'max-w-48 truncate': field === 'name' }" :title="field === 'name' ? r.name : undefined">
              {{ field === 'arrive_at' ? String(r.arrive_at || '').slice(0, 10) : r[field] }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
