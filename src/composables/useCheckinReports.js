import { ref } from 'vue'
import { fmtTime, timeDiff } from '@/utils/reportTime'

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

function buildGroupedOrderString(row) {
  const primary = String(row.erp_order_id || '').toUpperCase()
  const comment = String(row.comment || row.paused_comment || '').trim()
  if (!comment && !primary) return ''
  const cleaned = comment.replace(/^pedidos[^:]*:/i, '')
  let orders = [...new Set(
    cleaned
      .split(/[^A-Z0-9]+/i)
      .map((p) => p.trim().toUpperCase())
      .filter((p) => p.length > 0 && /\d/.test(p))
  )]
  if (primary && !orders.includes(primary)) orders.unshift(primary)
  if (!orders.length && primary) return primary
  return orders.join(', ')
}

function processRows(rows) {
  return rows
    .filter((row) => !!row?.arrive_at)
    .map((row) => {
      const r = { ...row }

      TIME_FIELDS.forEach((f) => { r[`time_${f}`] = fmtTime(r[f]) })
      Object.entries(DIFF_MAP).forEach(([key, [s, e]]) => { r[key] = timeDiff(r[s], r[e]) })

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

export function useCheckinReports(site) {
  const loading = ref(false)
  const totalsLoading = ref(false)
  const totals = ref({})
  const detail = ref([])

  const today = new Date().toISOString().slice(0, 10)
  const dateStart = ref(today)
  const dateEnd = ref(today)

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
