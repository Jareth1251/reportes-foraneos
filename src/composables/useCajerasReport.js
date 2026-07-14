import { ref, computed } from 'vue'
import { api } from '@/config/axios'
import { toTime, getAverageTime } from '@/utils/reportTime'

const FACTURED_STATUSES = new Set(['facturado', 'surtiendo', 'surtido', 'empacando', 'enviando', 'enviado', 'entregado'])

export function useCajerasReport(detail, dateStart, dateEnd) {
  const foraneosForCajeras = ref([])
  const foraneosLoading = ref(false)
  const siteCajeraNames = ref(new Set())
  const pageOrdersInvoicedCount = ref(null)

  async function loadSiteCajeras() {
    try {
      const res = await fetch('/node-api/users?site=3000')
      const rows = await res.json()
      const names = new Set()
      for (const u of (rows || [])) {
        if (u.name) names.add(String(u.name).trim().toUpperCase())
      }
      siteCajeraNames.value = names
    } catch (err) {
      console.error('[loadSiteCajeras]', err)
    }
  }

  async function fetchForaneosForCajeras() {
    foraneosLoading.value = true
    try {
      await loadSiteCajeras()
      const { data } = await api.get('/foraneos', { params: { include_returned: 0, include_pasa: 1 } })
      foraneosForCajeras.value = Array.isArray(data) ? data : []
    } catch (err) {
      console.error(err)
      foraneosForCajeras.value = []
    } finally {
      foraneosLoading.value = false
    }
  }

  async function fetchPageOrdersInvoicedCount() {
    try {
      const { data } = await api.get('/orders/invoiced-count', {
        params: { date_from: dateStart.value, date_to: dateEnd.value },
      })
      pageOrdersInvoicedCount.value = data?.count ?? 0
    } catch (err) {
      console.error('[fetchPageOrdersInvoicedCount]', err)
      pageOrdersInvoicedCount.value = null
    }
  }

  const cajerasReport = computed(() => {
    const checkinMap = {}
    for (const r of detail.value) {
      const nombre = String(r.usr_paying_name || '').trim()
      if (!nombre) continue
      if (siteCajeraNames.value.size > 0 && !siteCajeraNames.value.has(nombre.toUpperCase())) continue
      if (!r.order_received_at) continue
      checkinMap[nombre] = (checkinMap[nombre] || 0) + (r.erp_order_count || 1)
    }

    const fromTs = dateStart.value ? new Date(dateStart.value + 'T00:00:00').getTime() : null
    const toTs   = dateEnd.value   ? new Date(dateEnd.value   + 'T23:59:59').getTime() : null
    const foraneosMap = {}
    for (const o of foraneosForCajeras.value) {
      const cajera = o.facturado_por_name
      if (!cajera) continue
      if (siteCajeraNames.value.size > 0 && !siteCajeraNames.value.has(String(cajera).trim().toUpperCase())) continue
      if (!FACTURED_STATUSES.has(String(o.status || '').toLowerCase().trim())) continue
      const facturadoAt = o.facturado_at ? new Date(o.facturado_at).getTime() : null
      if (facturadoAt) {
        if (fromTs && facturadoAt < fromTs) continue
        if (toTs   && facturadoAt > toTs)   continue
      }
      const originalId = String(o.erp_order_id_original || o.erp_order_id || '').toUpperCase()
      const ordersInRow = originalId.startsWith('PC') ? 1 : (1 + (o.erp_group_count || 0))
      foraneosMap[cajera] = (foraneosMap[cajera] || 0) + ordersInRow
    }

    const allCajeras = new Set([...Object.keys(checkinMap), ...Object.keys(foraneosMap)])
    return Array.from(allCajeras).map(cajera => ({
      cajera,
      checkins: checkinMap[cajera] || 0,
      foraneos: foraneosMap[cajera] || 0,
      total: (checkinMap[cajera] || 0) + (foraneosMap[cajera] || 0),
    })).sort((a, b) => b.total - a.total)
  })

  const cajeraTimingReport = computed(() => {
    const checkinGroups = {}
    for (const r of detail.value) {
      const nombre = String(r.usr_paying_name || '').trim()
      if (!nombre) continue
      if (siteCajeraNames.value.size > 0 && !siteCajeraNames.value.has(nombre.toUpperCase())) continue
      if (!r.order_received_at) continue
      if (!checkinGroups[nombre]) checkinGroups[nombre] = []
      checkinGroups[nombre].push(r)
    }

    const fromTs = dateStart.value ? new Date(dateStart.value + 'T00:00:00').getTime() : null
    const toTs   = dateEnd.value   ? new Date(dateEnd.value   + 'T23:59:59').getTime() : null
    const foraneosGroups = {}
    for (const o of foraneosForCajeras.value) {
      const cajera = o.facturado_por_name
      if (!cajera) continue
      if (siteCajeraNames.value.size > 0 && !siteCajeraNames.value.has(String(cajera).trim().toUpperCase())) continue
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

  return {
    foraneosForCajeras,
    foraneosLoading,
    siteCajeraNames,
    fetchForaneosForCajeras,
    cajerasReport,
    cajeraTimingReport,
    pageOrdersInvoicedCount,
    fetchPageOrdersInvoicedCount,
  }
}
