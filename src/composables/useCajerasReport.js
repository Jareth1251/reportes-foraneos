import { ref, computed } from 'vue'
import { api } from '@/config/axios'
import { toTime, getAverageTime } from '@/utils/reportTime'

const FACTURED_STATUSES = new Set(['facturado', 'surtiendo', 'surtido', 'empacando', 'enviando', 'enviado', 'entregado'])

function normalizeForMatch(s) {
  return String(s || '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

function checkinInvoicedAt(r) {
  return r.order_received_at || r.agendado_at || null
}

export function useCajerasReport(detail, dateStart, dateEnd) {
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

  function canonicalName(raw) {
    const trimmed = String(raw || '').trim()
    if (!trimmed) return null
    if (siteCajeraNames.value.size === 0) return trimmed
    const key = trimmed.toUpperCase()
    if (siteCajeraCanonical.value.has(key)) return siteCajeraCanonical.value.get(key)
    return siteCajeraNormalized.value.get(normalizeForMatch(trimmed)) || null
  }

  async function fetchForaneosForCajeras() {
    foraneosLoading.value = true
    try {
      await loadSiteCajeras()
      const { data } = await api.get('/foraneos', {
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
    const fromTs = dateStart.value ? new Date(dateStart.value + 'T00:00:00').getTime() : null
    const toTs   = dateEnd.value   ? new Date(dateEnd.value   + 'T23:59:59').getTime() : null

    const map = {}
    const bucket = (cajera) => (map[cajera] ||= { checkinRows: [], foraneoRows: [] })

    for (const r of detail.value) {
      const rawNombre = String(r.usr_paying_name || '').trim()
      if (!rawNombre) continue
      const invoicedAt = checkinInvoicedAt(r)
      if (!invoicedAt) continue
      const receivedAt = new Date(invoicedAt).getTime()
      if (fromTs && receivedAt < fromTs) continue
      if (toTs   && receivedAt > toTs)   continue
      if (['canceled', 'cancelled'].includes(String(r.status || '').toLowerCase().trim())) continue
      const nombre = canonicalName(rawNombre)
      if (!nombre) continue
      bucket(nombre).checkinRows.push(r)
    }

    for (const o of foraneosForCajeras.value) {
      const rawCajera = o.facturado_por_name
      if (!rawCajera) continue
      if (String(o.carrier || '').toUpperCase() === 'CLIENTE') continue
      if (!FACTURED_STATUSES.has(String(o.status || '').toLowerCase().trim())) continue
      const facturadoAt = o.facturado_at ? new Date(o.facturado_at).getTime() : null
      if (facturadoAt) {
        if (fromTs && facturadoAt < fromTs) continue
        if (toTs   && facturadoAt > toTs)   continue
      }
      const cajera = canonicalName(rawCajera)
      if (!cajera) continue
      bucket(cajera).foraneoRows.push(o)
    }

    return map
  })

  const cajerasReport = computed(() => {
    const map = cajerasDetail.value
    return Object.keys(map).map(cajera => {
      const { checkinRows, foraneoRows } = map[cajera]
      const checkins = checkinRows.reduce((s, r) => s + (r.erp_order_count || 1), 0)
      const foraneos = foraneoRows.length
      return { cajera, checkins, foraneos, total: checkins + foraneos }
    }).sort((a, b) => b.total - a.total)
  })

  const cajeraTimingReport = computed(() => {
    const fromTs = dateStart.value ? new Date(dateStart.value + 'T00:00:00').getTime() : null
    const toTs   = dateEnd.value   ? new Date(dateEnd.value   + 'T23:59:59').getTime() : null

    const checkinGroups = {}
    for (const r of detail.value) {
      const rawNombre = String(r.usr_paying_name || '').trim()
      if (!rawNombre) continue
      const invoicedAt = checkinInvoicedAt(r)
      if (!invoicedAt) continue
      const receivedAt = new Date(invoicedAt).getTime()
      if (fromTs && receivedAt < fromTs) continue
      if (toTs   && receivedAt > toTs)   continue
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
      if (String(o.carrier || '').toUpperCase() === 'CLIENTE') continue
      if (!FACTURED_STATUSES.has(String(o.status || '').toLowerCase().trim())) continue
      if (String(o.order_status || '').toUpperCase() === 'CANCELADO') continue
      if (!o.facturado_at || !o.created_at) continue
      const facturadoAt = new Date(o.facturado_at).getTime()
      if (fromTs && facturadoAt < fromTs) continue
      if (toTs   && facturadoAt > toTs)   continue
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
    foraneosForCajeras,
    foraneosLoading,
    siteCajeraNames,
    fetchForaneosForCajeras,
    cajerasReport,
    cajerasDetail,
    cajeraTimingReport,
    pageOrdersInvoicedCount,
    fetchPageOrdersInvoicedCount,
  }
}
