import { computed, ref } from 'vue'
import { api } from '@/config/axios'
import { useReporteMaestro } from './useReporteMaestro'
import { weekInfo, weekDays, dayLabel, toYmd, addDays } from '@/utils/warehouseWeek'
import { EXCLUDED_CARRIERS, EXCLUDED_DRIVERS, EXCLUDED_STATUSES } from '@/config/warehouseDashboard'

// Tablero de Indicadores de Almacén: réplica web del Excel semanal del
// encargado de almacén (TABLERO_INDICADORES_ALMACEN). Todo se calcula al vuelo
// para la semana elegida (lunes a domingo) desde:
//   - Reporte Maestro Monterrey (tienda, foráneo, página, errores MTY)
//   - Reporte Maestro CDMX (tienda México, errores CDMX)
//   - Última Milla (API-Base /warehouse-dashboard/deliveries)
//   - Transferencias (POS back /transfer-report)
// Cada vista se describe como { cards, tables } para que la pantalla y el
// Excel exportado salgan de la misma definición.

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim()
}

function carrierKey(value) {
  return norm(value).replace(/[\s-]+/g, '')
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// El Excel cuenta celdas no vacías de "Conteo de pedidos": "N/A" sí cuenta.
function filled(value) {
  return value !== '' && value != null
}

function isWorked(row) {
  return !EXCLUDED_STATUSES.includes(norm(row.status_label))
}

function isCanceled(row) {
  return norm(row.status_label).startsWith('cancel')
}

function isTiendaArea(row) {
  return row.area === 'Tienda' || row.area === 'Cliente pasa'
}

function isExcludedCarrier(carrier) {
  return EXCLUDED_CARRIERS.includes(carrierKey(carrier))
}

function isExcludedDriver(name) {
  const upper = String(name || '').toUpperCase().replace(/Y/g, 'I')
  return EXCLUDED_DRIVERS.some((words) => words.every((w) => upper.includes(w)))
}

function prettyLabel(value, fallback = '(sin dato)') {
  const text = String(value ?? '').trim()
  if (!text || text === 'N/A') return fallback
  return text
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

const fmtInt = (n) => Math.round(num(n)).toLocaleString('es-MX')
const fmtMoney = (n) => num(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const fmtPct = (n, digits = 1) => `${(num(n) * 100).toFixed(digits)}%`
const ratio = (a, b) => (b ? a / b : 0)

// --- agregaciones -----------------------------------------------------------

function totals(list, pieces = (r) => num(r.quantity)) {
  return { pedidos: list.length, piezas: list.reduce((s, r) => s + pieces(r), 0) }
}

function byDay(list, days, dateOf, pieces = (r) => num(r.quantity)) {
  const map = new Map(days.map((d) => [d, { pedidos: 0, piezas: 0 }]))
  for (const r of list) {
    const bucket = map.get(dateOf(r))
    if (!bucket) continue
    bucket.pedidos += 1
    bucket.piezas += pieces(r)
  }
  const rows = days
    .map((d) => ({ key: dayLabel(d), ...map.get(d) }))
    .filter((r, i) => i < 6 || r.pedidos > 0) // el domingo solo si hubo operación
  return withTotal(rows, ['pedidos', 'piezas'])
}

function groupBy(list, keyOf, pieces = (r) => num(r.quantity)) {
  const map = new Map()
  for (const r of list) {
    const key = keyOf(r)
    if (!map.has(key)) map.set(key, { key, pedidos: 0, piezas: 0 })
    const bucket = map.get(key)
    bucket.pedidos += 1
    bucket.piezas += pieces(r)
  }
  return [...map.values()].sort((a, b) => b.pedidos - a.pedidos || String(a.key).localeCompare(String(b.key)))
}

function withTotal(rows, sumKeys, label = 'Total') {
  if (!rows.length) return rows
  const total = { key: label, _total: true }
  for (const k of sumKeys) total[k] = rows.reduce((s, r) => s + num(r[k]), 0)
  return [...rows, total]
}

const COLS_PED_PZS = [
  { key: 'key', label: '' },
  { key: 'pedidos', label: 'Pedidos', format: fmtInt, bar: true },
  { key: 'piezas', label: 'Piezas', format: fmtInt },
]

function table(title, firstLabel, rows, columns = COLS_PED_PZS) {
  return {
    title,
    columns: columns.map((c, i) => (i === 0 ? { ...c, label: firstLabel } : c)),
    rows,
  }
}

// --- errores de surtido -----------------------------------------------------

// Incidencias con área "Surtido" ligadas a los pedidos de la semana. Una
// incidencia puede colgar de varias filas (agregados / turno), por eso se
// deduplica por id.
function surtidoErrors(rows) {
  const seen = new Map()
  for (const row of rows) {
    for (const inc of row._incidents || []) {
      if (inc.department !== 'surtido' || seen.has(inc.id)) continue
      seen.set(inc.id, {
        id: inc.id,
        pedido: inc.erp_order_id || row.erp_order || '',
        area: row.area,
        agente: String(inc.agent_name || '').trim() || '(sin agente)',
        tipo: inc.incident_type_name || '(sin tipo)',
        detalle: [inc.cause, inc.comment].map((t) => String(t || '').trim()).filter(Boolean).join(' — '),
        fecha: String(inc.created_at || '').slice(0, 10),
      })
    }
  }
  return [...seen.values()]
}

function errorsView(rows, errors, totalPedidos) {
  const worked = rows.filter(isWorked)
  const bySurtidor = new Map()
  const keyOf = (name) => norm(name)
  for (const r of worked) {
    const name = String(r.surtidor || '').trim()
    if (!name || name === 'N/A') continue
    const k = keyOf(name)
    if (!bySurtidor.has(k)) bySurtidor.set(k, { key: name.toUpperCase(), pedidos: 0, piezas: 0, errores: 0 })
    const b = bySurtidor.get(k)
    b.pedidos += 1
    b.piezas += num(r.quantity)
  }
  for (const e of errors) {
    const k = keyOf(e.agente)
    if (!bySurtidor.has(k)) bySurtidor.set(k, { key: e.agente.toUpperCase(), pedidos: 0, piezas: 0, errores: 0 })
    bySurtidor.get(k).errores += 1
  }
  const surtidorRows = [...bySurtidor.values()]
    .map((r) => ({ ...r, pct: ratio(r.errores, r.pedidos) }))
    .sort((a, b) => b.pedidos - a.pedidos)

  const tipos = [...new Set(errors.map((e) => e.tipo))].sort()
  const matrix = new Map()
  for (const e of errors) {
    const k = e.agente.toUpperCase()
    if (!matrix.has(k)) matrix.set(k, { key: k, total: 0, ...Object.fromEntries(tipos.map((t) => [t, 0])) })
    const r = matrix.get(k)
    r[e.tipo] += 1
    r.total += 1
  }
  const matrixRows = [...matrix.values()].sort((a, b) => b.total - a.total)

  return {
    cards: [
      { label: 'Errores de surtido', value: fmtInt(errors.length), sub: `${fmtPct(ratio(errors.length, totalPedidos), 2)} de los pedidos` },
      { label: 'Surtidores con error', value: fmtInt(matrixRows.length), sub: `de ${fmtInt(surtidorRows.filter((r) => r.pedidos).length)} que surtieron` },
      ...groupBy(errors, (e) => e.tipo).slice(0, 4).map((g) => ({ label: g.key, value: fmtInt(g.pedidos), sub: 'errores' })),
    ],
    tables: [
      table('Pedidos y errores por surtidor', 'Surtidor', withTotal(surtidorRows, ['pedidos', 'piezas', 'errores']), [
        ...COLS_PED_PZS,
        { key: 'errores', label: 'Errores', format: fmtInt },
        { key: 'pct', label: '% error', format: (v) => (v === undefined ? '' : fmtPct(v, 2)) },
      ]),
      table('Errores por tipo', 'Surtidor', withTotal(matrixRows, ['total', ...tipos]), [
        { key: 'key', label: '' },
        ...tipos.map((t) => ({ key: t, label: t, format: (v) => (num(v) ? fmtInt(v) : '') })),
        { key: 'total', label: 'Total', format: fmtInt, bar: true },
      ]),
      {
        title: 'Detalle de errores',
        columns: [
          { key: 'pedido', label: 'Pedido' },
          { key: 'area', label: 'Área' },
          { key: 'agente', label: 'Agente' },
          { key: 'tipo', label: 'Tipo' },
          { key: 'detalle', label: 'Detalle', wrap: true },
        ],
        rows: errors,
      },
    ],
  }
}

// --- composable -------------------------------------------------------------

export function useWarehouseDashboard() {
  const week = ref(weekInfo(toYmd(new Date())))
  const mty = useReporteMaestro(ref('3000'))
  const cdmx = useReporteMaestro(ref('3100'))
  const deliveries = ref([])
  const transfers = ref([])
  const loading = ref(false)
  const failures = ref([])
  const loadedAt = ref(null)

  async function fetchDeliveries(from, to) {
    const { data } = await api.get('/warehouse-dashboard/deliveries', { params: { from, to } })
    return Array.isArray(data?.data) ? data.data : []
  }

  async function fetchTransfers(from, to) {
    const res = await fetch(`/node-api/transfer-report?${new URLSearchParams({ from, to })}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return Array.isArray(json?.data) ? json.data : []
  }

  async function fetchAll() {
    const { start, end } = week.value
    loading.value = true
    failures.value = []
    for (const rm of [mty, cdmx]) {
      rm.dateStart.value = start
      rm.dateEnd.value = end
    }
    const guard = (label, promise, target) =>
      promise
        .then((value) => { if (target) target.value = value })
        .catch((err) => {
          console.error(`[useWarehouseDashboard] ${label}`, err)
          failures.value.push(label)
          if (target) target.value = []
        })
    await Promise.all([
      guard('Reporte Maestro Monterrey', mty.fetchAll({ force: true })),
      guard('Reporte Maestro CDMX', cdmx.fetchAll({ force: true })),
      guard('Última Milla', fetchDeliveries(start, end), deliveries),
      guard('Transferencias', fetchTransfers(start, end), transfers),
    ])
    loadedAt.value = new Date()
    loading.value = false
  }

  function shiftWeek(delta) {
    week.value = weekInfo(addDays(week.value.start, delta * 7))
    fetchAll()
  }

  function setWeekFromDate(ymd) {
    if (!ymd) return
    week.value = weekInfo(ymd)
    fetchAll()
  }

  const inWeek = (ymd) => ymd >= week.value.start && ymd <= week.value.end
  const days = computed(() => weekDays(week.value.start))

  const mtyRows = computed(() => mty.rows.value.filter((r) => inWeek(String(r.fecha))))
  const cdmxRows = computed(() => cdmx.rows.value.filter((r) => inWeek(String(r.fecha))))

  // --- Tienda (Monterrey) ---
  const tiendaAll = computed(() => mtyRows.value.filter(isTiendaArea))
  const tienda = computed(() => tiendaAll.value.filter((r) => isWorked(r) && filled(r.erp_order_count)))
  const tiendaCanceled = computed(() => tiendaAll.value.filter(isCanceled))

  // --- Foráneo ---
  const foraneo = computed(() =>
    mtyRows.value.filter((r) => r.area === 'Foráneo' && isWorked(r) && !isExcludedCarrier(r.paqueteria))
  )

  // --- Página ---
  const pagina = computed(() =>
    mtyRows.value.filter((r) => r.area === 'Página' && isWorked(r) && filled(r.pedido_web) && r.pedido_web !== 'N/A')
  )

  // --- Domicilio (Última Milla): solo pedidos entregados ---
  const domicilioAll = computed(() =>
    deliveries.value.filter((d) => d.trip_type !== 'extraordinario' && String(d.erp_order_id || '').trim())
  )
  const domicilio = computed(() => domicilioAll.value.filter((d) => norm(d.status_label) === 'entregado'))
  const domicilioPending = computed(() => domicilioAll.value.length - domicilio.value.length)
  const domicilioSinExcluidos = computed(() => domicilio.value.filter((d) => !isExcludedDriver(d.driver_name)))
  const deliveryPieces = (d) => num(d.pieces)

  // --- México (tienda CDMX) ---
  const mexicoAll = computed(() => cdmxRows.value.filter(isTiendaArea))
  const mexico = computed(() => mexicoAll.value.filter((r) => norm(r.status_label) === 'entregado' && filled(r.erp_order_count)))
  const mexicoCanceled = computed(() => mexicoAll.value.filter(isCanceled))

  // --- Errores ---
  const errorsMty = computed(() => surtidoErrors(mtyRows.value))
  const errorsCdmx = computed(() => surtidoErrors(mexicoAll.value))

  // --- Transferencias ---
  const transferData = computed(() => {
    const active = transfers.value.filter((t) => !['pending', 'canceled'].includes(t.status))
    const notCanceled = transfers.value.filter((t) => t.status !== 'canceled')
    const pending = transfers.value.filter((t) => t.status === 'pending')
    const sumItems = (list, field) => list.reduce((s, t) => s + t.items.reduce((a, i) => a + num(i[field]), 0), 0)
    const bySite = (site) => {
      const list = active.filter((t) => String(t.origin).toUpperCase() === site)
      return {
        list,
        count: list.length,
        piezas: sumItems(list, 'quantity_requested'),
        costo: list.reduce((s, t) => s + num(t.shipping_cost), 0),
      }
    }
    return {
      mty: bySite('MTY'),
      cdmx: bySite('CDMX'),
      pendingItems: pending.reduce((s, t) => s + t.items.length, 0),
      pendingPiezas: sumItems(pending, 'quantity_requested'),
      enviado: sumItems(notCanceled, 'quantity_sent'),
      recibido: sumItems(notCanceled, 'quantity_received'),
    }
  })

  function transferTables(site, label) {
    const { list } = transferData.value[site]
    const perTransfer = list
      .map((t) => ({
        key: `#${t.id}`,
        estatus: t.status === 'received' ? 'Recibida' : t.status === 'transit' ? 'En tránsito' : t.status,
        solicito: t.requested_by_name || t.requested_by || '',
        piezas: t.items.reduce((a, i) => a + num(i.quantity_requested), 0),
        costo: num(t.shipping_cost),
      }))
      .sort((a, b) => b.piezas - a.piezas)
    const byModel = new Map()
    for (const t of list) {
      for (const i of t.items) {
        const k = i.model || i.item || '(sin modelo)'
        byModel.set(k, (byModel.get(k) || 0) + num(i.quantity_requested))
      }
    }
    const modelRows = [...byModel.entries()].map(([key, piezas]) => ({ key, piezas })).sort((a, b) => b.piezas - a.piezas)
    return [
      table(`Solicitadas por ${label}`, 'Transferencia', withTotal(perTransfer, ['piezas', 'costo']), [
        { key: 'key', label: '' },
        { key: 'solicito', label: 'Solicitó' },
        { key: 'estatus', label: 'Estatus' },
        { key: 'piezas', label: 'Piezas', format: fmtInt, bar: true },
        { key: 'costo', label: 'Costo envío', format: fmtMoney },
      ]),
      table(`Piezas por modelo · ${label}`, 'Modelo', withTotal(modelRows, ['piezas']), [
        { key: 'key', label: '' },
        { key: 'piezas', label: 'Piezas', format: fmtInt, bar: true },
      ]),
    ]
  }

  // --- Vistas ---
  const views = computed(() => {
    const t = totals(tienda.value)
    const f = totals(foraneo.value)
    const d = totals(domicilio.value, deliveryPieces)
    const p = totals(pagina.value)
    const total = { pedidos: t.pedidos + f.pedidos + d.pedidos + p.pedidos, piezas: t.piezas + f.piezas + d.piezas + p.piezas }
    const mx = totals(mexico.value)
    const tr = transferData.value
    const fecha = (r) => String(r.fecha)

    const general = {
      cards: [
        { label: 'Tienda', value: fmtInt(t.pedidos), sub: `${fmtInt(t.piezas)} piezas`, view: 'tienda' },
        { label: 'Foráneo', value: fmtInt(f.pedidos), sub: `${fmtInt(f.piezas)} piezas`, view: 'foraneo' },
        { label: 'Domicilio', value: fmtInt(d.pedidos), sub: `${fmtInt(d.piezas)} piezas`, view: 'domicilio' },
        { label: 'Página', value: fmtInt(p.pedidos), sub: `${fmtInt(p.piezas)} piezas`, view: 'pagina' },
        { label: 'Total pedidos', value: fmtInt(total.pedidos), sub: `${fmtInt(total.piezas)} piezas` },
        { label: 'Piezas por pedido', value: ratio(total.piezas, total.pedidos).toFixed(1), sub: 'promedio de la semana' },
        { label: 'Turnos cancelados', value: fmtInt(tiendaCanceled.value.length), sub: 'Tienda / Cliente pasa', view: 'tienda' },
        { label: 'Errores de surtido', value: fmtInt(errorsMty.value.length), sub: `${fmtPct(ratio(errorsMty.value.length, total.pedidos), 2)} de los pedidos`, view: 'errores' },
        { label: 'México · entregados', value: fmtInt(mx.pedidos), sub: `${fmtInt(mx.piezas)} piezas`, view: 'mexico' },
        { label: 'México · cancelados', value: fmtInt(mexicoCanceled.value.length), sub: `${fmtPct(ratio(mexicoCanceled.value.length, mexicoCanceled.value.length + mx.pedidos))} de los turnos`, view: 'mexico' },
        { label: 'Transf. solicitadas MTY', value: fmtInt(tr.mty.count), sub: `${fmtInt(tr.mty.piezas)} piezas`, view: 'transferencias' },
        { label: 'Transf. solicitadas CDMX', value: fmtInt(tr.cdmx.count), sub: `${fmtInt(tr.cdmx.piezas)} piezas`, view: 'transferencias' },
        { label: 'Costo de envío', value: fmtMoney(tr.mty.costo + tr.cdmx.costo), sub: `MTY ${fmtMoney(tr.mty.costo)} · CDMX ${fmtMoney(tr.cdmx.costo)}`, view: 'transferencias' },
        { label: 'Pendientes de envío', value: fmtInt(tr.pendingItems), sub: `${fmtInt(tr.pendingPiezas)} piezas por enviar`, view: 'transferencias' },
        { label: '% recibido (transf.)', value: fmtPct(ratio(tr.recibido, tr.enviado)), sub: `${fmtInt(tr.recibido)} de ${fmtInt(tr.enviado)} piezas`, view: 'transferencias' },
      ],
      tables: [],
    }

    const mayMen = groupBy(tienda.value, (r) => (r.tipo_pedidos === 'MAY' ? 'Mayoreo' : 'Menudeo'))

    return {
      general,
      tienda: {
        cards: general.cards.filter((c) => ['Tienda', 'Turnos cancelados'].includes(c.label)),
        tables: [
          table('Pedidos por día', 'Día', byDay(tienda.value, days.value, fecha)),
          table('Mayoreo / Menudeo (más de 20 piezas = mayoreo)', 'Tipo', withTotal(mayMen, ['pedidos', 'piezas'])),
          table('Turnos cancelados por motivo', 'Motivo', withTotal(
            groupBy(tiendaCanceled.value, (r) => String(r.razon_cancelacion || '').trim() || '(sin motivo)'), ['pedidos']
          ), [{ key: 'key', label: '' }, { key: 'pedidos', label: 'Turnos', format: fmtInt, bar: true }]),
        ],
      },
      foraneo: {
        cards: general.cards.filter((c) => c.label === 'Foráneo'),
        tables: [
          table('Pedidos por día', 'Día', byDay(foraneo.value, days.value, fecha)),
          table('Envíos por paquetería', 'Paquetería', withTotal(groupBy(foraneo.value, (r) => prettyLabel(r.paqueteria)), ['pedidos', 'piezas'])),
        ],
      },
      domicilio: {
        cards: [
          ...general.cards.filter((c) => c.label === 'Domicilio'),
          { label: 'Sin Uriel Veloz', value: fmtInt(domicilioSinExcluidos.value.length), sub: `${fmtInt(totals(domicilioSinExcluidos.value, deliveryPieces).piezas)} piezas` },
          { label: 'Aún sin entregar', value: fmtInt(domicilioPending.value), sub: 'asignados / en camino (no cuentan)' },
        ],
        tables: [
          table('Pedidos entregados por día', 'Día', byDay(domicilio.value, days.value, (r) => r.route_date, deliveryPieces)),
          table('Pedidos entregados por chofer', 'Chofer', withTotal(groupBy(domicilio.value, (r) => r.driver_name || '(sin chofer)', deliveryPieces), ['pedidos', 'piezas'])),
          table('Pedidos entregados por ruta', 'Ruta', withTotal(groupBy(domicilio.value, (r) => r.route_code || '(sin ruta)', deliveryPieces), ['pedidos', 'piezas'])),
        ],
      },
      pagina: {
        cards: general.cards.filter((c) => c.label === 'Página'),
        tables: [
          table('Pedidos por día', 'Día', byDay(pagina.value, days.value, fecha)),
          table('Pedidos por tipo de envío', 'Tipo de envío', withTotal(groupBy(pagina.value, (r) => prettyLabel(r.paqueteria)), ['pedidos', 'piezas'])),
        ],
      },
      mexico: {
        cards: general.cards.filter((c) => c.label.startsWith('México')),
        tables: [
          table('Pedidos entregados por día', 'Día', byDay(mexico.value, days.value, fecha)),
          table('Cancelaciones por motivo', 'Motivo', withTotal(
            groupBy(mexicoCanceled.value, (r) => String(r.razon_cancelacion || '').trim() || '(sin motivo)'), ['pedidos']
          ), [{ key: 'key', label: '' }, { key: 'pedidos', label: 'Turnos', format: fmtInt, bar: true }]),
          table('Turnos y piezas por surtidor', 'Surtidor', withTotal(
            groupBy(mexico.value.filter((r) => filled(r.surtidor) && r.surtidor !== 'N/A'), (r) => String(r.surtidor).toUpperCase()), ['pedidos', 'piezas']
          )),
        ],
      },
      errores: errorsView(mtyRows.value, errorsMty.value, total.pedidos),
      erroresMx: errorsView(mexicoAll.value, errorsCdmx.value, mx.pedidos),
      transferencias: {
        cards: general.cards.filter((c) => c.view === 'transferencias'),
        tables: [...transferTables('mty', 'MTY (envía CDMX)'), ...transferTables('cdmx', 'CDMX (envía MTY)')],
      },
    }
  })

  return { week, days, loading, failures, loadedAt, views, fetchAll, shiftWeek, setWeekFromDate }
}
