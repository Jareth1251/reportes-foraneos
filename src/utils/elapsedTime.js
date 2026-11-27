import { businessMs } from './businessHours'

// Tiempo transcurrido desde `ts` para las tarjetas de Almacén, Cajas y Foráneos.
// Solo horario laboral (ver businessHours.js): fuera de horario, domingos,
// festivos y paros el reloj se detiene. Se muestra en horas, no en días, porque
// un día hábil no son 24 h.
export function timeSince(ts) {
  if (!ts) return '—'
  const ms = businessMs(ts, Date.now())
  if (Number.isNaN(ms)) return '—'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return '0 min'
  if (mins < 60) return `${mins} min`

  const hours = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${hours}h ${m}m` : `${hours}h`
}
