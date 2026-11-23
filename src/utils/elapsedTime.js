// Tiempo transcurrido desde `ts` para las tarjetas de Almacén, Cajas y Foráneos.
// Desde 24 h se muestra en días + horas (ej. "61d 17h") en lugar de "1481h 53m".
export function timeSince(ts) {
  if (!ts) return '—'
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000)
  if (mins < 1) return '0 min'
  if (mins < 60) return `${mins} min`

  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    const m = mins % 60
    return m ? `${hours}h ${m}m` : `${hours}h`
  }

  const days = Math.floor(hours / 24), h = hours % 24
  return h ? `${days}d ${h}h` : `${days}d`
}
