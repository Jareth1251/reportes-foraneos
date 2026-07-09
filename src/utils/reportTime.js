export function normalize(str) {
  return str?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() || ''
}

export function timeDiff(a, b) {
  if (!a || !b) return null
  const da = new Date(a)
  const db = new Date(b)
  if (isNaN(da) || isNaN(db)) return null
  let ms = db - da
  const h = Math.floor(ms / 3600000).toString().padStart(2, '0')
  ms %= 3600000
  const m = Math.floor(ms / 60000).toString().padStart(2, '0')
  ms %= 60000
  const s = Math.floor(ms / 1000).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function fmtTime(dt) {
  if (!dt) return null
  const d = new Date(dt)
  if (isNaN(d)) return null
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => v.toString().padStart(2, '0')).join(':')
}

export function toSeconds(t) {
  if (!t) return null
  const parts = t.split(':').map(Number)
  if (parts.some((p) => isNaN(p))) return null
  const [h, m, s] = parts
  return h * 3600 + m * 60 + s
}

export function toTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':')
}

export function getAverageTime(rows, field) {
  const valid = rows.map((r) => toSeconds(r[field])).filter((v) => v !== null)
  if (!valid.length) return '00:00:00'
  return toTime(valid.reduce((a, b) => a + b, 0) / valid.length)
}
