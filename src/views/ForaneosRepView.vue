<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/config/axios'
import * as XLSX from 'xlsx'

const router = useRouter()
if (!sessionStorage.getItem('foraneos_module_chosen')) {
  router.replace({ name: 'selector' })
}

const auth   = useAuthStore()

// ── Estado ────────────────────────────────────────────────────────────────
const orders          = ref([])
const filteredOrders  = ref([])
const filteredReturned = ref([])
const returnedArchive = ref([])
const loading         = ref(false)
const expandedKey     = ref(null)
const activeTab       = ref('general')

// Cashier
const cashierNameMap    = ref(new Map())
const carrierIdsByCashier = ref(new Map())
const allowedCashierCodes = ref(new Set())
const cashierCodesLoaded  = ref(false)

// Filtros de fecha
function ymdLocal(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}
const filterFrom = ref(ymdLocal())
const filterTo   = ref(ymdLocal())

// ── Helpers de fecha ──────────────────────────────────────────────────────
function parseYMDLocal(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
const endOfDay   = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)

function fmtTime(dateLike) {
  if (!dateLike) return null
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}

function pickTs(obj, keys) {
  for (const k of keys) { if (obj?.[k]) return new Date(obj[k]) }
  return null
}

function diffHHMMSS(obj, startKeys, endKeys) {
  const s = pickTs(obj, startKeys)
  const e = pickTs(obj, endKeys)
  if (!s || !e) return null
  let ms = Math.max(0, e - s)
  const h  = Math.floor(ms / 3600000); ms %= 3600000
  const m  = Math.floor(ms / 60000);   ms %= 60000
  const sc = Math.floor(ms / 1000)
  return [h, m, sc].map(n => String(n).padStart(2, '0')).join(':')
}

