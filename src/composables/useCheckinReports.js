import { ref } from 'vue'
import { fmtTime, timeDiff } from '@/utils/reportTime'
import { buildGroupedOrderString } from '@/utils/pedidos'

// Caché de montos a nivel módulo (sobrevive entre fetchDetail y entre vistas
// que reusen este composable, ej. Reporte Maestro) -- el total de un pedido
// ya cerrado no cambia, así que una vez resuelto no hace falta volver a
// pedirlo otra vez a snapshots.
const qadOrderCache = new Map()

// remote_order_snapshots ya cachea el total de muchos pedidos (se llena al
// vuelo en otros flujos -- checkins, foráneos -- justamente para no pegarle
// a QAD). Es una sola consulta a nuestra propia BD, así que esto sí se puede
// disparar automático al cargar el reporte -- no son llamadas a QAD.
async function fetchSnapshotMontos(ids) {
  const pending = ids.filter((id) => !qadOrderCache.has(id))
  if (!pending.length) return
  try {
    const res = await fetch(`/node-api/remote-order-snapshots?ids=${pending.join(',')}`)
    const json = await res.json()
    const rows = Array.isArray(json?.result?.[0]?.data) ? json.result[0].data : []
    rows.forEach((row) => {
      const id = String(row.erp_order_id || '').trim().toUpperCase()
      if (id) qadOrderCache.set(id, { total: row.order_total })
    })
  } catch (err) {
    console.error('[useCheckinReports] error fetchSnapshotMontos', err)
  }
}

function montoForRow(r) {
  const erpIds = r.erp_order_grouped ? r.erp_order_grouped.split(',') : [r.erp_order_id]
  const sum = erpIds.reduce((acc, id) => {
    const order = qadOrderCache.get(String(id || '').trim().toUpperCase())
    return order ? acc + (Number(order.total) || 0) : acc
  }, 0)
  return sum > 0 ? sum.toFixed(2) : ''
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
  diff_total_at: ['arrive_at', 'delivered_at'],
  diff_payed_box: ['order_created_at', 'order_received_at'],
  diff_empezo_surtir: ['payed_at', 'stocked_at'],
  diff_lo_recibe_almacen: ['order_received_at', 'payed_at'],
}

const TIME_FIELDS = ['arrive_at', 'creating_order_at', 'order_created_at', 'paying_at', 'transferencia_at', 'payed_at', 'order_received_at', 'at_stock_at', 'stocked_at', 'at_deliver_at', 'delivered_at', 'canceled_at']

const STATUS_KEYS = ['arrive', 'creating_order', 'order_created', 'paying', 'payed', 'order_received', 'at_stock', 'stocked', 'at_deliver', 'delivered', 'canceled', 'transferencia', 'paused']

// Motivo real de la pausa -- viene de la columna `pause_reason` de checkins
// (códigos cortos, ver togglePause() en modalCheckin.js). No confundir con
// `comment`/`paused_comment`, que es el texto libre de pedidos agrupados.
const PAUSE_REASON_LABELS = {
  baño: 'Cliente fue al baño',
  no_responde: 'No responde',
  verificando: 'Está verificando pedido',
  salio: 'Salió de la tienda',
  agendado: 'Pedido agendado',
  diferencia_inventario: 'Diferencia de inventario',
}

