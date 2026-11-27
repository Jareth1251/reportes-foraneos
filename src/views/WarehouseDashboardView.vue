<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import ExcelJS from 'exceljs'
import { useAuthStore } from '@/stores/auth'
import { SESSION_KEY } from '@/router'
import { useWarehouseDashboard } from '@/composables/useWarehouseDashboard'
import { fmtDmy } from '@/utils/warehouseWeek'
import { REPORT_HEADER_FILL, REPORT_HEADER_FONT, downloadWorkbook } from '@/utils/excelExport'

const router = useRouter()
if (!sessionStorage.getItem(SESSION_KEY)) {
  router.replace({ name: 'selector' })
}
const auth = useAuthStore()

const { week, loading, failures, loadedAt, views, fetchAll, shiftWeek, setWeekFromDate } = useWarehouseDashboard()

const MENU = [
  { key: 'general', label: 'Reporte general' },
  { key: 'tienda', label: 'Tienda' },
  { key: 'foraneo', label: 'Foráneo' },
  { key: 'domicilio', label: 'Domicilio' },
  { key: 'pagina', label: 'Página' },
  { key: 'mexico', label: 'México' },
  { key: 'errores', label: 'Errores MTY' },
  { key: 'erroresMx', label: 'Errores CDMX' },
  { key: 'transferencias', label: 'Transferencias' },
]

const active = ref('general')
const activeView = computed(() => views.value[active.value])
const activeLabel = computed(() => MENU.find((m) => m.key === active.value)?.label || '')
const weekTitle = computed(() => `SEM ${week.value.number} (del ${fmtDmy(week.value.start)} al ${fmtDmy(week.value.end)})`)

function cellText(col, row) {
  const value = row[col.key]
  if (col.format) return col.format(value)
  return value ?? ''
}

function barWidth(tbl, col, row) {
  if (row._total) return 0
  const max = Math.max(0, ...tbl.rows.filter((r) => !r._total).map((r) => Number(r[col.key]) || 0))
  return max ? Math.round(((Number(row[col.key]) || 0) / max) * 100) : 0
}

function onDatePick(event) {
  setWeekFromDate(event.target.value)
}

async function exportExcel() {
  const wb = new ExcelJS.Workbook()
  for (const item of MENU) {
    const view = views.value[item.key]
    const ws = wb.addWorksheet(item.label.slice(0, 31))
    ws.addRow([`${item.label} · ${weekTitle.value}`]).font = { bold: true, size: 13 }
    ws.addRow([])
    if (view.cards.length) {
      const head = ws.addRow(['Indicador', 'Valor', 'Detalle'])
      head.eachCell((c) => { c.fill = REPORT_HEADER_FILL; c.font = REPORT_HEADER_FONT })
      for (const card of view.cards) ws.addRow([card.label, card.value, card.sub])
      ws.addRow([])
    }
    for (const tbl of view.tables) {
      ws.addRow([tbl.title]).font = { bold: true }
      const head = ws.addRow(tbl.columns.map((c) => c.label))
      head.eachCell((c) => { c.fill = REPORT_HEADER_FILL; c.font = REPORT_HEADER_FONT })
      for (const row of tbl.rows) {
        const excelRow = ws.addRow(tbl.columns.map((c) => row[c.key] ?? ''))
        if (row._total) excelRow.font = { bold: true }
      }
      ws.addRow([])
    }
    ws.columns.forEach((col, i) => { col.width = i === 0 ? 34 : 18 })
  }
  await downloadWorkbook(wb, `TableroAlmacen_SEM${week.value.number}_${week.value.start}.xlsx`)
}

