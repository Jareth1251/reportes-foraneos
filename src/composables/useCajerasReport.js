import { ref, computed } from 'vue'
import { api } from '@/config/axios'
import { toTime, getAverageTime, timeDiff } from '@/utils/reportTime'
import { collapseConsolidatedPedidos, buildGroupedOrderString } from '@/utils/pedidos'
import { checkinInvoicedAt } from '@/utils/checkins'

const SIN_IDENTIFICAR = 'Sin identificar'

function normalizeForMatch(s) {
  return String(s || '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

export function useCajerasReport(dateStart, dateEnd) {
  const checkinsForCajeras = ref([])
  const checkinsLoading = ref(false)
  const foraneosForCajeras = ref([])
  const foraneosLoading = ref(false)
  const siteCajeraNames = ref(new Set())
  const siteCajeraCanonical = ref(new Map())
  const siteCajeraNormalized = ref(new Map())
  const pageOrdersInvoicedCount = ref(null)

  async function loadSiteCajeras() {
    try {
      const res = await fetch('/node-api/users?site=3000')
      const rows = await res.json()
      const names = new Set()
      const canonical = new Map()
      const normalized = new Map()
      for (const u of (rows || [])) {
        if (u.name) {
          const trimmed = String(u.name).trim()
          const key = trimmed.toUpperCase()
          names.add(key)
          canonical.set(key, trimmed)
          normalized.set(normalizeForMatch(trimmed), trimmed)
        }
      }
      siteCajeraNames.value = names
      siteCajeraCanonical.value = canonical
      siteCajeraNormalized.value = normalized
    } catch (err) {
      console.error('[loadSiteCajeras]', err)
    }
  }

  // Si el nombre no calza con ningun usuario del site, antes se descartaba en
  // silencio (el pedido desaparecia del reporte). Ahora se agrupa bajo "Sin
  // identificar (nombre)" para que la discrepancia sea visible en vez de
  // perderse. Ver investigación 2026-08-07.
  function canonicalName(raw) {
    const trimmed = String(raw || '').trim()
    if (!trimmed) return null
    if (siteCajeraNames.value.size === 0) return trimmed
    const key = trimmed.toUpperCase()
    if (siteCajeraCanonical.value.has(key)) return siteCajeraCanonical.value.get(key)
    const normalized = siteCajeraNormalized.value.get(normalizeForMatch(trimmed))
    return normalized || `${SIN_IDENTIFICAR} (${trimmed})`
  }

  // Endpoint dedicado y liviano (solo los campos que este reporte usa) que ya
  // filtra por la fecha real de facturación en el backend -- ver
  // routes/api.js `/checkin/cajeras` en point-of-sale-back.
  async function fetchCheckinsForCajeras() {
    checkinsLoading.value = true
    try {
      const params = new URLSearchParams({ date: dateStart.value, end_date: dateEnd.value })
      const res = await fetch(`/node-api/checkin/cajeras?${params}`)
      const json = await res.json()
      const rows = Array.isArray(json?.result?.[0]?.data) ? json.result[0].data : []
      checkinsForCajeras.value = rows.map((r) => {
        const grouped = buildGroupedOrderString(r) || r.erp_order_id || ''
        return {
          ...r,
          erp_order_grouped: grouped,
          erp_order_count: grouped ? grouped.split(',').filter(Boolean).length : 0,
          diff_paying_at: timeDiff(r.order_created_at || r.arrive_at, r.paying_at),
          diff_payment_time: timeDiff(r.paying_at, r.order_received_at),
          diff_payed_box: timeDiff(r.order_created_at, r.order_received_at),
        }
      })
    } catch (err) {
      console.error(err)
      checkinsForCajeras.value = []
    } finally {
      checkinsLoading.value = false
    }
  }

  // Endpoint dedicado y liviano para foráneos -- ya filtra por facturado_at
  // (no created_at) en el backend, ver RemoteOrderService::listForCajerasReport.
  async function fetchForaneosForCajeras() {
    foraneosLoading.value = true
    try {
      await loadSiteCajeras()
      const { data } = await api.get('/foraneos/cajeras-report', {
        params: {
          include_returned: 0,
          include_pasa: 1,
          from: dateStart.value,
          to: dateEnd.value,
        },
      })
      foraneosForCajeras.value = Array.isArray(data) ? data : []
    } catch (err) {
      console.error(err)
      foraneosForCajeras.value = []
    } finally {
      foraneosLoading.value = false
    }
  }

  async function fetchAllCajeras() {
    await loadSiteCajeras()
    await Promise.all([fetchCheckinsForCajeras(), fetchForaneosForCajeras()])
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

  const cajerasDetail = computed(() => {
    const map = {}
    const bucket = (cajera) => (map[cajera] ||= { checkinRows: [], foraneoRows: [] })

    for (const r of checkinsForCajeras.value) {
      const rawNombre = String(r.usr_paying_name || '').trim()
      if (!rawNombre) continue
      if (!checkinInvoicedAt(r)) continue
      if (['canceled', 'cancelled'].includes(String(r.status || '').toLowerCase().trim())) continue
      const nombre = canonicalName(rawNombre)
      if (!nombre) continue
      bucket(nombre).checkinRows.push(r)
    }

    for (const o of foraneosForCajeras.value) {
      const rawCajera = o.facturado_por_name
      if (!rawCajera) continue
      const cajera = canonicalName(rawCajera)
      if (!cajera) continue
      bucket(cajera).foraneoRows.push(o)
    }

    return map
  })

  // El reporte cuenta "cuántos pedidos se facturaron ese día", sin importar
  // paquetería/canal -- por eso foráneos y checkins deduplican por folio con un
  // Set en vez de sumar por fila: el mismo erp_order_id puede aparecer como
  // pedido propio en una fila y como miembro de erp_group_list en otra (mismo
  // pedido, dos registros), y sumarlos por fila lo contaba dos veces.
  // Ver investigación 2026-08-07.
  const cajerasReport = computed(() => {
    const map = cajerasDetail.value
    return Object.keys(map).map(cajera => {
      const { checkinRows, foraneoRows } = map[cajera]

      const checkinPedidos = new Set()
      for (const r of checkinRows) {
        const grouped = String(r.erp_order_grouped || r.erp_order_id || '').split(',').map(s => s.trim()).filter(Boolean)
        grouped.forEach((p) => checkinPedidos.add(p))
      }

      const foraneoPedidos = new Set()
      for (const o of foraneoRows) {
        const pedidos = collapseConsolidatedPedidos([o.erp_order_id, ...(o.erp_group_list || [])])
        pedidos.forEach((p) => foraneoPedidos.add(p))
      }

      const checkins = checkinPedidos.size
      const foraneos = foraneoPedidos.size
      return { cajera, checkins, foraneos, total: checkins + foraneos }
    }).sort((a, b) => b.total - a.total)
  })

  const cajeraTimingReport = computed(() => {
    const checkinGroups = {}
    for (const r of checkinsForCajeras.value) {
      const rawNombre = String(r.usr_paying_name || '').trim()
      if (!rawNombre) continue
      if (!checkinInvoicedAt(r)) continue
      if (['canceled', 'cancelled'].includes(String(r.status || '').toLowerCase().trim())) continue
      const nombre = canonicalName(rawNombre)
      if (!nombre) continue
      if (!checkinGroups[nombre]) checkinGroups[nombre] = []
      checkinGroups[nombre].push(r)
    }

    const foraneosGroups = {}
    for (const o of foraneosForCajeras.value) {
      const rawCajera = o.facturado_por_name
      if (!rawCajera) continue
      if (String(o.order_status || '').toUpperCase() === 'CANCELADO') continue
      if (!o.facturado_at || !o.created_at) continue
      const facturadoAt = new Date(o.facturado_at).getTime()
      const createdAt = new Date(o.created_at).getTime()
      const diffSec = (facturadoAt - createdAt) / 1000
      if (diffSec < 0) continue
      const cajera = canonicalName(rawCajera)
      if (!cajera) continue
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
    checkinsForCajeras,
    checkinsLoading,
    foraneosForCajeras,
    foraneosLoading,
    siteCajeraNames,
    fetchAllCajeras,
    fetchForaneosForCajeras,
    cajerasReport,
    cajerasDetail,
    cajeraTimingReport,
    pageOrdersInvoicedCount,
    fetchPageOrdersInvoicedCount,
  }
}
