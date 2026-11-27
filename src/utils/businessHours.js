// Tiempo transcurrido contando solo horario laboral de tienda/almacén.
// Fuera de horario, domingos, días festivos y paros programados el reloj se
// detiene, y se reanuda a la hora de apertura del siguiente día hábil. Así una
// ficha que se sube a cajas en la noche o antes de un puente no infla los
// promedios.
//
//   Lunes a viernes: 08:30 – 18:00
//   Sábado:          09:00 – 13:00
//   Domingo:         cerrado
//
// Excepciones (API-Base /business-hours-exceptions, las captura cajas 002):
//   closure → no cuenta; sin horas = día completo, con horas = solo ese tramo.
//   working → la empresa sí trabaja ese día aunque sea festivo oficial.
//
// México no tiene horario de verano desde 2022, así que la hora local de
// CDMX y Monterrey es siempre UTC-6 sin importar la zona del navegador.
//
// Hay una copia idéntica en point-of-sale (src/components/views/modals/businessHours.js).

const MX_OFFSET_MS = 6 * 3600000
const DAY_MS = 86400000

// [apertura, cierre] en minutos desde medianoche; índice = getUTCDay() (0 = domingo)
const SCHEDULE = [
  null,
  [8 * 60 + 30, 18 * 60],
  [8 * 60 + 30, 18 * 60],
  [8 * 60 + 30, 18 * 60],
  [8 * 60 + 30, 18 * 60],
  [8 * 60 + 30, 18 * 60],
  [9 * 60, 13 * 60],
]

// Descanso obligatorio (LFT art. 74), incluidos los lunes de puente.
function nthMonday(year, month, n) {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return 1 + ((8 - firstDow) % 7) + (n - 1) * 7
}

const pad = (n) => String(n).padStart(2, '0')

const holidayCache = new Map()

// [{ date: 'YYYY-MM-DD', name }] del año.
export function officialHolidays(year) {
  if (!holidayCache.has(year)) {
    holidayCache.set(year, [
      [0, 1, 'Año Nuevo'],
      [1, nthMonday(year, 1, 1), 'Día de la Constitución'],
      [2, nthMonday(year, 2, 3), 'Natalicio de Benito Juárez'],
      [4, 1, 'Día del Trabajo'],
      [8, 16, 'Día de la Independencia'],
      [10, nthMonday(year, 10, 3), 'Día de la Revolución'],
      [11, 25, 'Navidad'],
    ].map(([m, d, name]) => ({ date: `${year}-${pad(m + 1)}-${pad(d)}`, name })))
  }
  return holidayCache.get(year)
}

const holidaySetCache = new Map()
function isOfficialHoliday(ymd) {
  const year = Number(ymd.slice(0, 4))
  if (!holidaySetCache.has(year)) {
    holidaySetCache.set(year, new Set(officialHolidays(year).map((h) => h.date)))
  }
  return holidaySetCache.get(year).has(ymd)
}

// 'YYYY-MM-DD' -> { working: bool, closures: [[iniMin, finMin], ...] }
let exceptionsByDate = new Map()

const timeToMin = (t) => {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + (m || 0)
}

export function setBusinessHoursExceptions(rows) {
  const map = new Map()
  for (const r of Array.isArray(rows) ? rows : []) {
    const date = String(r?.date || '').slice(0, 10)
    if (!date) continue
    if (!map.has(date)) map.set(date, { working: false, closures: [] })
    const entry = map.get(date)
    if (r.kind === 'working') entry.working = true
    else if (r.kind === 'closure') {
      entry.closures.push(r.start_time && r.end_time
        ? [timeToMin(r.start_time), timeToMin(r.end_time)]
        : [0, 24 * 60])
    }
  }
  exceptionsByDate = map
}

function toMs(v) {
  if (v === null || v === undefined || v === '') return NaN
  return v instanceof Date ? v.getTime() : typeof v === 'number' ? v : new Date(v).getTime()
}

// Tramos [ini, fin) en ms absolutos de "hora México" que sí cuentan ese día.
function workingSlices(dayStart) {
  const d = new Date(dayStart)
  const hours = SCHEDULE[d.getUTCDay()]
  if (!hours) return []
  const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const ex = exceptionsByDate.get(ymd)
  if (isOfficialHoliday(ymd) && !ex?.working) return []

  let slices = [[hours[0], hours[1]]]
  for (const [cs, ce] of ex?.closures || []) {
    slices = slices.flatMap(([s, e]) => {
      if (ce <= s || cs >= e) return [[s, e]]
      const out = []
      if (cs > s) out.push([s, cs])
      if (ce < e) out.push([ce, e])
      return out
    })
  }
  return slices.map(([s, e]) => [dayStart + s * 60000, dayStart + e * 60000])
}

// Milisegundos hábiles entre a y b. Negativo si b < a; NaN si alguna fecha es inválida.
export function businessMs(a, b) {
  const start = toMs(a)
  const end = toMs(b)
  if (Number.isNaN(start) || Number.isNaN(end)) return NaN
  if (end < start) return -businessMs(end, start)

  // Trabajamos en "hora de México" representada como UTC.
  const s = start - MX_OFFSET_MS
  const e = end - MX_OFFSET_MS
  let total = 0
  for (let dayStart = Math.floor(s / DAY_MS) * DAY_MS; dayStart < e; dayStart += DAY_MS) {
    for (const [open, close] of workingSlices(dayStart)) {
      const from = Math.max(s, open)
      const to = Math.min(e, close)
      if (to > from) total += to - from
    }
  }
  return total
}
