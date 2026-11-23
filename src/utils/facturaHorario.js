// Corte de facturación por paquetería (igual que FacturaFueraHorarioBadge de point-of-sale).
const CUTOFF_SALTILLO_MIN  = 16 * 60 + 30
const CUTOFF_DOMICILIO_MIN = 16 * 60
const CUTOFF_OTHERS_MIN    = 15 * 60

function toDate(value) {
  if (!value) return null
  const d = new Date(value)
  return isNaN(+d) ? null : d
}

function getFacturadoAt(order) {
  const candidates = [
    order?.facturado_at,
    order?.invoiced_at,
    order?.invoice_at,
    order?.invoice_created_at,
    order?.invoice_date,
    order?.status_facturado_at,
    String(order?.status || '').toLowerCase() === 'facturado' ? order?.last_status_change_at : null,
  ]
  for (const c of candidates) {
    const d = toDate(c)
    if (d) return d
  }
  return null
}

function minutesInMexicoCity(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

export function getInvoiceScheduleInfo(order) {
  const facturadoAt = getFacturadoAt(order)
  if (!facturadoAt) return null

  const carrier = String(order?.carrier ?? '').trim().toLowerCase()
  let cutoffMin = CUTOFF_OTHERS_MIN, cutoffText = '15:00', scope = 'Otras paqueterías'
  if (carrier === 'saltillo') {
    cutoffMin = CUTOFF_SALTILLO_MIN; cutoffText = '16:30'; scope = 'Saltillo'
  } else if (carrier === 'domicilio') {
    cutoffMin = CUTOFF_DOMICILIO_MIN; cutoffText = '16:00'; scope = 'Domicilio'
  }

  const timeText = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(facturadoAt)

  return {
    outsideSchedule: minutesInMexicoCity(facturadoAt) > cutoffMin,
    timeText,
    cutoffText,
    scope,
  }
}
