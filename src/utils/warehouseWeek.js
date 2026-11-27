// Semana del Tablero de Almacén: de lunes a domingo, con el número de semana
// que usa almacén en su Excel (la semana 1 empieza el primer lunes del año y
// el año lo decide el jueves). No es la semana ISO: el 23/11/2026 es la SEM 47
// para ellos y la 48 en ISO.

const DAY_MS = 24 * 60 * 60 * 1000

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(ymd, days) {
  const date = parseYmd(ymd)
  date.setDate(date.getDate() + days)
  return toYmd(date)
}

export function mondayOf(ymd) {
  const date = parseYmd(ymd)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return toYmd(date)
}

export function weekNumber(mondayYmd) {
  const monday = parseYmd(mondayYmd)
  const thursday = new Date(monday.getTime() + 3 * DAY_MS)
  const firstMonday = new Date(thursday.getFullYear(), 0, 1)
  while (firstMonday.getDay() !== 1) firstMonday.setDate(firstMonday.getDate() + 1)
  if (monday < firstMonday) return 1
  return Math.floor(Math.round((monday - firstMonday) / DAY_MS) / 7) + 1
}

export function weekInfo(anyYmd) {
  const start = mondayOf(anyYmd)
  const end = addDays(start, 6)
  return { start, end, number: weekNumber(start) }
}

export function weekDays(mondayYmd) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayYmd, i))
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function dayLabel(ymd) {
  const date = parseYmd(ymd)
  const name = DAY_NAMES[(date.getDay() + 6) % 7]
  return `${name} ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function fmtDmy(ymd) {
  const [y, m, d] = String(ymd).split('-')
  return `${d}/${m}/${y}`
}
