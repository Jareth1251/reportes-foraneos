export function toInt(v) {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export function siteLabel(site) {
  return String(site) === '3100' ? 'CDMX' : 'MTY'
}

export function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString('es-MX', {
        timeZone: 'America/Monterrey',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true,
      })
}

export function shortName(fullName) {
  if (!fullName) return ''
  const parts = String(fullName).trim().split(/\s+/)
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0] || ''
}

export function pillClass(n) {
  if (n > 0) return 'MIL-pillPos'
  if (n < 0) return 'MIL-pillNeg'
  return 'MIL-pillZero'
}

export function rowKey(r, idx) {
  return `${r.product_id || ''}__${r.color_label || ''}__${r.size_label || ''}__${idx}`
}