function fmtDateTimeLocalDisplay(dateLike) {
  if (!dateLike) return '—'
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (isNaN(d)) return '—'
  return d.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function normalize(str) {
  return str?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// ── Cashier logic ─────────────────────────────────────────────────────────
async function loadCashierCodes() {
  if (cashierCodesLoaded.value) return
  try {
    const { data } = await api.get('/carrier_cajeras/carrier_cajeras', { params: { _ts: Date.now() } })
    let rows = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : data
    const codes    = new Set()
    const byCode   = new Map()
    const nameMap  = new Map()
    for (const asig of (rows || [])) {
      if (asig.cajera_code && asig.activa === 1) {
        const code = String(asig.cajera_code).toUpperCase().trim()
        codes.add(code)
        if (asig.cajera_name && !nameMap.has(code)) nameMap.set(code, asig.cajera_name)
        if (asig.carrier_id) {
          if (!byCode.has(code)) byCode.set(code, new Set())
          byCode.get(code).add(Number(asig.carrier_id))
        }
      }
    }
    allowedCashierCodes.value   = codes
    carrierIdsByCashier.value   = byCode
    cashierNameMap.value        = nameMap
    cashierCodesLoaded.value    = true
  } catch { /* silent */ }
}

function getMyCode() {
  const u = auth.user || {}
  return String(u.salesPersonId || u.salespersonId || u.salesperson || '').toUpperCase().trim()
}

function getFacturadoPor(order) {
  if (order.facturado_por) return String(order.facturado_por).toUpperCase().trim()
  if (order.facturado_por_name) {
    for (const [code, name] of cashierNameMap.value.entries()) {
      if (name === order.facturado_por_name) return code
    }
  }
  const status = String(order.status || '').toLowerCase().trim()
  const postFacturado = ['facturado','entregado','enviado','surtiendo','surtido','empacando'].includes(status)
  if (postFacturado && order.assigned_to) return String(order.assigned_to).toUpperCase().trim()
  return order.invoiced_by || order.invoiced_by_code || null
}

function getOrderCarrierId(order) {
  const s = String(order.carrier || '').toLowerCase().trim()
  if (s === 'saltillo')                            return 3
  if (s === 'domicilio')                           return 4
  if (s === 'cliente pasa' || s === 'cliente_pasa') return 5
  if (s === 'foraneos' || s === 'foráneos')        return 'foraneos'
  return null
}

function isReturned(o = {}) {
  const status = String(o.status || '').toLowerCase().trim()
  const flags  = [o.is_returned, o.returned, o.devuelto].some(Boolean)
  const hasData = Boolean(o.return_reason) || Boolean(o.returned_at)
  return hasData || flags || ['devuelto','returned','returned_order','return'].includes(status)
}

function isDelivered(o = {}) {
  return String(o.status || '').toLowerCase().trim() === 'entregado' || Boolean(o.delivered_at)
}

const deptId    = computed(() => String(auth.user?.departmentId ?? auth.user?.department_id ?? '').trim())
const isDept007 = computed(() => deptId.value === '007')
const isGerente = computed(() => deptId.value === '001' || deptId.value === '002')

const searchText = ref('')

const displayOrders = computed(() => {
  const q = normalize(searchText.value)
  if (!q || !isGerente.value) return filteredOrders.value
  return filteredOrders.value.filter(o =>
    normalize(o.customer_name || '').includes(q) ||
    normalize(o.erp_order_id  || '').includes(q) ||
    normalize(o.agregados     || '').includes(q) ||
    [o.sales_person, o.facturado_por_name, o.surtidor_name, o.packed_by_name, o.despachador_name, o.delivered_by_name]
      .some(v => normalize(v || '').includes(q))
  )
})

const displayReturned = computed(() => {
  const q = normalize(searchText.value)
  if (!q || !isGerente.value) return filteredReturned.value
  return filteredReturned.value.filter(o =>
    normalize(o.customer_name || '').includes(q) ||
    normalize(o.erp_order_id  || '').includes(q) ||
    [o.sales_person, o.facturado_por_name].some(v => normalize(v || '').includes(q))
  )
})

async function applyRoleFilter(list) {
  const dept = deptId.value
  if (dept === '003' || dept === '005') {
    const me = normalize(auth.user?.name || '')
    const myUsername = String(auth.user?.agent || auth.user?.username || '').toLowerCase().trim()
    return list.filter(o => {
      const sp = normalize(o.sales_person || '')
      const cb = String(o.created_by || '').toLowerCase().trim()
      return sp === me || (sp && me && (me.startsWith(sp) || sp.startsWith(me))) || (myUsername && cb === myUsername)
    })
  }
  // dept 004 (cajeras): carrier_cajeras solo existe en el backend Node.js, no en Laravel.
  // Mostramos todos los pedidos igual que 001/002 para que no desaparezcan carriers.
  return list
}

function applyDateFilter(list) {
  const f = parseYMDLocal(filterFrom.value)
  const t = parseYMDLocal(filterTo.value)
  const start = f ? startOfDay(f).getTime() : null
  const end   = t ? endOfDay(t).getTime()   : null
  const today = new Date()
  const todayStart = startOfDay(today).getTime()
  const todayEnd   = endOfDay(today).getTime()
  return list.filter(o => {
    let ts = o.created_at ? new Date(o.created_at).getTime() : 0
    if (isDept007.value) {
      const delivered = isDelivered(o)
      const returned_ = isReturned(o)
      if (!delivered && !returned_ && !(ts >= todayStart && ts <= todayEnd)) {
        ts = todayStart + 12 * 60 * 60 * 1000
      }
    }
    if (start != null && ts < start) return false
    if (end   != null && ts > end)   return false
    return true
  })
}

async function recomputeFiltered() {
  const base = await applyRoleFilter(orders.value)
  const f = parseYMDLocal(filterFrom.value)
  const t = parseYMDLocal(filterTo.value)
  const start = f ? startOfDay(f).getTime() : null
  const end   = t ? endOfDay(t).getTime()   : null
  const today = new Date()
  const todayStart = startOfDay(today).getTime()
  const todayEnd   = endOfDay(today).getTime()
  const todayYmd   = ymdLocal(today)
  const includeToday = (start == null || start <= todayEnd) && (end == null || end >= todayStart)
  const ranged = applyDateFilter(base)

  let rangedPlus = ranged
  if (isDept007.value && includeToday) {
    const extras = base.filter(o => {
      const ts = o.created_at ? new Date(o.created_at).getTime() : 0
      return ts < todayStart && !isReturned(o) && !isDelivered(o)
    })
    rangedPlus = [...ranged, ...extras]
  }

  const perDay = {}
  const withSeq = [...rangedPlus].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return ta !== tb ? ta - tb : (a.id || 0) - (b.id || 0)
  }).map(o => {
    const createdKey = o.date_created_at || (o.created_at ? ymdLocal(new Date(o.created_at)) : '—')
    const carryPending = isDept007.value && includeToday && !isDelivered(o) && !isReturned(o) && createdKey !== todayYmd
    const dateKey = carryPending ? todayYmd : createdKey
    perDay[dateKey] = (perDay[dateKey] || 0) + 1
    return { ...o, turno_date: dateKey, turno_seq: perDay[dateKey], carry_pending: carryPending, status_view: carryPending ? `${o.status || ''} (pendiente)` : o.status }
  })

  const keyOf = o => String(o.erp_order_id || '').trim().toUpperCase() || `id:${o.id}`
  const timeValue = o => Math.max(...[o.last_status_change_at, o.returned_at, o.changed_erp_at, o.created_at].map(v => v ? new Date(v).getTime() : 0))
  const dedup = Object.values(withSeq.reduce((acc, o) => {
    const k = keyOf(o)
    if (!acc[k] || timeValue(o) > timeValue(acc[k])) acc[k] = o
    return acc
  }, {}))

  filteredOrders.value = dedup.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return ta !== tb ? ta - tb : (a.id || 0) - (b.id || 0)
  })

  const retBase = await applyRoleFilter(returnedArchive.value)
  filteredReturned.value = retBase
    .filter(o => {
      const ts = o.returned_at ? new Date(o.returned_at).getTime() : 0
      if (start != null && ts < start) return false
      if (end   != null && ts > end)   return false
      return true
    })
    .sort((a, b) => new Date(b.returned_at || 0) - new Date(a.returned_at || 0))
}

