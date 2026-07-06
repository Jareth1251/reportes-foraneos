<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/config/axios'
import * as XLSX from 'xlsx'

const router = useRouter()
const auth = useAuthStore()

function normalize(str) {
  return str?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() || ''
}

const deptId = computed(() => String(auth.user?.departmentId ?? auth.user?.department_id ?? '').trim())
const spid = computed(() => String(auth.user?.salesPersonId || auth.user?.salespersonId || '').trim().toUpperCase())

const site = computed(() => {
  if (spid.value === 'VYAM') return '3000'
  if (spid.value === 'VRAT') return '3100'
  return auth.user?.site || auth.user?.pickup_branch || null
})

const canSeePisoReport = computed(() => deptId.value === '006' || spid.value === 'VYAM' || spid.value === 'VRAT')
const canSeeCajerasReport = computed(() => ['001', '002'].includes(deptId.value) || ['VYAM', 'VRAT'].includes(spid.value))

// ── State ─────────────────────────────────────────────────────────────────
const activeTab = ref('general')
const loading = ref(false)
const totalsLoading = ref(false)
const totals = ref({})
const detail = ref([])

const today = new Date().toISOString().slice(0, 10)
const dateStart = ref(today)
const dateEnd = ref(today)

const pisoAgentFilter = ref('')

