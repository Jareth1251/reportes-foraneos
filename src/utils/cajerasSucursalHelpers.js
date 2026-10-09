export const FORANEOS_CARRIER_IDS = [1, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14]

export const SITIOS = [
  { id: '3000', label: 'Monterrey' },
  { id: '3100', label: 'CDMX' },
]

export const SUCURSALES_FILTRO = [
  { id: 'domicilio', label: 'Domicilio', icon: '🏠' },
  { id: 'cliente_pasa', label: 'Cliente pasa', icon: '🧑' },
  { id: 'saltillo', label: 'Saltillo', icon: '🏙️' },
  { id: 'foraneos', label: 'Foráneos', icon: '✈️' },
  { id: 'cdmx', label: 'CDMX', icon: '✈️' },
]

export const SUCURSALES_ASIGNAR = [
  { id: 'domicilio', label: 'Domicilio', icon: '🏠' },
  { id: 'cliente_pasa', label: 'Cliente pasa', icon: '🧑' },
  { id: 'saltillo', label: 'Saltillo', icon: '🏙️' },
  { id: 'foraneos', label: 'Foráneos', icon: '✈️' },
]

export const CARRIER_ID_MAP = {
  saltillo: 3,
  domicilio: 4,
  cliente_pasa: 5,
}

export function normalizar(v = '') {
  return String(v).trim().toLowerCase()
}

export function buildKey(codeOrName, sitio) {
  return `${normalizar(codeOrName)}__${String(sitio || '').trim()}`
}

export function getUserSite(user) {
  const siteRaw = user?.site || user?.pickup_branch || user?.branch || ''
  return String(siteRaw || '').match(/\b(3000|3100)\b/)?.[1] || '3000'
}

export function getAgentSite(agent, user) {
  const raw = agent?.site || agent?.pickup_branch || agent?.branch || ''
  return String(raw || '').match(/\b(3000|3100)\b/)?.[1] || getUserSite(user)
}

export function getSucursalesDeCajera(carrierIds = [], sitio = '') {
  const sucursales = []

  if (String(sitio) === '3100') {
    if (carrierIds.length > 0) sucursales.push('cdmx')
    return sucursales
  }

  if (carrierIds.some((id) => FORANEOS_CARRIER_IDS.includes(Number(id)))) {
    sucursales.push('foraneos')
  }
  if (carrierIds.includes(3)) sucursales.push('saltillo')
  if (carrierIds.includes(4)) sucursales.push('domicilio')
  if (carrierIds.includes(5)) sucursales.push('cliente_pasa')

  return sucursales
}

export function obtenerNombresSucursales(carrierIds = [], sitio = '') {
  if (String(sitio) === '3100' && carrierIds.length > 0) {
    return 'CDMX'
  }

  const nombres = []
  if (carrierIds.some((id) => FORANEOS_CARRIER_IDS.includes(Number(id)))) {
    nombres.push('Foráneos')
  }
  if (carrierIds.includes(3)) nombres.push('Saltillo')
  if (carrierIds.includes(4)) nombres.push('Domicilio')
  if (carrierIds.includes(5)) nombres.push('Cliente pasa')

  return nombres.join(', ')
}

export function splitArrayInHalf(items = []) {
  const middle = Math.ceil(items.length / 2)
  return [items.slice(0, middle), items.slice(middle)]
}

export function dedupeCajeras(items = []) {
  const map = new Map()

  items.forEach((item) => {
    const key = buildKey(item.cajera_code || item.nombre, item.sitio)

    if (!map.has(key)) {
      map.set(key, {
        ...item,
        row_ids: [...new Set(item.row_ids || [])],
        carrier_ids: [...new Set((item.carrier_ids || []).map(Number).filter(Boolean))],
      })
      return
    }

    const prev = map.get(key)

    map.set(key, {
      ...prev,
      nombre: prev.nombre || item.nombre,
      cajera_code: prev.cajera_code || item.cajera_code,
      sitio: prev.sitio || item.sitio,
      row_ids: [...new Set([...(prev.row_ids || []), ...(item.row_ids || [])])],
      carrier_ids: [...new Set([...(prev.carrier_ids || []), ...(item.carrier_ids || [])].map(Number).filter(Boolean))],
      activa: prev.activa !== false || item.activa !== false,
      from_bd: prev.from_bd || item.from_bd,
      from_catalog: prev.from_catalog || item.from_catalog,
    })
  })

  return Array.from(map.values())
}

// Cuando el mismo cajera_code tiene filas en BD en ambos sitios (dato viejo/duplicado),
// el panel admin debe mostrar a la persona solo en su sitio "real": el sitio donde está
// activa. Si hay conflicto real (activa en ambos, o inactiva en ambos sin pista clara),
// se deja visible en cada sitio donde aparece para que el admin lo resuelva a mano.
export function pickCanonicalSitio(entriesMismoCodigo = []) {
  if (entriesMismoCodigo.length <= 1) return entriesMismoCodigo[0]?.sitio ?? null

  const activas = entriesMismoCodigo.filter((c) => c.activa !== false)
  if (activas.length === 1) return activas[0].sitio
  if (activas.length > 1) return null

  const conCarrier = entriesMismoCodigo.filter((c) => (c.carrier_ids || []).length > 0)
  if (conCarrier.length === 1) return conCarrier[0].sitio

  return null
}

export function buildCajeraOptions(todasLasCajeras = [], inputValue = '') {
  const texto = normalizar(inputValue)

  let results = [...todasLasCajeras].filter((c) => c.activa !== false)

  if (texto) {
    results = results.filter(
      (c) => normalizar(c.nombre).includes(texto) || normalizar(c.cajera_code).includes(texto)
    )
  }

  results.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')))

  return results.slice(0, 50).map((c) => {
    const asignacionesText =
      c.carrier_ids && c.carrier_ids.length > 0
        ? ` - ${obtenerNombresSucursales(c.carrier_ids, c.sitio)}`
        : ''

    const origen = c.from_bd ? '💾' : '📋'
    const siteLabel = c.sitio === '3000' ? 'MTY' : c.sitio === '3100' ? 'CDMX' : ''

    return {
      label: `${origen} ${c.nombre} (${c.cajera_code || ''})${siteLabel ? ` [${siteLabel}]` : ''}${asignacionesText}`,
      value: c.id,
      nombre: c.nombre,
      code: c.cajera_code,
      cajera_code: c.cajera_code,
      sitio: c.sitio,
      carrier_ids: c.carrier_ids || [],
      activa: c.activa,
    }
  })
}
