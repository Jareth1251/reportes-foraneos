import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/config/axios'

export const useForaneosStore = defineStore('foraneos', () => {
  const orders       = ref([])
  const loading      = ref(false)
  const error        = ref(null)
  const lastFetch    = ref(null)
  const actionLoading = ref(null)

  // Poll timer + guard de concurrencia — singleton en el store
  let _pollTimer   = null
  let _inFlight    = false   // igual que isRefreshingRef de React — bloquea llamadas paralelas

  function startPoll(fetchFn, ms = 120_000) {
    if (_pollTimer) clearInterval(_pollTimer)
    _pollTimer = setInterval(fetchFn, ms)
  }

  function stopPoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
  }

  const byId = computed(() => {
    const map = {}
    for (const o of orders.value) map[o.id] = o
    return map
  })

  async function fetchCajas() {
    await _fetch('/foraneos/cajas')
  }

  async function fetchAlmacen(params = {}) {
    const query = new URLSearchParams(params).toString()
    await _fetch(`/almacen2/orders${query ? '?' + query : ''}`)
  }

  async function fetchForaneos(params = {}) {
    const query = new URLSearchParams(params).toString()
    await _fetch(`/foraneos${query ? '?' + query : ''}`)
  }

  async function _fetch(endpoint) {
    if (_inFlight) return   // igual que isRefreshingRef.current en React
    _inFlight    = true
    loading.value = true
    error.value   = null
    try {
      const { data } = await api.get(endpoint)
      // almacen2 devuelve { success, orders: [] }, los demás devuelven [] directo
      orders.value = Array.isArray(data) ? data : (data.orders ?? [])
      lastFetch.value = Date.now()
    } catch (e) {
      error.value = e.response?.data?.message ?? 'Error al cargar pedidos'
    } finally {
      loading.value = false
      _inFlight     = false
    }
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  async function facturar(id, payload = {}) {
    return _action(id, () => api.post(`/foraneos/${id}/facturar`, payload))
  }

  async function updateStatus(id, newStatus) {
    return _action(id, () => api.put(`/foraneos/${id}/status`, { newStatus }))
  }

  async function setInvoice(id, invoice_id) {
    return _action(id, () => api.put(`/foraneos/${id}/invoice`, { invoice_id }))
  }

  async function updateGuia(id, guia) {
    return _action(id, () => api.put(`/foraneos/${id}/guia`, { guia }))
  }

  async function assignSurtidor(id, surtidor_id, surtidor_name) {
    return _action(id, () => api.put(`/foraneos/${id}/assign-surtidor`, { surtidor_id, surtidor_name }))
  }

  async function pack(id, agentId, agentName) {
    return _action(id, () => api.put(`/foraneos/${id}/pack`, { agentId, agentName }))
  }

  async function deliver(id, payload) {
    return _action(id, () => api.put(`/foraneos/${id}/deliver`, payload))
  }

  async function returnToAdvisor(id, return_reason) {
    return _action(id, () => api.put(`/foraneos/${id}/status`, {
      newStatus: 'aplicando pago',
      return_to_advisor: true,
      return_reason,
    }))
  }

  async function updateErp(id, newErp) {
    return _action(id, () => api.put(`/foraneos/${id}/erp`, { newErp }))
  }

  async function mergeErp(id, newErp) {
    return _action(id, () => api.put(`/foraneos/${id}/merge-erp`, { new_erp_order_id: newErp }))
  }

  async function updateFiscal(id, payload) {
    return _action(id, () => api.put(`/foraneos/${id}/fiscal`, payload))
  }

  async function sendToCheckin(id) {
    return _action(id, () => api.post(`/foraneos/${id}/send-to-checkin`))
  }

  async function pickupAndSend(id, payload) {
    return _action(id, () => api.post(`/foraneos/${id}/pickup-and-send`, payload))
  }

  async function pasaTienda(id) {
    return _action(id, () => api.put(`/foraneos/${id}/pasa-tienda`))
  }

  async function getDetail(id) {
    try {
      const { data } = await api.get(`/foraneos/${id}`)
      return data?.item ?? null
    } catch {
      return null
    }
  }

  async function fetchWarehouseAgents(site, q = '') {
    try {
      const { data } = await api.get('/warehouse-agents/options', { params: { site, q } })
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  async function cajasUpdateStatus(id, newStatus) {
    return _action(id, () => api.put(`/foraneos/${id}/cajas-status`, { newStatus }))
  }

  async function almacenAssignSurtidor(id, surtidor_id, surtidor_name) {
    return _action(id, () => api.put(`/almacen2/orders/${id}/assign-surtidor`, { surtidor_id, surtidor_name }))
  }

  async function almacenAssignDespachador(id, despachador_id, despachador_name) {
    return _action(id, () => api.put(`/almacen2/orders/${id}/assign-despachador`, { despachador_id, despachador_name }))
  }

  async function almacenUpdateStatus(id, newStatus) {
    return _action(id, () => api.put(`/almacen2/orders/${id}/status`, { newStatus }))
  }

  async function almacenPack(id, agentId, agentName) {
    return _action(id, () => api.put(`/almacen2/orders/${id}/pack`, { agentId, agentName }))
  }

  async function almacenMarkAsSent(id, guia, carrier) {
    return _action(id, () => api.put(`/almacen2/orders/${id}/mark-as-sent`, { guia, carrier }))
  }

  async function almacenMarkAsDelivered(id, delivered_by_name) {
    return _action(id, () => api.put(`/almacen2/orders/${id}/mark-as-delivered`, { delivered_by_name }))
  }

  async function _action(id, fn) {
    actionLoading.value = id
    error.value = null
    try {
      const { data } = await fn()
      return { ok: true, data }
    } catch (e) {
      const msg = e.response?.data?.message ?? e.response?.data?.error ?? 'Error al procesar'
      error.value = msg
      return { ok: false, message: msg }
    } finally {
      actionLoading.value = null
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    orders, loading, error, lastFetch, actionLoading, byId,
    fetchCajas, fetchAlmacen, fetchForaneos, getDetail, fetchWarehouseAgents,
    startPoll, stopPoll,
    facturar, updateStatus, setInvoice, updateGuia,
    assignSurtidor, pack, deliver, returnToAdvisor,
    almacenAssignSurtidor, almacenAssignDespachador, almacenUpdateStatus, almacenPack,
    almacenMarkAsSent, almacenMarkAsDelivered,
    updateErp, mergeErp, updateFiscal,
    sendToCheckin, pickupAndSend, pasaTienda, cajasUpdateStatus,
    clearError,
  }
})
