const API_BASE = '/node-api/carrier_cajeras'

async function parseOrThrow(res) {
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message = data?.error || data?.message || `Error ${res.status}`
    throw new Error(message)
  }
  return data
}

async function getAsignaciones() {
  const res = await fetch(`${API_BASE}/carrier_cajeras`, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  })
  return parseOrThrow(res)
}

async function getAgentesCatalogo() {
  const res = await fetch('/node-api/users')
  return parseOrThrow(res)
}

async function asignarCajera(data) {
  const res = await fetch(`${API_BASE}/carrier_cajeras/actualizar-por-nombre-y-sitio`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return parseOrThrow(res)
}

async function asignarForaneos(data) {
  const res = await fetch(`${API_BASE}/carrier_cajeras/asignar-foraneos`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return parseOrThrow(res)
}

async function toggleActiva(rowId, activa) {
  const res = await fetch(`${API_BASE}/carrier_cajeras/${rowId}/toggle-activa`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activa }),
  })
  return parseOrThrow(res)
}

export default {
  getAsignaciones,
  getAgentesCatalogo,
  asignarCajera,
  asignarForaneos,
  toggleActiva,
}
