<script setup>
import { onMounted, watch, toRef } from 'vue'
import ExcelJS from 'exceljs'
import DateRangeToolbar from './DateRangeToolbar.vue'
import { useCajerasReport } from '@/composables/useCajerasReport'
import { styleHeaderRow, downloadWorkbook } from '@/utils/excelExport'

const props = defineProps({
  rows: { type: Array, required: true },
  dateStart: { type: String, required: true },
  dateEnd: { type: String, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:dateStart', 'update:dateEnd', 'shift', 'refresh', 'setRange'])

const {
  foraneosLoading,
  fetchForaneosForCajeras,
  cajerasReport,
  cajeraTimingReport,
} = useCajerasReport(toRef(props, 'rows'), toRef(props, 'dateStart'), toRef(props, 'dateEnd'))

onMounted(fetchForaneosForCajeras)
watch(() => [props.dateStart, props.dateEnd], fetchForaneosForCajeras)

function handleRefresh() {
  emit('refresh')
  fetchForaneosForCajeras()
}

function setQuickRange(type) {
  const today = new Date()
  const hoy = today.toISOString().slice(0, 10)
  let start = hoy
  let end = hoy
  if (type === 'ayer') {
    const y = new Date(today); y.setDate(y.getDate() - 1)
    const ymd = y.toISOString().slice(0, 10)
    start = ymd; end = ymd
  } else if (type === '7d') {
    const s = new Date(today); s.setDate(s.getDate() - 6)
    start = s.toISOString().slice(0, 10); end = hoy
  } else if (type === 'mes') {
    const d = today
    start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    end   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
  }
  emit('setRange', { start, end })
}

async function exportCajeras() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Reporte de Turnos'
  wb.created = new Date()

  const wsResumen = wb.addWorksheet('Resumen Cajeras', { views: [{ state: 'frozen', ySplit: 1 }] })
  wsResumen.columns = [
    { header: 'Cajera', key: 'cajera', width: 28 },
    { header: 'Checkins Facturados', key: 'checkins', width: 22 },
    { header: 'Foráneos Facturados', key: 'foraneos', width: 22 },
    { header: 'Total', key: 'total', width: 12 },
  ]
  cajerasReport.value.forEach((r) => wsResumen.addRow(r))
  const totalRow = wsResumen.addRow({
    cajera: 'TOTAL',
    checkins: cajerasReport.value.reduce((s, r) => s + r.checkins, 0),
    foraneos: cajerasReport.value.reduce((s, r) => s + r.foraneos, 0),
    total: cajerasReport.value.reduce((s, r) => s + r.total, 0),
  })
  totalRow.font = { bold: true }
  styleHeaderRow(wsResumen)

  const wsPromedios = wb.addWorksheet('Promedios Atención', { views: [{ state: 'frozen', ySplit: 1 }] })
  wsPromedios.columns = [
    { header: 'Cajera', key: 'cajera', width: 28 },
    { header: 'Espera Checkin', key: 'avgEspera', width: 16 },
    { header: 'Cobro Checkin', key: 'avgCobro', width: 16 },
    { header: 'Total Checkin', key: 'avgTotalCheckin', width: 16 },
    { header: 'Creación → Factura (Foráneo)', key: 'avgForaneo', width: 28 },
  ]
  cajeraTimingReport.value.forEach((r) => wsPromedios.addRow({
    cajera: r.cajera,
    avgEspera: r.checkinCount ? r.avgEspera : '—',
    avgCobro: r.checkinCount ? r.avgCobro : '—',
    avgTotalCheckin: r.checkinCount ? r.avgTotalCheckin : '—',
    avgForaneo: r.foraneoCount ? r.avgForaneo : '—',
  }))
  styleHeaderRow(wsPromedios)

  await downloadWorkbook(wb, `ReporteCajeras_${props.dateStart}_a_${props.dateEnd}.xlsx`)
}
</script>

<template>
  <div>
    <DateRangeToolbar
      class="mb-4"
      :date-start="dateStart"
      :date-end="dateEnd"
      :loading="loading || foraneosLoading"
      @update:date-start="emit('update:dateStart', $event)"
      @update:date-end="emit('update:dateEnd', $event)"
      @shift="emit('shift', $event)"
      @refresh="handleRefresh"
    >
      <button class="btn btn-sm btn-outline btn-sm" @click="setQuickRange('hoy')">Hoy</button>
      <button class="btn btn-sm btn-outline btn-sm" @click="setQuickRange('ayer')">Ayer</button>
      <button class="btn btn-sm btn-outline btn-sm" @click="setQuickRange('7d')">7 días</button>
      <button class="btn btn-sm btn-outline btn-sm" @click="setQuickRange('mes')">Este mes</button>
      <template #actions>
        <button class="btn btn-sm btn-success" @click="exportCajeras">⬇ Exportar Excel</button>
      </template>
    </DateRangeToolbar>

    <div v-if="loading || foraneosLoading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else class="overflow-x-auto">
      <p class="text-sm text-base-content/60 mb-2">{{ cajerasReport.length }} cajera(s) · {{ dateStart }} — {{ dateEnd }}</p>
      <table class="table table-sm">
        <thead>
          <tr class="text-sm bg-base-200">
            <th>Cajera</th>
            <th class="text-center">Checkins Facturados</th>
            <th class="text-center">Foráneos Facturados</th>
            <th class="text-center font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="cajerasReport.length === 0">
            <td colspan="4" class="text-center text-base-content/40">Sin registros.</td>
          </tr>
          <tr v-for="row in cajerasReport" :key="row.cajera" class="text-sm">
            <td class="font-medium">{{ row.cajera }}</td>
            <td class="text-center">{{ row.checkins }}</td>
            <td class="text-center">{{ row.foraneos }}</td>
            <td class="text-center font-bold">{{ row.total }}</td>
          </tr>
          <tr v-if="cajerasReport.length > 0" class="font-bold bg-base-200 text-sm">
            <td>TOTAL</td>
            <td class="text-center">{{ cajerasReport.reduce((s, r) => s + r.checkins, 0) }}</td>
            <td class="text-center">{{ cajerasReport.reduce((s, r) => s + r.foraneos, 0) }}</td>
            <td class="text-center">{{ cajerasReport.reduce((s, r) => s + r.total, 0) }}</td>
          </tr>
        </tbody>
      </table>

      <h3 class="font-bold text-lg mt-6 mb-2">Promedios de Atención</h3>
      <table class="table table-sm">
        <thead>
          <tr class="text-sm bg-base-200">
            <th>Cajera</th>
            <th class="text-center">Espera Checkin</th>
            <th class="text-center">Cobro Checkin</th>
            <th class="text-center">Total Checkin</th>
            <th class="text-center">Creación → Factura (Foráneo)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="cajeraTimingReport.length === 0">
            <td colspan="5" class="text-center text-base-content/40">Sin registros.</td>
          </tr>
          <tr v-for="row in cajeraTimingReport" :key="row.cajera" class="text-sm">
            <td class="font-medium">{{ row.cajera }}</td>
            <td class="text-center">{{ row.checkinCount ? row.avgEspera : '—' }}</td>
            <td class="text-center">{{ row.checkinCount ? row.avgCobro : '—' }}</td>
            <td class="text-center">{{ row.checkinCount ? row.avgTotalCheckin : '—' }}</td>
            <td class="text-center">{{ row.foraneoCount ? row.avgForaneo : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
