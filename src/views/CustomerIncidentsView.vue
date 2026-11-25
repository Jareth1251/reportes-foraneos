<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { SESSION_KEY } from '@/router'
import { exportToExcel } from '@/utils/excelExport'
import { SITIOS } from '@/utils/cajerasSucursalHelpers'
import { fetchCustomerIncidentReport, RESPONSIBLE_AREAS } from '@/services/incidents'

// Incidencias con clientes (reemplaza la hoja "INCIDENCIAS DEL ... ** DOMICILIO **").
// Se capturan en el modal de incidencias con el área "Cliente"; aquí se suman
// quién surtió y quién despachó el pedido.

const router = useRouter()
if (!sessionStorage.getItem(SESSION_KEY)) {
  router.replace({ name: 'selector' })
}

const auth = useAuthStore()

const CITY_BY_SITE = { '3000': 'MTY', '3100': 'CDMX' }
const AREA_LABEL = Object.fromEntries(RESPONSIBLE_AREAS.map((a) => [a.value, a.label]))

const FIELDS = {
  folio: 'Incidencia',
  erp_order_id: 'Pedido',
  invoice_id: 'Factura',
  fecha: 'Fecha',
  customer_name: 'Cliente',
  tipo_incidencia: 'Tipo de incidencia',
  detalle: 'Detalle de incidencia',
  action: 'Acción',
  comment: 'Comentarios',
  sales_person: 'Asesor',
  surtidor_name: 'Surtidor',
  despachador_name: 'Despachador',
  ciudad: 'Ciudad',
  tipo: 'Tipo',
  responsable: 'Responsable',
  created_by_name: 'Registró',
}

function toIsoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Lunes a sábado de la semana actual, como la hoja que llenaban a mano.
function currentWeek() {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  return { from: toIsoDate(monday), to: toIsoDate(now) }
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
}

const week = currentWeek()
const dateStart = ref(week.from)
const dateEnd = ref(week.to)
const siteFilter = ref(String(auth.user?.site ?? SITIOS[0].id))
const areaFilter = ref('')
const searchText = ref('')
const loading = ref(false)
const error = ref('')
const incidents = ref([])

const rows = computed(() => incidents.value.map((i, idx) => ({
  ...i,
  folio: idx + 1,
  fecha: fmtDate(i.created_at),
  invoice_id: i.invoice_id || '',
  tipo_incidencia: i.incident_type_name || '',
  detalle: i.cause || '',
  ciudad: CITY_BY_SITE[String(i.site)] || i.site || '',
  tipo: i.responsible_area === 'foraneo' ? 'FORÁNEO' : (i.responsible_area ? 'LOCAL' : ''),
  responsable: AREA_LABEL[i.responsible_area] || '',
})))

const displayRows = computed(() => {
  const term = searchText.value.trim().toLowerCase()
  if (!term) return rows.value
  return rows.value.filter((r) =>
    [r.erp_order_id, r.customer_name, r.invoice_id].some((v) => String(v || '').toLowerCase().includes(term))
  )
})

const totalsByArea = computed(() => RESPONSIBLE_AREAS
  .map((a) => ({ ...a, count: displayRows.value.filter((r) => r.responsible_area === a.value).length }))
  .filter((a) => a.count > 0))

async function fetchReport() {
  loading.value = true
  error.value = ''
  try {
    incidents.value = await fetchCustomerIncidentReport({
      from: dateStart.value,
      to: dateEnd.value,
      site: siteFilter.value || undefined,
      responsible_area: areaFilter.value || undefined,
    })
  } catch (e) {
    console.error('[CustomerIncidentsView] error', e)
    incidents.value = []
    error.value = e?.response?.data?.message || 'No se pudo cargar el reporte.'
  } finally {
    loading.value = false
  }
}

function exportReport() {
  exportToExcel(displayRows.value, FIELDS, `IncidenciasClientes_${dateStart.value}_a_${dateEnd.value}.xlsx`)
}

onMounted(fetchReport)
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">
    <div class="flex-none bg-gradient-to-r from-orange-700 to-orange-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-slate-900 hover:bg-slate-50 border-0 font-bold" @click="router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">⚠️ Incidencias con Clientes</span>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => router.push('/login'))">Salir</button>
    </div>

    <div class="flex-none bg-base-100 border-b border-base-300 px-4 py-2 flex flex-wrap gap-3 items-center shadow-sm">
      <div class="flex gap-2 items-center">
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] text-base-content/50 leading-none">Desde</label>
          <input type="date" v-model="dateStart" class="input input-bordered input-xs w-36" @change="fetchReport" />
        </div>
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] text-base-content/50 leading-none">Hasta</label>
          <input type="date" v-model="dateEnd" class="input input-bordered input-xs w-36" @change="fetchReport" />
        </div>
      </div>

      <select v-model="siteFilter" class="select select-bordered select-xs w-32" @change="fetchReport">
        <option value="">Todas las ciudades</option>
        <option v-for="s in SITIOS" :key="s.id" :value="s.id">{{ s.label }}</option>
      </select>

      <select v-model="areaFilter" class="select select-bordered select-xs w-36" @change="fetchReport">
        <option value="">Todos los responsables</option>
        <option v-for="a in RESPONSIBLE_AREAS" :key="a.value" :value="a.value">{{ a.label }}</option>
      </select>

      <div class="flex items-center gap-1">
        <input v-model="searchText" type="text" placeholder="Buscar pedido, cliente o factura..." class="input input-bordered input-xs w-64" />
        <button v-if="searchText" class="btn btn-xs btn-ghost" @click="searchText = ''">✕</button>
      </div>

      <div class="ml-auto flex items-center gap-3">
        <span class="text-xs text-base-content/70">
          <b class="text-base-content">{{ displayRows.length }}</b> {{ displayRows.length === 1 ? 'incidencia' : 'incidencias' }}
        </span>
        <button class="btn btn-xs btn-primary" :disabled="loading" @click="fetchReport">
          {{ loading ? 'Cargando...' : '↻ Actualizar' }}
        </button>
        <button class="btn btn-xs btn-success" :disabled="!displayRows.length" @click="exportReport">⬇ Exportar Excel</button>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <div v-if="error" class="alert alert-error text-sm mb-3">{{ error }}</div>
      <div v-if="loading" class="flex justify-center py-16">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>
      <div v-else class="overflow-x-auto bg-base-100 rounded-lg shadow-sm">
        <table class="table table-sm">
          <thead>
            <tr class="text-sm">
              <th v-for="(label, field) in FIELDS" :key="field">{{ label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="displayRows.length === 0">
              <td :colspan="Object.keys(FIELDS).length" class="text-center text-base-content/40 py-8">Sin incidencias en el rango.</td>
            </tr>
            <tr v-for="r in displayRows" :key="r.id" class="text-sm align-top">
              <td v-for="(label, field) in FIELDS" :key="field"
                  :class="{ 'min-w-[14rem] whitespace-pre-wrap': ['detalle', 'action', 'comment'].includes(field) }">
                {{ r[field] }}
              </td>
            </tr>
          </tbody>
          <tfoot v-if="totalsByArea.length">
            <tr>
              <td :colspan="Object.keys(FIELDS).length" class="text-sm font-bold">
                <span v-for="a in totalsByArea" :key="a.value" class="mr-6">
                  Total {{ a.label }}: {{ a.count }} {{ a.count === 1 ? 'incidencia' : 'incidencias' }}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>