function processOrder(order) {
  const o = { ...order }

  const facturadoPorCode = getFacturadoPor(order)
  let facturadoPorName = cashierNameMap.value.get(facturadoPorCode) || null
  if (!facturadoPorName && order.assigned_to && String(order.assigned_to).toUpperCase().trim() === facturadoPorCode) {
    facturadoPorName = order.assigned_to_name
  }
  o.facturado_por_code = facturadoPorCode
  o.facturado_por_name = facturadoPorName || order.facturado_por_name || facturadoPorCode

  const statusLower = String(order.status || '').toLowerCase().trim()
  const enviadoAt   = order.shipped_at || order.enviado_at || null
  let empacadoAt    = order.empacado_at || order.packed_at || null
  if (!empacadoAt && ['enviando','enviado','entregado'].includes(statusLower) && enviadoAt) empacadoAt = enviadoAt
  const surtiendoAt = order.surtiendo_at || order.surtidor_asignado_at || null
  const surtidoAt   = order.surtido_at || null
  const facturadoAt = order.facturado_at || null
  const entregadoAt = order.delivered_at || null
  const despachadorName = order.despachador_name ?? order.despachador_nam ?? order.dispatcher_name ?? null
  const despachadorAsignadoAt = order.despachador_asignado_at ?? order.dispatcher_assigned_at ?? null

  Object.assign(o, {
    enviado_at: enviadoAt, empacado_at: empacadoAt,
    surtiendo_at: surtiendoAt, surtido_at: surtidoAt,
    facturado_at: facturadoAt, delivered_at: entregadoAt,
    despachador_id: order.despachador_id ?? order.dispatcher_id ?? null,
    despachador_name: despachadorName, despachador_asignado_at: despachadorAsignadoAt,
    return_reason: order.return_reason || order.devolution_reason || order.motivo_devolucion || null,
    returned_at: order.returned_at || order.devolution_at || order.devuelto_at || null,
    returned_by_name: order.returned_by_name || order.returned_by || order.devuelto_por_nombre || null,
    is_returned: order.is_returned ?? order.returned ?? order.devuelto ?? null,
  })

  const tsFields = ['created_at','facturado_at','surtidor_asignado_at','surtiendo_at','surtido_at','packed_at','empacado_at','shipped_at','enviado_at','delivered_at','despachador_asignado_at']
  tsFields.forEach(f => { o[`time_${f}`] = o[f] ? fmtTime(o[f]) : null })

  if (order.created_at) {
    const d = new Date(order.created_at)
    o.date_created_at = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  o.diff_a_facturar         = diffHHMMSS(o, ['created_at'], ['facturado_at'])
  o.diff_a_asignar_surtidor = diffHHMMSS(o, ['facturado_at'], ['surtiendo_at','surtidor_asignado_at'])
  o.diff_a_surtir           = diffHHMMSS(o, ['surtidor_asignado_at'], ['surtido_at'])
  o.diff_a_empacar          = diffHHMMSS(o, ['surtido_at'], ['empacado_at','packed_at'])
  o.diff_a_entregar         = diffHHMMSS(o, ['empacado_at','packed_at'], ['delivered_at'])
  o.diff_total              = diffHHMMSS(o, ['created_at'], ['delivered_at'])

  const factText = order.factura_text ?? (order.invoice_required ? (order.invoice_id ? String(order.invoice_id) : 'Requiere') : 'No requiere')
  o.factura        = factText
  o.regimen        = Number(order.invoice_required) === 1 ? order.tax_regimen || '—' : '—'
  o.uso_cfdi       = Number(order.invoice_required) === 1 ? order.cfdi_use || '—' : '—'
  o.pending_invoice = Number(order.invoice_required) === 1 && !order.invoice_id
  o.comentarios    = order.advisor_comment || ''

  const erpOriginal = order.erp_order_id_original || order.erp_order_id_orig || order.erp_order_id_prev || null
  const groupList   = order.erp_group_list ?? order.group_list ?? order.groups ?? []
  const agTk = []
  if (erpOriginal && erpOriginal !== order.erp_order_id) agTk.push(erpOriginal)
  if (Array.isArray(groupList) && groupList.length) agTk.push(...groupList)
  o.agregados = agTk.length ? agTk.join(', ') : (order.erp_group_count > 0 ? `+${order.erp_group_count}` : '')

  return o
}

async function fetchOrders() {
  loading.value = true
  try {
    await loadCashierCodes()
    const { data } = await api.get('/foraneos', { params: { include_returned: 1, include_pasa: 1 } })

    const keyOf = o => String(o.erp_order_id || '').trim().toUpperCase() || `id:${o.id}`
    const timeValue = o => Math.max(...[o.last_status_change_at, o.returned_at, o.changed_erp_at, o.facturado_at, o.created_at].map(v => v ? new Date(v).getTime() : 0))

    const processed = data.map(processOrder)
    const dedup = Object.values(processed.reduce((acc, o) => {
      const k = keyOf(o)
      if (!acc[k] || timeValue(o) > timeValue(acc[k])) acc[k] = o
      return acc
    }, {}))

    orders.value = dedup.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return ta !== tb ? ta - tb : (a.id || 0) - (b.id || 0)
    })

    const newReturns = processed.filter(isReturned)
    const byId = new Map(returnedArchive.value.map(x => [x.id, x]))
    for (const o of newReturns) {
      const prev = byId.get(o.id)
      const tNew = o.returned_at ? new Date(o.returned_at).getTime() : 0
      const tOld = prev?.returned_at ? new Date(prev.returned_at).getTime() : 0
      if (!prev || tNew >= tOld) byId.set(o.id, o)
    }
    returnedArchive.value = Array.from(byId.values())

    await recomputeFiltered()
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

// ── Rangos rápidos ────────────────────────────────────────────────────────
function setQuickRange(type) {
  const today = new Date()
  const hoy   = ymdLocal(today)
  expandedKey.value = null
  if (type === 'hoy')  { filterFrom.value = hoy; filterTo.value = hoy }
  else if (type === 'ayer') {
    const y = new Date(today); y.setDate(y.getDate() - 1)
    filterFrom.value = ymdLocal(y); filterTo.value = ymdLocal(y)
  }
  else if (type === '7') {
    const s = new Date(today); s.setDate(s.getDate() - 6)
    filterFrom.value = ymdLocal(s); filterTo.value = hoy
  }
  else if (type === 'mes') {
    filterFrom.value = ymdLocal(new Date(today.getFullYear(), today.getMonth(), 1))
    filterTo.value   = ymdLocal(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  }
  recomputeFiltered()
}

// ── Buckets ───────────────────────────────────────────────────────────────
function statusToBucket(statusRaw = '') {
  const s = String(statusRaw).toLowerCase().trim()
  if (['aplicando pago','surtidor_asignado','surtiendo','facturado'].includes(s)) return 'surtiendo'
  if (s === 'surtido')                          return 'surtido'
  if (s === 'empacando' || s === 'packed')      return 'empacando'
  if (s === 'enviando'  || s === 'enviado')     return 'enviando'
  if (s === 'entregado')                        return 'entregados'
  return 'otros'
}

const BUCKETS = [
  { key: 'surtiendo',  label: 'Surtiendo',  color: '#0ea5e9' },
  { key: 'surtido',    label: 'Surtido',    color: '#34d399' },
  { key: 'empacando',  label: 'Empacando',  color: '#6d28d9' },
  { key: 'enviando',   label: 'Enviando',   color: '#f59e0b' },
  { key: 'entregados', label: 'Entregados', color: '#10b981' },
]

function bucketColor(b) { return BUCKETS.find(x => x.key === b)?.color || '#9ca3af' }
function bucketLabel(b) { return BUCKETS.find(x => x.key === b)?.label || b }

function getResponsible(o, bucket) {
  if (bucket === 'surtiendo' || bucket === 'surtido') return o.surtidor_name || '—'
  if (bucket === 'empacando') return o.packed_by_name || '—'
  if (bucket === 'enviando')  return o.shipped_by_name || o.delivered_by_name || '—'
  if (bucket === 'entregados') return o.delivered_by_name || o.shipped_by_name || '—'
  return o.assigned_to_name || '—'
}

// ── Computed por carrier ──────────────────────────────────────────────────
const byCarrier = computed(() => {
  const map = {}
  for (const o of displayOrders.value) {
    const c = o.carrier || 'Sin paquetería'
    if (!map[c]) map[c] = []
    map[c].push(o)
  }
  return map
})
const carrierNames = computed(() => Object.keys(byCarrier.value).sort((a, b) => a.localeCompare(b)))

const bucketTotals = computed(() => {
  const t = { surtiendo: 0, surtido: 0, enviando: 0, empacando: 0, entregados: 0 }
  for (const o of displayOrders.value) {
    const b = statusToBucket(o.status)
    if (t[b] != null) t[b]++
  }
  return t
})

function carrierCounts(carrier) {
  const list = byCarrier.value[carrier] || []
  const c = { total: list.length, surtiendo: 0, surtido: 0, empacando: 0, enviando: 0, entregados: 0 }
  for (const o of list) { const b = statusToBucket(o.status); if (c[b] != null) c[b]++ }
  return c
}

// ── Expand / collapse ─────────────────────────────────────────────────────
function toggleCarrier(carrier, bucket) {
  const key = `${carrier}__${bucket}`
  expandedKey.value = expandedKey.value === key ? null : key
}
function toggleSummary(bucket) {
  const key = `ALL__${bucket}`
  expandedKey.value = expandedKey.value === key ? null : key
}

const expandedScope   = computed(() => expandedKey.value ? (expandedKey.value.startsWith('ALL__') ? 'all' : 'carrier') : null)
const expandedBucket  = computed(() => expandedKey.value ? expandedKey.value.split('__')[1] : null)
const expandedCarrier = computed(() => expandedScope.value === 'carrier' ? expandedKey.value.split('__')[0] : null)
const expandedList    = computed(() => {
  if (!expandedKey.value) return []
  const b = expandedBucket.value
  if (expandedScope.value === 'all') {
    return displayOrders.value.filter(o => statusToBucket(o.status) === b).sort((a, b2) => {
      const ca = (a.carrier || 'zzz').localeCompare(b2.carrier || 'zzz')
      return ca !== 0 ? ca : (a.id - b2.id)
    })
  }
  return (byCarrier.value[expandedCarrier.value] || []).filter(o => statusToBucket(o.status) === b).sort((a, b2) => a.id - b2.id)
})

// ── Exportar Excel ────────────────────────────────────────────────────────
function exportOrders() {
  const data = displayOrders.value.map(o => ({
    'Turno #': o.turno_seq || '',
    'Pedido': o.erp_order_id || '',
    'Cantidad': o.quantity || o.quantity_total || '',
    'Cliente': o.customer_name || '',
    'Estatus': o.status_view || o.status || '',
    'Factura': o.factura || '',
    'Régimen': o.regimen || '',
    'Uso CFDI': o.uso_cfdi || '',
    'Agregados': o.agregados || '',
    'Paquetería': o.carrier || 'Sin paquetería',
    'Guía': o.guia || '',
    'Vendedor': o.sales_person || '',
    'Facturado Por': o.facturado_por_name || '',
    'Comentarios': o.comentarios || '',
    'Hora Registro': o.time_created_at || '',
    'Hora Facturado': o.time_facturado_at || '',
    'Surtidor': o.surtidor_name || '',
    'Hora Surtiendo': o.time_surtiendo_at || '',
    'Hora Surtido': o.time_surtido_at || '',
    'Empacador': o.packed_by_name || '',
    'Hora Empacando': o.time_empacado_at || '',
    'Despachador': o.despachador_name || '',
    'Entregó': o.delivered_by_name || '',
    'Hora Entregado': o.time_delivered_at || '',
    'T. a Facturar': o.diff_a_facturar || '',
    'T. a Surtir': o.diff_a_surtir || '',
    'T. a Empacar': o.diff_a_empacar || '',
    'T. a Entregar': o.diff_a_entregar || '',
    'Tiempo Total': o.diff_total || '',
    'Fecha Registro': o.date_created_at || '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte')
  XLSX.writeFile(wb, `ReporteForaneos_${filterFrom.value}_a_${filterTo.value}.xlsx`)
}

function exportReturned() {
  const data = displayReturned.value.map(o => {
    const guias = Array.isArray(o.guia) ? o.guia : String(o.guia || '').split(/[,\s;|]+/).filter(Boolean)
    return {
      'Pedido': o.erp_order_id || '',
      'Cliente': o.customer_name || '',
      'Motivo devolución': o.return_reason || 'Sin motivo',
      'Comentarios': o.comentarios || o.advisor_comment || '',
      'Cajera Asignada': o.assigned_to_name || '',
      'Facturado Por': o.facturado_por_name || '',
      'Vendedor': o.sales_person || '',
      'Paquetería / Guías': (o.carrier || 'Sin paquetería') + (guias.length ? ` • ${guias.join(' | ')}` : ''),
      'Fecha devolución': fmtDateTimeLocalDisplay(o.returned_at),
    }
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Devueltos')
  XLSX.writeFile(wb, `TurnosDevueltos_${filterFrom.value}_a_${filterTo.value}.xlsx`)
}

function parseGuias(o) {
  const raw = o.guia
  return Array.isArray(raw) ? raw : String(raw || '').split(/[,\s;|]+/).map(s => s.trim()).filter(Boolean)
}

onMounted(fetchOrders)
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">

    <!-- Barra superior fija -->
    <div class="flex-none bg-gradient-to-r from-green-800 to-green-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-green-900 hover:bg-green-50 border-0 font-bold" @click="$router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">📊 Reporte Foráneos</span>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => $router.push('/login'))">Salir</button>
    </div>

    <!-- Filtros fijos -->
    <div class="flex-none bg-base-100 border-b border-base-300 px-4 py-2 flex flex-wrap gap-3 items-center shadow-sm">
      <div class="flex gap-2 items-center">
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] text-base-content/50 leading-none">Desde</label>
          <input type="date" v-model="filterFrom" class="input input-bordered input-xs w-36" @change="recomputeFiltered" />
        </div>
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] text-base-content/50 leading-none">Hasta</label>
          <input type="date" v-model="filterTo" class="input input-bordered input-xs w-36" @change="recomputeFiltered" />
        </div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-xs" @click="setQuickRange('hoy')">Hoy</button>
        <button class="btn btn-xs" @click="setQuickRange('ayer')">Ayer</button>
        <button class="btn btn-xs" @click="setQuickRange('7')">Últ. 7 días</button>
        <button class="btn btn-xs" @click="setQuickRange('mes')">Este mes</button>
      </div>
      <!-- Buscador: solo 001 y 002 -->
      <div v-if="isGerente" class="flex items-center gap-1">
        <input
          v-model="searchText"
          type="text"
          placeholder="Buscar cliente, agente o pedido..."
          class="input input-bordered input-xs w-56"
        />
        <button v-if="searchText" class="btn btn-xs btn-ghost" @click="searchText = ''">✕</button>
      </div>

      <div class="ml-auto flex items-center gap-3">
        <span class="text-xs text-base-content/70">
          <b class="text-base-content">{{ displayOrders.length }}</b> {{ displayOrders.length === 1 ? 'turno' : 'turnos' }}
        </span>
        <button class="btn btn-xs btn-primary" :class="{ 'loading': loading }" @click="fetchOrders">
          <span v-if="!loading">↻ Actualizar</span>
          <span v-else>Cargando...</span>
        </button>
      </div>
    </div>

    <!-- Tabs fijos -->
    <div class="flex-none bg-base-100 border-b border-base-300 px-4 flex gap-1 pt-1">
      <button
        v-for="(label, key) in { general: 'Reporte General', detalle: 'Reporte Detalle', devueltos: `Turnos Devueltos${displayReturned.length ? ` (${displayReturned.length})` : ''}` }"
        :key="key"
        class="px-4 py-1.5 text-sm font-medium border-b-2 transition-colors"
        :class="activeTab === key ? 'border-green-700 text-green-800' : 'border-transparent text-base-content/50 hover:text-base-content'"
        @click="activeTab = key"
      >{{ label }}</button>
    </div>

    <!-- Área scrollable principal -->
    <div class="flex-1 overflow-y-auto overflow-x-hidden p-4">

      <!-- TAB: REPORTE GENERAL -->
      <div v-if="activeTab === 'general'">

        <div v-if="loading" class="flex justify-center py-16">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>

        <template v-else>
          <!-- Paqueterías -->
          <h2 class="font-bold text-xl mb-3">Paqueterías</h2>

          <!-- Panel detalle carrier -->
          <div v-if="expandedBucket && expandedScope === 'carrier'" class="card bg-base-100 shadow mb-4">
            <div class="card-body p-0 overflow-hidden">
              <div class="flex items-center justify-between px-4 py-3 text-white font-bold" :style="`background:${bucketColor(expandedBucket)}`">
                <span>{{ bucketLabel(expandedBucket) }} • {{ expandedList.length }} <span class="opacity-70 text-sm font-normal ml-2">{{ expandedCarrier }}</span></span>
                <button class="btn btn-xs bg-black/20 border-0 text-white" @click="expandedKey = null">Cerrar ✕</button>
              </div>
              <div class="overflow-x-auto">
                <table class="table table-xs">
                  <thead><tr>
                    <th>Cliente</th><th>Pedido</th><th>Factura</th>
                    <th>Responsable</th><th>Vendedor</th><th>Agregados</th>
                    <th>Régimen</th><th>Uso CFDI</th>
                  </tr></thead>
                  <tbody>
                    <tr v-if="expandedList.length === 0"><td colspan="8" class="text-center text-base-content/40">Sin registros.</td></tr>
                    <tr v-for="o in expandedList" :key="o.id">
                      <td class="max-w-48 truncate" :title="o.customer_name">{{ o.customer_name || '—' }}</td>
                      <td class="tabular-nums">{{ o.erp_order_id || '—' }}</td>
                      <td class="tabular-nums" :class="{ 'font-bold': o.pending_invoice }">
                        <a v-if="o.invoice_file_url" :href="`/${o.invoice_file_url}`" target="_blank" class="link">{{ o.factura || '—' }}</a>
                        <span v-else>{{ o.factura || '—' }}</span>
                      </td>
                      <td>{{ getResponsible(o, expandedBucket) }}</td>
                      <td>{{ o.sales_person || '—' }}</td>
                      <td class="max-w-40 truncate">{{ o.agregados || '—' }}</td>
                      <td :title="o.regimen">{{ o.regimen || '—' }}</td>
                      <td :title="o.uso_cfdi">{{ o.uso_cfdi || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Cards por carrier -->
          <div v-if="carrierNames.length === 0" class="text-base-content/50 mb-6">No hay turnos para mostrar.</div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
            <div v-for="carrier in carrierNames" :key="carrier" class="card bg-base-100 shadow overflow-hidden">
              <div class="flex items-center justify-between px-3 py-2 bg-[#0b1020]">
                <span class="text-white font-black text-sm truncate" :title="carrier">{{ carrier }}</span>
                <span class="badge badge-sm bg-white/20 text-white border-0 font-bold">{{ carrierCounts(carrier).total }}</span>
              </div>
              <div class="grid grid-cols-2 gap-2 p-2">
                <template v-for="b in BUCKETS.slice(0,4)" :key="b.key">
                  <button
                    class="rounded-lg py-2 px-2 text-white text-xs font-bold flex justify-between items-center transition-all"
                    :style="`background:${b.color}; opacity:${carrierCounts(carrier)[b.key] === 0 ? '0.4' : '1'}; outline:${expandedKey === carrier+'__'+b.key ? '2px solid rgba(0,0,0,0.15)' : 'none'}`"
                    :disabled="carrierCounts(carrier)[b.key] === 0"
                    @click="carrierCounts(carrier)[b.key] > 0 && toggleCarrier(carrier, b.key)"
                  >
                    <span>{{ b.label }}</span>
                    <span>{{ carrierCounts(carrier)[b.key] }}</span>
                  </button>
                </template>
                <button
                  class="col-span-2 rounded-lg py-2 px-2 text-white text-xs font-bold flex justify-between items-center transition-all"
                  :style="`background:${BUCKETS[4].color}; opacity:${carrierCounts(carrier)['entregados'] === 0 ? '0.4' : '1'}; outline:${expandedKey === carrier+'__entregados' ? '2px solid rgba(0,0,0,0.15)' : 'none'}`"
                  :disabled="carrierCounts(carrier)['entregados'] === 0"
                  @click="carrierCounts(carrier)['entregados'] > 0 && toggleCarrier(carrier, 'entregados')"
                >
                  <span>Entregados</span>
                  <span>{{ carrierCounts(carrier)['entregados'] }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Resumen general -->
          <h2 class="font-bold text-xl mb-3">Resumen general</h2>

          <!-- Panel detalle summary -->
          <div v-if="expandedBucket && expandedScope === 'all'" class="card bg-base-100 shadow mb-4">
            <div class="card-body p-0 overflow-hidden">
              <div class="flex items-center justify-between px-4 py-3 text-white font-bold" :style="`background:${bucketColor(expandedBucket)}`">
                <span>{{ bucketLabel(expandedBucket) }} • {{ expandedList.length }} <span class="opacity-70 text-sm font-normal ml-2">Resumen General</span></span>
                <button class="btn btn-xs bg-black/20 border-0 text-white" @click="expandedKey = null">Cerrar ✕</button>
              </div>
              <div class="overflow-x-auto">
                <table class="table table-xs">
                  <thead><tr>
                    <th>Cliente</th><th>Pedido</th><th>Factura</th>
                    <th>Responsable</th><th>Vendedor</th><th>Agregados</th>
                    <th>Régimen</th><th>Uso CFDI</th>
                  </tr></thead>
                  <tbody>
                    <tr v-if="expandedList.length === 0"><td colspan="8" class="text-center text-base-content/40">Sin registros.</td></tr>
                    <tr v-for="o in expandedList" :key="o.id">
                      <td class="max-w-48 truncate" :title="o.customer_name">{{ o.customer_name || '—' }}</td>
                      <td class="tabular-nums">{{ o.erp_order_id || '—' }}</td>
                      <td :class="{ 'font-bold': o.pending_invoice }">{{ o.factura || '—' }}</td>
                      <td>{{ getResponsible(o, expandedBucket) }}</td>
                      <td>{{ o.sales_person || '—' }}</td>
                      <td class="max-w-40 truncate">{{ o.agregados || '—' }}</td>
                      <td>{{ o.regimen || '—' }}</td>
                      <td>{{ o.uso_cfdi || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-5 gap-3">
            <button
              v-for="b in BUCKETS" :key="b.key"
              class="rounded-xl py-3 px-4 text-white font-black flex justify-between items-center text-sm transition-all"
              :style="`background:${b.color}; opacity:${bucketTotals[b.key] === 0 ? '0.4' : '1'}; outline:${expandedKey === 'ALL__'+b.key ? '2px solid rgba(0,0,0,0.15)' : 'none'}`"
              :disabled="bucketTotals[b.key] === 0"
              @click="bucketTotals[b.key] > 0 && toggleSummary(b.key)"
            >
              <span>{{ b.label }}</span>
              <span class="tabular-nums">{{ bucketTotals[b.key] }}</span>
            </button>
          </div>
        </template>
      </div>

      <!-- TAB: DETALLE -->
      <div v-if="activeTab === 'detalle'">
        <div v-if="loading" class="flex justify-center py-16">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>
        <div v-else-if="displayOrders.length === 0" class="text-base-content/50 py-6">No hay datos disponibles.</div>
        <template v-else>
          <div class="mb-3 flex gap-2">
            <button class="btn btn-sm" @click="$router.push({ name: 'selector' })">← Regresar</button>
            <button class="btn btn-sm btn-success" @click="exportOrders">⬇ Exportar Excel</button>
          </div>
          <div class="card bg-base-100 shadow overflow-hidden">
            <div class="overflow-x-auto">
              <table class="table whitespace-nowrap w-auto text-base">
                <thead class="sticky top-0 bg-base-200 z-10 text-base font-bold">
                  <tr>
                    <th>Turno</th><th>Pedido</th><th>Cant.</th><th>Cliente</th>
                    <th>Estatus</th><th>Factura</th><th>Régimen</th><th>Uso CFDI</th>
                    <th>Agregados</th><th>Paquetería</th><th>Guía</th>
                    <th>Vendedor</th><th>Facturado Por</th><th>Comentarios</th>
                    <th>H. Registro</th><th>H. Facturado</th>
                    <th>Surtidor</th><th>H. Surtiendo</th><th>H. Surtido</th>
                    <th>Empacador</th><th>H. Empacando</th>
                    <th>Despachador</th><th>Entregó</th><th>H. Entregado</th>
                    <th>T. Facturar</th><th>T. Surtir</th><th>T. Empacar</th><th>T. Entregar</th><th>T. Total</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="o in displayOrders" :key="o.id">
                    <td class="tabular-nums">{{ o.turno_seq }}</td>
                    <td class="tabular-nums">{{ o.erp_order_id || '—' }}</td>
                    <td>{{ o.quantity || o.quantity_total || '—' }}</td>
                    <td>{{ o.customer_name || '—' }}</td>
                    <td>{{ o.status_view || o.status || '—' }}</td>
                    <td :class="{ 'font-bold': o.pending_invoice }">{{ o.factura || '—' }}</td>
                    <td>{{ o.regimen || '—' }}</td>
                    <td>{{ o.uso_cfdi || '—' }}</td>
                    <td>{{ o.agregados || '—' }}</td>
                    <td>{{ o.carrier || 'Sin paquetería' }}</td>
                    <td>{{ parseGuias(o).join(', ') || '—' }}</td>
                    <td>{{ o.sales_person || '—' }}</td>
                    <td>{{ o.facturado_por_name || '—' }}</td>
                    <td>{{ o.comentarios || '—' }}</td>
                    <td class="tabular-nums">{{ o.time_created_at || '—' }}</td>
                    <td class="tabular-nums">{{ o.time_facturado_at || '—' }}</td>
                    <td>{{ o.surtidor_name || '—' }}</td>
                    <td class="tabular-nums">{{ o.time_surtiendo_at || '—' }}</td>
                    <td class="tabular-nums">{{ o.time_surtido_at || '—' }}</td>
                    <td>{{ o.packed_by_name || '—' }}</td>
                    <td class="tabular-nums">{{ o.time_empacado_at || '—' }}</td>
                    <td>{{ o.despachador_name || '—' }}</td>
                    <td>{{ o.delivered_by_name || '—' }}</td>
                    <td class="tabular-nums">{{ o.time_delivered_at || '—' }}</td>
                    <td class="tabular-nums">{{ o.diff_a_facturar || '—' }}</td>
                    <td class="tabular-nums">{{ o.diff_a_surtir || '—' }}</td>
                    <td class="tabular-nums">{{ o.diff_a_empacar || '—' }}</td>
                    <td class="tabular-nums">{{ o.diff_a_entregar || '—' }}</td>
                    <td class="tabular-nums font-bold">{{ o.diff_total || '—' }}</td>
                    <td class="tabular-nums">{{ o.date_created_at || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

      <!-- TAB: DEVUELTOS -->
      <div v-if="activeTab === 'devueltos'">
        <div v-if="loading" class="flex justify-center py-16">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>
        <div v-else-if="displayReturned.length === 0" class="text-base-content/50 py-6">
          No hay turnos devueltos en el rango seleccionado.
        </div>
        <template v-else>
          <div class="mb-3 flex gap-2">
            <button class="btn btn-sm" @click="$router.push({ name: 'selector' })">← Regresar</button>
            <button class="btn btn-sm btn-success" @click="exportReturned">⬇ Exportar Excel</button>
          </div>
          <div class="card bg-base-100 shadow overflow-hidden">
            <div class="overflow-x-auto">
              <table class="table whitespace-nowrap w-auto text-base">
                <thead class="sticky top-0 bg-base-200 z-10 text-base font-bold">
                  <tr>
                    <th>Pedido</th><th>Cliente</th><th>Motivo devolución</th>
                    <th>Comentarios</th><th>Cajera Asignada</th><th>Facturado Por</th>
                    <th>Vendedor</th><th>Paquetería / Guías</th><th>Fecha devolución</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="o in displayReturned" :key="o.id">
                    <td class="tabular-nums">{{ o.erp_order_id || '—' }}</td>
                    <td>{{ o.customer_name || '—' }}</td>
                    <td>{{ o.return_reason || 'Sin motivo' }}</td>
                    <td>{{ o.comentarios || o.advisor_comment || '—' }}</td>
                    <td>{{ o.assigned_to_name || '—' }}</td>
                    <td>{{ o.facturado_por_name || '—' }}</td>
                    <td>{{ o.sales_person || '—' }}</td>
                    <td>{{ (o.carrier || 'Sin paquetería') + (parseGuias(o).length ? ' • ' + parseGuias(o).join(', ') : '') }}</td>
                    <td class="tabular-nums">{{ fmtDateTimeLocalDisplay(o.returned_at) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

    </div><!-- fin scroll area -->
  </div><!-- fin h-screen -->
</template>