onMounted(() => fetchAll())
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">

    <div class="flex-none bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-slate-900 hover:bg-slate-50 border-0 font-bold" @click="router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">📊 Tablero de Indicadores · Almacén</span>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => router.push('/login'))">Salir</button>
    </div>

    <div class="flex-none bg-base-100 border-b border-base-300 px-4 py-2 flex flex-wrap gap-3 items-center shadow-sm">
      <div class="flex items-center gap-1">
        <button class="btn btn-sm btn-ghost px-2" :disabled="loading" title="Semana anterior" @click="shiftWeek(-1)">◄</button>
        <div class="text-center min-w-56">
          <div class="text-sm font-bold text-red-700 leading-tight">SEM {{ week.number }}</div>
          <div class="text-[11px] text-base-content/60 leading-tight">del {{ fmtDmy(week.start) }} al {{ fmtDmy(week.end) }}</div>
        </div>
        <button class="btn btn-sm btn-ghost px-2" :disabled="loading" title="Semana siguiente" @click="shiftWeek(1)">►</button>
      </div>
      <label class="flex items-center gap-1 text-[11px] text-base-content/60">
        Ir a la semana del
        <input type="date" class="input input-bordered input-xs w-36" :value="week.start" :disabled="loading" @change="onDatePick" />
      </label>

      <div class="ml-auto flex items-center gap-3">
        <span v-if="loadedAt && !loading" class="text-[11px] text-base-content/50">
          Actualizado {{ loadedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }}
        </span>
        <button class="btn btn-xs btn-primary" :disabled="loading" @click="fetchAll()">
          <span v-if="!loading">↻ Actualizar</span>
          <span v-else>Cargando…</span>
        </button>
        <button class="btn btn-xs btn-success" :disabled="loading" @click="exportExcel">⬇ Exportar Excel</button>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <nav class="flex-none w-48 bg-base-100 border-r border-base-300 p-3 flex flex-col gap-1.5 overflow-y-auto">
        <div class="text-[10px] font-bold text-base-content/50 uppercase tracking-wide mb-1">Indicadores</div>
        <button
          v-for="item in MENU"
          :key="item.key"
          class="btn btn-sm justify-start border-0 font-semibold"
          :class="active === item.key ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-red-600 text-white hover:bg-red-700'"
          @click="active = item.key"
        >{{ item.label }}</button>
      </nav>

      <main class="flex-1 overflow-auto p-4">
        <div v-if="failures.length" class="alert alert-warning text-xs mb-3 py-2">
          No se pudo cargar: {{ failures.join(', ') }}. Los indicadores de esa fuente salen en cero.
        </div>

        <div class="flex items-baseline gap-3 mb-3">
          <h1 class="text-lg font-bold text-slate-800 uppercase">{{ activeLabel }}</h1>
          <span class="text-xs text-base-content/60">{{ weekTitle }}</span>
        </div>

        <div v-if="loading" class="flex justify-center py-16">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>

        <template v-else>
          <div v-if="activeView.cards.length" class="grid gap-3 mb-5" :class="active === 'general' ? 'grid-cols-2 md:grid-cols-4 xl:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'">
            <button
              v-for="card in activeView.cards"
              :key="card.label"
              type="button"
              class="bg-base-100 rounded-lg shadow-sm border-t-4 border-red-600 px-3 py-3 text-center"
              :class="card.view && active === 'general' ? 'hover:shadow-md cursor-pointer' : 'cursor-default'"
              @click="card.view && active === 'general' && (active = card.view)"
            >
              <div class="text-[11px] font-bold uppercase text-slate-600 tracking-wide">{{ card.label }}</div>
              <div class="text-2xl font-extrabold text-slate-900 my-1">{{ card.value }}</div>
              <div class="text-[11px] text-base-content/60">{{ card.sub }}</div>
            </button>
          </div>

          <div class="grid gap-4 xl:grid-cols-2">
            <section v-for="tbl in activeView.tables" :key="tbl.title" class="bg-base-100 rounded-lg shadow-sm overflow-hidden" :class="tbl.columns.length > 5 ? 'xl:col-span-2' : ''">
              <h2 class="px-3 py-2 text-xs font-bold uppercase text-white bg-slate-800">{{ tbl.title }}</h2>
              <div v-if="!tbl.rows.length" class="px-3 py-6 text-center text-xs text-base-content/50">Sin datos en la semana</div>
              <div v-else class="overflow-x-auto max-h-[28rem]">
                <table class="table table-xs table-pin-rows">
                  <thead>
                    <tr>
                      <th v-for="col in tbl.columns" :key="col.key" :class="col.format ? 'text-right' : ''">{{ col.label }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in tbl.rows" :key="i" :class="row._total ? 'font-bold bg-base-200' : ''">
                      <td
                        v-for="col in tbl.columns"
                        :key="col.key"
                        :class="[col.format ? 'text-right tabular-nums' : '', col.wrap ? 'whitespace-normal min-w-64' : 'whitespace-nowrap']"
                      >
                        <div v-if="col.bar && !row._total" class="flex items-center justify-end gap-2">
                          <div class="h-2 rounded bg-red-500/70" :style="{ width: barWidth(tbl, col, row) + 'px' }"></div>
                          <span>{{ cellText(col, row) }}</span>
                        </div>
                        <template v-else>{{ cellText(col, row) }}</template>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </template>
      </main>
    </div>
  </div>
</template>