function processRows(rows) {
  return rows
    .filter((row) => !!row?.arrive_at)
    .map((row) => {
      const r = { ...row }

      TIME_FIELDS.forEach((f) => { r[`time_${f}`] = fmtTime(r[f]) })
      Object.entries(DIFF_MAP).forEach(([key, [s, e]]) => { r[key] = timeDiff(r[s], r[e]) })

      r.diff_paying_at = timeDiff(r.order_created_at || r.arrive_at, r.paying_at)

      // Tramos Piso -> Cajas -> Almacén: consecutivos y sin encimarse, para que
      // su suma dé el Tiempo en Tienda (arrive_at -> delivered_at).
      // Piso termina al crearse el pedido; si llegó ya con pedido (web/agendado)
      // no hay tramo de piso y Cajas arranca desde la llegada. Cajas incluye la
      // espera, el cobro y la transferencia si la hubo.
      const cajasStart = r.order_created_at || r.arrive_at
      const cajasEnd = r.order_received_at || r.payed_at
      r.diff_sale_at = timeDiff(r.arrive_at, r.order_created_at)
      r.diff_payed_at = timeDiff(cajasStart, cajasEnd)
      r.diff_warehouse_at = timeDiff(cajasEnd, r.delivered_at)

      if (r.paused_at) {
        const pEnd = r.status !== 'paused' && r.updated_at ? r.updated_at : new Date().toISOString()
        r.diffpaused_at = timeDiff(r.paused_at, pEnd)
      } else {
        r.diffpaused_at = null
      }

      r.pause_reason_label = r.pause_reason
        ? (PAUSE_REASON_LABELS[r.pause_reason] || r.pause_reason)
        : ''

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

      // Quién colocó el pedido: de piso (quien creó la orden) o "Pagina WEB"
      // si el checkin nació de un pedido de página web.
      r.asesor = Number(r.is_web_order) === 1
        ? 'Pagina WEB'
        : (r.usr_name_creating_order || r.usr_name_order_created || '')

      // Mismo corte que ya usa el tablero de almacén para separar "menos/más
      // de 20 piezas" -- MAY = Mayoreo, MEN = Menudeo.
      r.tipo_pedidos = Number(r.quantity) > 20 ? 'MAY' : 'MEN'

      // Monto: sale solo del caché de remote_order_snapshots (sin llamadas
      // en vivo a QAD); si el pedido no tiene snapshot queda vacío.
      r.monto = montoForRow(r)

      return r
    })
}

export function useCheckinReports(site) {
  const loading = ref(false)
  const totalsLoading = ref(false)
  const totals = ref({})
  const detail = ref([])

  const today = new Date().toISOString().slice(0, 10)
  const dateStart = ref(today)
  const dateEnd = ref(today)
  let lastFetchedKey = null

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

  // El detalle es el mismo para todas las tabs (Detalle, Agendados, Almacén,
  // Piso, Picos) -- cambiar de tab no debe repetir la descarga si el rango de
  // fechas no cambió. `force` lo usa el botón "Actualizar" para forzar la
  // recarga aunque el rango sea el mismo (ver feedback_no_polling: sin polling
  // automático, el refresh manual sí debe funcionar siempre).
  async function fetchDetail({ force = false } = {}) {
    const key = `${dateStart.value}|${dateEnd.value}|${site.value ?? ''}`
    if (!force && key === lastFetchedKey) return

    loading.value = true
    try {
      const params = new URLSearchParams({ date: dateStart.value, end_date: dateEnd.value })
      if (site.value) params.append('site', site.value)

      const res = await fetch(`/node-api/checkin?${params}`)
      const json = await res.json()
      const rows = Array.isArray(json?.result?.[0]?.data) ? json.result[0].data : []

      // Monto solo desde remote_order_snapshots (nuestra BD, una sola
      // consulta) -- lo que no tenga snapshot queda vacío.
      const idsSet = new Set()
      rows.forEach((row) => {
        const grouped = buildGroupedOrderString(row) || row.erp_order_id || ''
        grouped.split(',').forEach((id) => {
          const clean = String(id || '').trim().toUpperCase()
          if (clean) idsSet.add(clean)
        })
      })
      await fetchSnapshotMontos(Array.from(idsSet))

      detail.value = processRows(rows)
      lastFetchedKey = key
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

  return {
    loading,
    totalsLoading,
    totals,
    detail,
    dateStart,
    dateEnd,
    fetchTotals,
    fetchDetail,
    changeDateRange,
    shiftDay,
  }
}
