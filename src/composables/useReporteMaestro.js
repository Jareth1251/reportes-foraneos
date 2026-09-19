import { computed, ref } from 'vue'
import { api } from '@/config/axios'
import { fmtTime, timeDiff } from '@/utils/reportTime'
import { MAESTRO_FIELDS } from '@/components/reporteMaestro/reportFields'
import { useCheckinReports } from './useCheckinReports'

const NA = 'N/A'

// Fila base: todo en "N/A" -- cada mapper solo sobreescribe las columnas que
// sí existen para su origen; lo que queda en NA es porque esa área no tiene
// ese concepto (no porque el dato venga vacío).
function naRow() {
  const row = {}
  Object.keys(MAESTRO_FIELDS).forEach((k) => { row[k] = NA })
  return row
}

function normCarrier(c) {
  return String(c || '').toLowerCase().trim().replace(/\s+/g, '_')
}

function ymdLocal(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

// Misma regla que ya separa el tablero de almacén en "menos/más de 20 piezas".
function clasificacionPor(qty) {
  return Number(qty) > 20 ? 'Mayoreo' : 'Menudeo'
}

function mapTiendaRow(r) {
  const row = naRow()
  Object.assign(row, {
    area: 'Tienda',
    turn: r.turn ?? '',
    name: r.name || '',
    erp_order: r.erp_order_grouped || r.erp_order_id || '',
    erp_order_count: r.erp_order_count ?? '',
    quantity: r.quantity ?? '',
    asesor: r.asesor || '',
    tipo_pedidos: clasificacionPor(r.quantity) === 'Mayoreo' ? 'MAY' : 'MEN',
    status_label: r.status_label || '',
    incidencias: r.incidencias || '',
    incidencias_agentes: r.incidencias_agentes || '',
    llego: r.time_arrive_at || '',
    registro_turno: r.usr_arrive_name || '',
    atendio_piso: r.usr_name_creating_order || '',
    se_creo_pedido: r.time_order_created_at || '',
    atendio_cajas: r.usr_name_paying || '',
    envio_transferencia: r.time_transferencia_at || '',
    finalizo_pago: r.time_order_received_at || '',
    empezo_surtir: r.time_at_stock_at || '',
    se_surtio: r.time_stocked_at || '',
    surtidor: r.usr_name_at_stock || '',
    asigno_entrega: r.usr_name_at_deliver || '',
    se_entrego: r.time_delivered_at || '',
    lo_entrego: r.usr_name_delivered || '',
    se_cancelo: r.time_canceled_at || '',
    razon_cancelacion: r.cancel_comment || '',
    motivo_pausa: r.pause_reason_label || '',
    lo_pauso: r.usr_name_paused || '',
    tiempo_atencion_piso: r.diff_creating_order_at || '',
    tiempo_creacion_pedido: r.diff_order_created_at || '',
    tiempo_atencion_cajas: r.diff_paying_at || '',
    tiempo_transferencia: r.diff_transferencia_at || '',
    tiempo_pago: r.diff_payment_time || '',
    tiempo_recibir_pedido: r.diff_order_received_delay || '',
    tiempo_atencion_almacen: r.diff_at_stock_at || '',
    tiempo_surtir: r.diff_stocked_at || '',
    tiempo_entregar: r.diff_at_deliver_at || '',
    tiempo_entrega: r.diff_delivered_at || '',
    tiempo_piso: r.diff_sale_at || '',
    tiempo_cajas: r.diff_payed_at || '',
    tiempo_almacen: r.diff_warehouse_at || '',
    tiempo_tienda: r.diff_total_at || '',
    tiempo_pausado: r.diffpaused_at || '',
    clasificacion: clasificacionPor(r.quantity),
    fecha: String(r.arrive_at || '').slice(0, 10),
  })
  return row
}

// Mismos campos que usa la tab "Reporte Detalle" de ForaneosRepView.vue,
// replicados aquí (esa vista no los expone como composable reusable).
// turno_seq es un folio por día calculado al vuelo, no viene de la BD.
function mapForaneoRow(order, seq, area) {
  const createdAt = order.created_at || null
  const facturadoAt = order.facturado_at || null
  const surtiendoAt = order.surtiendo_at || order.surtidor_asignado_at || null
  const surtidoAt = order.surtido_at || null
  const empacadoAt = order.empacado_at || order.packed_at || null
  const deliveredAt = order.delivered_at || null

  const groupList = order.erp_group_list ?? order.group_list ?? order.groups ?? []
  const agregados = Array.isArray(groupList) && groupList.length
    ? groupList.join(', ')
    : (order.erp_group_count > 0 ? `+${order.erp_group_count}` : '')

  const guias = Array.isArray(order.guia)
    ? order.guia.join(', ')
    : String(order.guia || '').split(/[,\s;|]+/).map((s) => s.trim()).filter(Boolean).join(', ')

  const row = naRow()
  Object.assign(row, {
    area,
    turn: seq,
    name: order.customer_name || '',
    erp_order: order.erp_order_id || '',
    agregados,
    quantity: order.quantity ?? order.quantity_total ?? '',
    asesor: order.sales_person || '',
    tipo_pedidos: clasificacionPor(order.quantity ?? order.quantity_total) === 'Mayoreo' ? 'MAY' : 'MEN',
    status_label: order.status || '',
    paqueteria: order.carrier || 'Sin paquetería',
    guia: guias,
    factura: Number(order.invoice_required) === 1 ? (order.invoice_id ? String(order.invoice_id) : 'Requiere') : 'No requiere',
    regimen: Number(order.invoice_required) === 1 ? (order.tax_regimen || '—') : '—',
    uso_cfdi: Number(order.invoice_required) === 1 ? (order.cfdi_use || '—') : '—',
    facturado_por: order.facturado_por_name || order.assigned_to_name || order.sales_person || '',
    comentarios: order.advisor_comment || '',
    llego: fmtTime(createdAt),
    empezo_surtir: fmtTime(surtiendoAt),
    se_surtio: fmtTime(surtidoAt),
    surtidor: order.surtidor_name || '',
    empacador: order.packed_by_name || '',
    se_empaco: fmtTime(empacadoAt),
    despachador: order.despachador_name || '',
    se_entrego: fmtTime(deliveredAt),
    lo_entrego: order.delivered_by_name || '',
    tiempo_surtir: timeDiff(surtiendoAt, surtidoAt),
    tiempo_empacar: timeDiff(surtidoAt, empacadoAt),
    tiempo_entregar: timeDiff(empacadoAt, deliveredAt),
    tiempo_facturar: timeDiff(createdAt, facturadoAt),
    tiempo_total: timeDiff(createdAt, deliveredAt),
    clasificacion: clasificacionPor(order.quantity ?? order.quantity_total),
    fecha: createdAt ? String(createdAt).slice(0, 10) : '',
  })
  return row
}

function parsePaidAt(value) {
  if (!value) return null
  const [datePart, timePart] = String(value).split(' ')
  const [day, month, year] = (datePart || '').split('/').map(Number)
  if (!day || !month || !year) return null
  const [hours, minutes] = (timePart || '').split(':').map(Number)
  return new Date(year, month - 1, day, hours || 0, minutes || 0)
}

function formatCarrier(value) {
  if (!value) return ''
  return String(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Mismos campos que usa PedidosPaginaRepView.vue, replicados aquí por la
// misma razón (no está expuesto como composable reusable).
function mapPaginaRow(order) {
  const paidAt = order.paid_at || order.added_manually_at || null
  const paidDate = parsePaidAt(order.paid_at) || parsePaidAt(order.added_manually_at)

  const row = naRow()
  Object.assign(row, {
    area: 'Página',
    name: order.customer || '',
    pedido_web: order.id ?? '',
    erp_order: order.erp_order_id || '',
    quantity: order.quantity_total ?? '',
    tipo_pedidos: clasificacionPor(order.quantity_total) === 'Mayoreo' ? 'MAY' : 'MEN',
    status_label: order.status_final || '',
    current_status: order.current_status || '',
    paqueteria: formatCarrier(order.carrier),
    guia: Array.isArray(order.tracking_codes) ? order.tracking_codes.join(', ') : '',
    facturado_por: order.Facturador || '',
    comprobante_pago: order.comprobante_pago_path ? 'Sí' : 'Sin comprobante',
    incidencias: order.incomplete_reason || '',
    solucion_aplicada: order.solution || '',
    llego: fmtTime(paidAt),
    empezo_surtir: fmtTime(order.surtido_start),
    se_surtio: fmtTime(order.surtido_end),
    surtidor: order.surtidor || '',
    empacador: order.empacador || '',
    se_empaco: fmtTime(order.empacado_at),
    despachador: order.despachador || '',
    se_entrego: fmtTime(order.entregado_at),
    lo_entrego: order.entregador || '',
    tiempo_surtir: timeDiff(order.surtido_start, order.surtido_end),
    tiempo_empacar: timeDiff(order.despachado_at, order.empacado_at),
    tiempo_entregar: timeDiff(order.surtido_end, order.despachado_at),
    tiempo_cajas: timeDiff(order.empacado_at, order.facturado_at),
    tiempo_entrega: timeDiff(order.facturado_at, order.entregado_at),
    tiempo_total: paidDate ? timeDiff(paidDate.toISOString(), order.entregado_at || order.facturado_at) : '',
    clasificacion: clasificacionPor(order.quantity_total),
    fecha: paidDate ? ymdLocal(paidDate) : '',
  })
  return row
}

export function useReporteMaestro(site) {
  const loading = ref(false)
  const dateStart = ref(ymdLocal())
  const dateEnd = ref(ymdLocal())

  const tiendaRows = ref([])
  const foraneoAndPaginaRows = ref([])

  const checkinReports = useCheckinReports(site)

  const rows = computed(() =>
    [...tiendaRows.value, ...foraneoAndPaginaRows.value].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  )

  async function fetchAll({ force = false } = {}) {
    loading.value = true
    try {
      checkinReports.dateStart.value = dateStart.value
      checkinReports.dateEnd.value = dateEnd.value

      const [, foraneosData, paginaData] = await Promise.all([
        checkinReports.fetchDetail({ force: true }),
        api.get('/foraneos', {
          params: { include_returned: 1, include_pasa: 1, from: dateStart.value, to: dateEnd.value },
        }).then((r) => r.data).catch((err) => {
          console.error('[useReporteMaestro] error foraneos', err)
          return []
        }),
        api.get('/admin/orders/paid', {
          params: { date_from: dateStart.value, date_to: dateEnd.value, strict_date: 1 },
        }).then((r) => r.data?.data || []).catch((err) => {
          console.error('[useReporteMaestro] error pagina', err)
          return []
        }),
      ])

      tiendaRows.value = checkinReports.detail.value.map(mapTiendaRow)

      const foraneosSorted = (Array.isArray(foraneosData) ? foraneosData : [])
        .slice()
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))

      const perDay = {}
      const foraneoRows = foraneosSorted.map((o) => {
        const dateKey = o.created_at ? String(o.created_at).slice(0, 10) : '—'
        perDay[dateKey] = (perDay[dateKey] || 0) + 1
        const area = normCarrier(o.carrier) === 'domicilio' ? 'Domicilio' : 'Foráneo'
        return mapForaneoRow(o, perDay[dateKey], area)
      })

      const paginaRows = (paginaData || []).map(mapPaginaRow)

      foraneoAndPaginaRows.value = [...foraneoRows, ...paginaRows]
    } catch (err) {
      console.error('[useReporteMaestro] error', err)
    } finally {
      loading.value = false
    }
  }

  function shiftDay(delta) {
    const d = new Date(dateStart.value + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    const next = ymdLocal(d)
    dateStart.value = next
    dateEnd.value = next
    fetchAll({ force: true })
  }

  return { loading, dateStart, dateEnd, rows, fetchAll, shiftDay }
}
