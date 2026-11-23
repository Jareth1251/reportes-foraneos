import { api } from '@/config/axios'

// Devoluciones de tienda (API-Base StoreReturnController), solo almacén (007).
// El pedido se lee de QAD en el backend (SalesOrder/read): vendedor, cliente,
// factura y líneas con código, color y talla. Respuestas sin `data` wrapper.

// Las claves deben coincidir con StoreReturn::REASONS de API-Base.
export const RETURN_REASONS = [
  { key: 'error_asesor',      label: 'Error de asesor' },
  { key: 'solicitud_cliente', label: 'Solicitud del cliente' },
  { key: 'otro',              label: 'Otro' },
]

export async function lookupOrder(salesOrderId) {
  const { data } = await api.get(`/store-returns/lookup/${encodeURIComponent(salesOrderId)}`, { timeout: 40000 })
  return data
}

export async function listStoreReturns({ from, to, search }) {
  const { data } = await api.get('/store-returns', { params: { from, to, search: search || undefined } })
  return data
}

export async function createStoreReturn(payload) {
  const { data } = await api.post('/store-returns', payload, { timeout: 40000 })
  return data
}

export async function deleteStoreReturn(id) {
  await api.delete(`/store-returns/${id}`)
}

export function apiErrorMessage(e, fallback) {
  const errors = e?.response?.data?.errors
  if (errors) return Object.values(errors).flat()[0]
  return e?.response?.data?.message ?? fallback
}