// ── Fetch totals (general tab) ───────────────────────────────────────────
async function fetchTotals() {
  totalsLoading.value = true
  try {
    const qs = site.value ? `?site=${site.value}` : ''
    const res = await fetch(`/node-api/checkin/total${qs}`)
    const json = await res.json()
    const rows = Array.isArray(json?.result?.[0]?.data) ? json.result[0].data : []

    const grouped = {}
    rows.forEach((item) => {
      let dept = item.main_departament
      if (item.status === 'paused' && item.paused_department_id) {
        if (item.paused_department_id === '004') dept = 'En Caja'
        else if (item.paused_department_id === '006') dept = 'En Piso'
        else if (item.paused_department_id === '007') dept = 'En Almacén'
        else dept = 'Otro Departamento'
      }
      if (!grouped[dept]) grouped[dept] = { main_departament: dept, statuses: [] }
      grouped[dept].statuses.push(item)
    })
    totals.value = grouped
  } catch (err) {
    console.error(err)
  } finally {
    totalsLoading.value = false
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────
function timeDiff(a, b) {
  if (!a || !b) return null
  const da = new Date(a)
  const db = new Date(b)
  if (isNaN(da) || isNaN(db)) return null
  let ms = db - da
  const h = Math.floor(ms / 3600000).toString().padStart(2, '0')
  ms %= 3600000
  const m = Math.floor(ms / 60000).toString().padStart(2, '0')
  ms %= 60000
  const s = Math.floor(ms / 1000).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function fmtTime(dt) {
  if (!dt) return null
  const d = new Date(dt)
  if (isNaN(d)) return null
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => v.toString().padStart(2, '0')).join(':')
}

function buildGroupedOrderString(row) {
  const primary = String(row.erp_order_id || '').toUpperCase()
  const comment = String(row.comment || row.paused_comment || '').trim()
  if (!comment && !primary) return ''
  const cleaned = comment.replace(/^pedidos[^:]*:/i, '')
  let orders = cleaned
    .split(/[^A-Z0-9]+/i)
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p.length > 0 && /\d/.test(p))
  if (primary && !orders.includes(primary)) orders.unshift(primary)
  if (!orders.length && primary) return primary
  return orders.join(', ')
}

const DIFF_MAP = {
  diff_creating_order_at: ['arrive_at', 'creating_order_at'],
  diff_order_created_at: ['creating_order_at', 'order_created_at'],
  diff_transferencia_at: ['paying_at', 'transferencia_at'],
  diff_payment_time: ['paying_at', 'order_received_at'],
  diff_order_received_delay: ['order_received_at', 'payed_at'],
  diff_at_stock_at: ['payed_at', 'at_stock_at'],
  diff_stocked_at: ['at_stock_at', 'stocked_at'],
  diff_at_deliver_at: ['stocked_at', 'at_deliver_at'],
  diff_delivered_at: ['at_deliver_at', 'delivered_at'],
  diff_surtido_entregado: ['stocked_at', 'delivered_at'],
  diff_sale_at: ['creating_order_at', 'payed_at'],
  diff_payed_at: ['transferencia_at', 'order_received_at'],
  diff_warehouse_at: ['order_received_at', 'delivered_at'],
  diff_total_at: ['arrive_at', 'delivered_at'],
  diff_payed_box: ['order_created_at', 'order_received_at'],
  diff_empezo_surtir: ['payed_at', 'stocked_at'],
  diff_lo_recibe_almacen: ['order_received_at', 'payed_at'],
}

const TIME_FIELDS = ['arrive_at', 'creating_order_at', 'order_created_at', 'paying_at', 'transferencia_at', 'payed_at', 'order_received_at', 'at_stock_at', 'stocked_at', 'at_deliver_at', 'delivered_at', 'canceled_at']

const STATUS_KEYS = ['arrive', 'creating_order', 'order_created', 'paying', 'payed', 'order_received', 'at_stock', 'stocked', 'at_deliver', 'delivered', 'canceled', 'transferencia', 'paused']

function processRows(rows) {
  return rows
    .filter((row) => !!row?.arrive_at)
    .map((row) => {
      const r = { ...row }

      TIME_FIELDS.forEach((f) => { r[`time_${f}`] = fmtTime(r[f]) })
      Object.entries(DIFF_MAP).forEach(([key, [s, e]]) => { r[key] = timeDiff(r[s], r[e]) })

      // "Por Pagar": si el cliente ya viene con el pedido armado, order_created_at nunca se llena;
      // en ese caso la espera se cuenta desde que se registró el turno (arrive_at).
      r.diff_paying_at = timeDiff(r.order_created_at || r.arrive_at, r.paying_at)

      if (r.paused_at) {
        const pEnd = r.status !== 'paused' && r.updated_at ? r.updated_at : new Date().toISOString()
        r.diffpaused_at = timeDiff(r.paused_at, pEnd)
      } else {
        r.diffpaused_at = null
      }

      STATUS_KEYS.forEach((st) => {
        const userId = r[`usr_${st}`]
        const userName = r[`usr_${st}_name`]
        r[`usr_name_${st}`] = userName || userId || ''
      })
      r.usr_name_canceled = r.usr_name_canceled || r.usr_name_cancelled || ''
      r.created_by_name = r.usr_name_order_created || r.usr_name_creating_order || ''
      r.diff_created_order = r.diff_order_created_at || null

      const grouped = buildGroupedOrderString(r)
      r.erp_order_grouped = grouped || r.erp_order_id || ''
      r.erp_order_count = r.erp_order_grouped ? r.erp_order_grouped.split(',').filter(Boolean).length : 0

      return r
    })
}

// ── Fetch detail (detalle / almacén / piso tabs) ─────────────────────────
async function fetchDetail() {
  loading.value = true
  try {
    const params = new URLSearchParams({ date: dateStart.value, end_date: dateEnd.value })
    if (site.value) params.append('site', site.value)
    const res = await fetch(`/node-api/checkin?${params}`)
    const json = await res.json()
    const rows = Array.isArray(json?.result?.[0]?.data) ? json.result[0].data : []
    detail.value = processRows(rows)
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function changeDateRange() {
  fetchDetail()
}

function shiftDay(delta) {
  const d = new Date(dateStart.value + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  const ymd = d.toISOString().slice(0, 10)
  dateStart.value = ymd
  dateEnd.value = ymd
  fetchDetail()
}

// ── Averages ──────────────────────────────────────────────────────────────
function toSeconds(t) {
  if (!t) return null
  const parts = t.split(':').map(Number)
  if (parts.some((p) => isNaN(p))) return null
  const [h, m, s] = parts
  return h * 3600 + m * 60 + s
}

function toTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':')
}

function getAverageTime(rows, field) {
  const valid = rows.map((r) => toSeconds(r[field])).filter((v) => v !== null)
  if (!valid.length) return '00:00:00'
  return toTime(valid.reduce((a, b) => a + b, 0) / valid.length)
}

// ── Tab-specific data ──────────────────────────────────────────────────────
const realDetail = computed(() => detail.value.filter((r) => Number(r.turn) > 0))
const agendadosDetail = computed(() => detail.value.filter((r) => Number(r.turn) === 0))
const totalOrdersCount = computed(() => realDetail.value.reduce((acc, r) => acc + (r.erp_order_count || 0), 0))
const agendadosOrdersCount = computed(() => agendadosDetail.value.reduce((acc, r) => acc + (r.erp_order_count || 0), 0))

const ALMACEN_STATUSES = ['stocked', 'at_stock', 'at_deliver', 'delivered', 'empacando', 'enviado', 'entregado']
const almacenDetail = computed(() => detail.value.filter((r) => ALMACEN_STATUSES.includes(r.status)))
const almacenOrdersCount = computed(() => almacenDetail.value.reduce((acc, r) => acc + (r.erp_order_count || 0), 0))

const pisoDetail = computed(() => {
  const q = normalize(pisoAgentFilter.value)
  if (!q) return detail.value
  return detail.value.filter((r) =>
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

function setCajeraQuickRange(type) {
  const today = new Date()
  const hoy = today.toISOString().slice(0, 10)
  if (type === 'hoy') {
    dateStart.value = hoy; dateEnd.value = hoy
  } else if (type === 'ayer') {
    const y = new Date(today); y.setDate(y.getDate() - 1)
    const ymd = y.toISOString().slice(0, 10)
    dateStart.value = ymd; dateEnd.value = ymd
  } else if (type === '7d') {
    const s = new Date(today); s.setDate(s.getDate() - 6)
    dateStart.value = s.toISOString().slice(0, 10); dateEnd.value = hoy
  } else if (type === 'mes') {
    const d = today
    dateStart.value = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    dateEnd.value   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
  }
  fetchDetail()
  fetchForaneosForCajeras()
}

// ── Cajeras report ────────────────────────────────────────────────────────
const foraneosForCajeras = ref([])
const foraneosLoading = ref(false)
const cajera004Names = ref(new Set())

async function loadCajera004() {
  try {
    const res = await fetch('/node-api/users?department_id=004')
    const rows = await res.json()
    const names = new Set()
    for (const u of (rows || [])) {
      if (u.name) names.add(String(u.name).trim().toUpperCase())
    }
    cajera004Names.value = names
  } catch (err) {
    console.error('[loadCajera004]', err)
  }
}

async function fetchForaneosForCajeras() {
  foraneosLoading.value = true
  try {
    await loadCajera004()
    const { data } = await api.get('/foraneos', { params: { include_returned: 0, include_pasa: 1 } })
    foraneosForCajeras.value = Array.isArray(data) ? data : []
  } catch (err) {
    console.error(err)
    foraneosForCajeras.value = []
  } finally {
    foraneosLoading.value = false
  }
}

const FACTURED_STATUSES = new Set(['facturado', 'surtiendo', 'surtido', 'empacando', 'enviando', 'enviado', 'entregado'])

const cajerasReport = computed(() => {
  // Checkins: solo usuarios de dept 004, comparando por nombre (usr_paying es código varchar, no ID)
  // Checkins normales usan usr_paying_name; agendados (turn=0) pueden usar usr_payed_name
  const checkinMap = {}
  for (const r of detail.value) {
    const nombre = String(r.usr_paying_name || r.usr_payed_name || '').trim()
    if (!nombre) continue
    if (cajera004Names.value.size > 0 && !cajera004Names.value.has(nombre.toUpperCase())) continue
    checkinMap[nombre] = (checkinMap[nombre] || 0) + 1
  }

  // Foraneos: filter by status facturado+ and facturado_at within date range
  const fromTs = dateStart.value ? new Date(dateStart.value + 'T00:00:00').getTime() : null
  const toTs   = dateEnd.value   ? new Date(dateEnd.value   + 'T23:59:59').getTime() : null
  const foraneosMap = {}
  for (const o of foraneosForCajeras.value) {
    const cajera = o.facturado_por_name
    if (!cajera) continue
    if (!FACTURED_STATUSES.has(String(o.status || '').toLowerCase().trim())) continue
    const facturadoAt = o.facturado_at ? new Date(o.facturado_at).getTime() : null
    if (facturadoAt) {
      if (fromTs && facturadoAt < fromTs) continue
      if (toTs   && facturadoAt > toTs)   continue
    }
    foraneosMap[cajera] = (foraneosMap[cajera] || 0) + 1
  }

  const allCajeras = new Set([...Object.keys(checkinMap), ...Object.keys(foraneosMap)])
  return Array.from(allCajeras).map(cajera => ({
    cajera,
    checkins: checkinMap[cajera] || 0,
    foraneos: foraneosMap[cajera] || 0,
    total: (checkinMap[cajera] || 0) + (foraneosMap[cajera] || 0),
  })).sort((a, b) => b.total - a.total)
})

// ── Cajeras: promedios de tiempo ─────────────────────────────────────────
const cajeraTimingReport = computed(() => {
  // Checkins: mismas filas/filtro que cajerasReport, agrupadas para promediar sus diffs
  const checkinGroups = {}
  for (const r of detail.value) {
    const nombre = String(r.usr_paying_name || r.usr_payed_name || '').trim()
    if (!nombre) continue
    if (cajera004Names.value.size > 0 && !cajera004Names.value.has(nombre.toUpperCase())) continue
    if (!checkinGroups[nombre]) checkinGroups[nombre] = []
    checkinGroups[nombre].push(r)
  }

  // Foraneos: mismo filtro que cajerasReport, promediando created_at -> facturado_at
  const fromTs = dateStart.value ? new Date(dateStart.value + 'T00:00:00').getTime() : null
  const toTs   = dateEnd.value   ? new Date(dateEnd.value   + 'T23:59:59').getTime() : null
  const foraneosGroups = {}
  for (const o of foraneosForCajeras.value) {
    const cajera = o.facturado_por_name
    if (!cajera) continue
    if (!FACTURED_STATUSES.has(String(o.status || '').toLowerCase().trim())) continue
    if (!o.facturado_at || !o.created_at) continue
    const facturadoAt = new Date(o.facturado_at).getTime()
    if (fromTs && facturadoAt < fromTs) continue
    if (toTs   && facturadoAt > toTs)   continue
    const createdAt = new Date(o.created_at).getTime()
    const diffSec = (facturadoAt - createdAt) / 1000
    if (diffSec < 0) continue
    if (!foraneosGroups[cajera]) foraneosGroups[cajera] = []
    foraneosGroups[cajera].push(diffSec)
  }

  const allCajeras = new Set([...Object.keys(checkinGroups), ...Object.keys(foraneosGroups)])
  return Array.from(allCajeras).map(cajera => {
    const rows = checkinGroups[cajera] || []
    const foraneoSecs = foraneosGroups[cajera] || []
    const avgForaneo = foraneoSecs.length
      ? toTime(foraneoSecs.reduce((a, b) => a + b, 0) / foraneoSecs.length)
      : '00:00:00'
    return {
      cajera,
      checkinCount: rows.length,
      avgEspera: getAverageTime(rows, 'diff_paying_at'),
      avgCobro: getAverageTime(rows, 'diff_payment_time'),
      avgTotalCheckin: getAverageTime(rows, 'diff_payed_box'),
      foraneoCount: foraneoSecs.length,
      avgForaneo,
    }
  }).sort((a, b) => a.cajera.localeCompare(b.cajera))
})

// ── Export ────────────────────────────────────────────────────────────────
function exportToExcel(rows, mapping, filename) {
  const data = rows.map((r) => {
    const out = {}
    Object.entries(mapping).forEach(([field, label]) => {
      let v = r[field] ?? ''
      if (field === 'arrive_at' && v) v = String(v).slice(0, 10)
      out[label] = v
    })
    return out
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte')
  XLSX.writeFile(wb, filename)
}

const DETALLE_FIELDS = {
  turn: 'Turno', name: 'Cliente', erp_order_grouped: 'Pedido', erp_order_count: 'Conteo de pedidos',
  quantity: 'Cantidad', status_label: 'Estado Final',
  time_arrive_at: 'Llegó', usr_arrive_name: 'Registró Turno',
  time_creating_order_at: 'Lo atendió piso', time_order_created_at: 'Se creó el pedido',
  time_paying_at: 'Lo atendió cajas', time_transferencia_at: 'Se envió a Transferencia',
  time_order_received_at: 'Finalizó el Pago', time_at_stock_at: 'Se Empezó a surtir',
  time_stocked_at: 'Se Surtió', time_at_deliver_at: 'Se Empezó a Entregar',
  time_delivered_at: 'Se Entregó', time_canceled_at: 'Se Canceló',
  diff_creating_order_at: 'Tiempo para atención de piso', diff_order_created_at: 'Tiempo de creación del pedido',
  diff_paying_at: 'Tiempo para atención en cajas', diff_transferencia_at: 'Tiempo en Transferencia',
  diff_payment_time: 'Tiempo de Pago', diff_order_received_delay: 'Tiempo en Recibir pedido',
  diff_at_stock_at: 'Tiempo para atención por Almacén', diff_stocked_at: 'Tiempo para surtir',
  diff_at_deliver_at: 'Tiempo para Entregar', diff_delivered_at: 'Tiempo de entrega',
  diff_sale_at: 'Tiempo en Piso', diff_payed_at: 'Tiempo en Cajas', diff_warehouse_at: 'Tiempo en Almacén',
  diff_total_at: 'Tiempo en Tienda', paused_comment: 'Motivo Pausa', diffpaused_at: 'Tiempo Pausado',
  usr_name_paused: 'Lo pausó', usr_name_creating_order: 'Lo atendió', usr_name_order_created: 'Le creó el pedido',
  usr_name_paying: 'Le atendió en cajas', usr_name_transferencia: 'Lo mandó a Transferencia',
  usr_name_stocked: 'Lo atendió en Almacén', usr_name_at_stock: 'Lo surtió',
  usr_name_at_deliver: 'Asignó la Entrega', usr_name_delivered: 'Lo Entregó',
  cancel_comment: 'Razón de Cancelación', arrive_at: 'Fecha',
}

const ALMACEN_FIELDS = {
  turn: 'Turno', name: 'Cliente', erp_order_grouped: 'Pedido', erp_order_count: 'Conteo de pedidos',
  quantity: 'Cantidad', status_label: 'Estado Final', diff_total_at: 'Tiempo Total',
  diff_at_stock_at: 'Recibe / Asignar Surtidor', diff_stocked_at: 'Surtiendo / Surtido',
  diff_surtido_entregado: 'Surtido / Entregado', usr_name_stocked: 'Lo atendió en Almacén',
  usr_name_at_stock: 'Lo surtió', usr_name_delivered: 'Lo entregó', arrive_at: 'Fecha',
}

const PISO_FIELDS = {
  turn: 'Turno', name: 'Cliente', erp_order_grouped: 'Pedido', quantity: 'Cantidad',
  status_label: 'Estado Final', usr_arrive_name: 'Registró Turno', cancel_comment: 'Razón de Cancelación',
  usr_name_canceled: 'Lo canceló', diff_created_order: 'Tiempo de Creación del Pedido',
  created_by_name: 'Le creó el Pedido', arrive_at: 'Fecha',
}

function exportDetalle() {
  exportToExcel(realDetail.value, DETALLE_FIELDS, `ReporteTurnos_${dateStart.value}_a_${dateEnd.value}.xlsx`)
}
function exportAgendados() {
  exportToExcel(agendadosDetail.value, DETALLE_FIELDS, `ReporteAgendados_${dateStart.value}_a_${dateEnd.value}.xlsx`)
}
function exportAlmacen() {
  exportToExcel(almacenDetail.value, ALMACEN_FIELDS, `ReporteAlmacen_${dateStart.value}_a_${dateEnd.value}.xlsx`)
}
function exportPiso() {
  exportToExcel(pisoDetail.value, PISO_FIELDS, `ReportePiso_${dateStart.value}_a_${dateEnd.value}.xlsx`)
}

// ── Lifecycle ────────────────────────────────────────────────────────────
function changeTab(key) {
  activeTab.value = key
  if (key !== 'general') fetchDetail()
  if (key === 'cajeras') fetchForaneosForCajeras()
}

onMounted(() => {
  fetchTotals()
  fetchDetail()
})

const TABS = computed(() => {
  const tabs = [
    { key: 'general', label: 'Reporte General' },
    { key: 'detalle', label: 'Reporte Detalle' },
    { key: 'agendados', label: 'Agendados' },
    { key: 'almacen', label: 'Reporte Almacén' },
  ]
  if (canSeePisoReport.value) tabs.push({ key: 'piso', label: 'Reporte Piso' })
  if (canSeeCajerasReport.value) tabs.push({ key: 'cajeras', label: 'Cajeras' })
  return tabs
})
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">

    <!-- Barra superior fija -->
    <div class="flex-none bg-gradient-to-r from-blue-800 to-blue-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-blue-900 hover:bg-blue-50 border-0 font-bold" @click="router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">🎫 Reporte de Turnos</span>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => router.push('/login'))">Salir</button>
    </div>

    <!-- Tabs fijos -->
    <div class="flex-none bg-base-100 border-b border-base-300 px-4 flex gap-1 pt-1">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="px-4 py-1.5 text-sm font-medium border-b-2 transition-colors"
        :class="activeTab === tab.key ? 'border-blue-700 text-blue-800' : 'border-transparent text-base-content/50 hover:text-base-content'"
        @click="changeTab(tab.key)"
      >{{ tab.label }}</button>
    </div>

    <!-- Área scrollable principal -->
    <div class="flex-1 overflow-y-auto overflow-x-hidden p-4">

      <!-- TAB: REPORTE GENERAL -->
      <div v-if="activeTab === 'general'">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-bold text-xl">Turnos en espera</h2>
          <button class="btn btn-xs btn-primary" :class="{ loading: totalsLoading }" @click="fetchTotals">
            <span v-if="!totalsLoading">↻ Actualizar Ahora</span>
            <span v-else>Cargando...</span>
          </button>
        </div>

        <div v-if="totalsLoading && !Object.keys(totals).length" class="flex justify-center py-16">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>

        <div v-else-if="!Object.keys(totals).length" class="text-center text-base-content/40 py-16">
          No hay turnos en espera.
        </div>

        <div v-else class="flex flex-col gap-6">
          <div v-for="(group, dept) in totals" :key="dept">
            <h3 class="font-bold text-lg mb-2">{{ dept }}</h3>
            <div class="flex flex-wrap gap-3">
              <div
                v-for="(row, idx) in group.statuses"
                :key="dept + '_' + idx"
                class="rounded-lg px-4 py-3 shadow text-sm font-semibold min-w-48"
                :style="`background:${row.bgcolor_status || '#eee'};`"
              >
                Turnos {{ row.label }} en espera: {{ row.qty }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB: REPORTE DETALLE -->
      <div v-else-if="activeTab === 'detalle'">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(-1)" title="Día anterior">◄</button>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Inicio</label>
            <input type="date" v-model="dateStart" class="input input-bordered input-sm w-36" @change="changeDateRange" />
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Fin</label>
            <input type="date" v-model="dateEnd" class="input input-bordered input-sm w-36" @change="changeDateRange" />
          </div>
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(1)" title="Día siguiente">►</button>
          <button class="btn btn-sm btn-primary" :class="{ loading: loading }" @click="fetchDetail">
            <span v-if="!loading">↻ Actualizar</span>
            <span v-else>Cargando...</span>
          </button>
          <button class="btn btn-sm btn-success" @click="exportDetalle">⬇ Exportar Excel</button>
        </div>

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

      <!-- TAB: AGENDADOS -->
      <div v-else-if="activeTab === 'agendados'">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(-1)" title="Día anterior">◄</button>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Inicio</label>
            <input type="date" v-model="dateStart" class="input input-bordered input-sm w-36" @change="changeDateRange" />
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Fin</label>
            <input type="date" v-model="dateEnd" class="input input-bordered input-sm w-36" @change="changeDateRange" />
          </div>
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(1)" title="Día siguiente">►</button>
          <button class="btn btn-sm btn-primary" :class="{ loading: loading }" @click="fetchDetail">
            <span v-if="!loading">↻ Actualizar</span>
            <span v-else>Cargando...</span>
          </button>
          <button class="btn btn-sm btn-success" @click="exportAgendados">⬇ Exportar Excel</button>
        </div>

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

      <!-- TAB: REPORTE ALMACÉN -->
      <div v-else-if="activeTab === 'almacen'">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(-1)" title="Día anterior">◄</button>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Inicio</label>
            <input type="date" v-model="dateStart" class="input input-bordered input-sm w-36" @change="changeDateRange" />
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Fin</label>
            <input type="date" v-model="dateEnd" class="input input-bordered input-sm w-36" @change="changeDateRange" />
          </div>
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(1)" title="Día siguiente">►</button>
          <button class="btn btn-sm btn-primary" :class="{ loading: loading }" @click="fetchDetail">
            <span v-if="!loading">↻ Actualizar</span>
            <span v-else>Cargando...</span>
          </button>
          <button class="btn btn-sm btn-success" @click="exportAlmacen">⬇ Exportar Excel</button>
        </div>

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

      <!-- TAB: REPORTE PISO -->
      <div v-else-if="activeTab === 'piso' && canSeePisoReport">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(-1)" title="Día anterior">◄</button>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Inicio</label>
            <input type="date" v-model="dateStart" class="input input-bordered input-sm w-36" @change="changeDateRange" />
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Fin</label>
            <input type="date" v-model="dateEnd" class="input input-bordered input-sm w-36" @change="changeDateRange" />
          </div>
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(1)" title="Día siguiente">►</button>
          <div class="flex items-center gap-1">
            <input v-model="pisoAgentFilter" type="text" placeholder="Filtrar por Agente de Piso..." class="input input-bordered input-sm w-56" />
            <button v-if="pisoAgentFilter" class="btn btn-sm btn-ghost" @click="pisoAgentFilter = ''">✕</button>
          </div>
          <button class="btn btn-sm btn-primary" :class="{ loading: loading }" @click="fetchDetail">
            <span v-if="!loading">↻ Actualizar</span>
            <span v-else>Cargando...</span>
          </button>
          <button class="btn btn-sm btn-success" @click="exportPiso">⬇ Exportar Excel</button>
        </div>

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

      <!-- TAB: CAJERAS -->
      <div v-else-if="activeTab === 'cajeras' && canSeeCajerasReport">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(-1)" title="Día anterior">◄</button>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Inicio</label>
            <input type="date" v-model="dateStart" class="input input-bordered input-sm w-36" @change="() => { fetchDetail(); fetchForaneosForCajeras() }" />
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="text-[10px] text-base-content/50 leading-none">Fecha Fin</label>
            <input type="date" v-model="dateEnd" class="input input-bordered input-sm w-36" @change="() => { fetchDetail(); fetchForaneosForCajeras() }" />
          </div>
          <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(1)" title="Día siguiente">►</button>
          <button class="btn btn-sm btn-outline btn-sm" @click="setCajeraQuickRange('hoy')">Hoy</button>
          <button class="btn btn-sm btn-outline btn-sm" @click="setCajeraQuickRange('ayer')">Ayer</button>
          <button class="btn btn-sm btn-outline btn-sm" @click="setCajeraQuickRange('7d')">7 días</button>
          <button class="btn btn-sm btn-outline btn-sm" @click="setCajeraQuickRange('mes')">Este mes</button>
          <button
            class="btn btn-sm btn-primary"
            :class="{ loading: loading || foraneosLoading }"
            @click="() => { fetchDetail(); fetchForaneosForCajeras() }"
          >
            <span v-if="!loading && !foraneosLoading">↻ Actualizar</span>
            <span v-else>Cargando...</span>
          </button>
        </div>

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

    </div>
  </div>
</template>
