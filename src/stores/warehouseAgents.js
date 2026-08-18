import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/config/axios'

export const useWarehouseAgentsStore = defineStore('warehouseAgents', () => {
  const rows    = ref([])
  const loading = ref(false)
  const error   = ref(null)

  // El backend (WarehouseAgentController) resuelve el site desde el login del
  // token de Sanctum (request->user()->agent) — no hace falta mandarlo aquí.
  async function fetchAgents({ q = '', includeInactive = false } = {}) {
    loading.value = true
    error.value   = null
    try {
      const { data } = await api.get('/warehouse-agents', {
        params: {
          q,
          ...(includeInactive ? { include_inactive: 1 } : {}),
        },
      })
      rows.value = Array.isArray(data) ? data : (data?.data ?? [])
    } catch (e) {
      error.value = e.response?.data?.message ?? 'No se pudo cargar la lista de agentes'
    } finally {
      loading.value = false
    }
  }

  async function createAgent(payload) {
    return _write(() => api.post('/warehouse-agents', payload))
  }

  async function updateAgent(id, payload) {
    return _write(() => api.put(`/warehouse-agents/${encodeURIComponent(id)}`, payload))
  }

  async function deleteAgent(id) {
    return _write(() => api.delete(`/warehouse-agents/${encodeURIComponent(id)}?hard=1`))
  }

  async function _write(fn) {
    loading.value = true
    error.value   = null
    try {
      const { data } = await fn()
      return { ok: true, data }
    } catch (e) {
      const msg = e.response?.data?.message ?? 'No se pudo guardar el agente'
      error.value = msg
      return { ok: false, message: msg }
    } finally {
      loading.value = false
    }
  }

  function clearError() { error.value = null }

  return { rows, loading, error, fetchAgents, createAgent, updateAgent, deleteAgent, clearError }
})
