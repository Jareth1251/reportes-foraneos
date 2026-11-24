

     // services/incidents.js
import { api } from '@/config/axios'

const upper = (s) => String(s ?? '').trim().toUpperCase()

export const fetchIncidentTypes = (department) =>
  api.get('/surtido/incident-types', { params: { department } })
     .then(r => r.data)
     .then(data => ({
       ...data,
       data: (data?.data ?? []).map(t => ({ ...t, name: upper(t.name) })),
     }))

export const fetchIncidentsByOrder = (erpOrderId) =>
  api.get(`/surtido/incidents/by-order/${encodeURIComponent(erpOrderId)}`)
     .then(r => r.data)

export const fetchIncidentAgents = (department, site = null, q = '') =>
  api.get('/surtido/agents', { params: { department, site, q } })
     .then(r => r.data?.data ?? [])
     .then(list => (Array.isArray(list) ? list : []).map(a => ({
       ...a,
       name: upper(a.name),
     })))

export const createIncident = (payload) =>
  api.post('/surtido/incidents', payload)
     .then(r => r.data)
// Incidencias con cliente: cliente, asesor y factura (QAD) + surtidor,
// despachador y área responsable sugerida. QAD puede tardar varios segundos.
export const fetchIncidentOrderContext = (erpOrderId) =>
  api.get(`/surtido/incidents/order-context/${encodeURIComponent(erpOrderId)}`, { timeout: 40000 })
     .then(r => r.data?.data ?? null)

export const fetchCustomerIncidentReport = (params) =>
  api.get('/surtido/incidents/customer-report', { params })
     .then(r => r.data?.data ?? [])

export const RESPONSIBLE_AREAS = [
  { value: 'domicilio', label: 'Domicilio' },
  { value: 'foraneo',   label: 'Foráneo' },
  { value: 'mostrador', label: 'Mostrador' },
]
