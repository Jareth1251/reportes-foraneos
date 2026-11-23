import { api } from '@/config/axios'

// Pantallas de los comedores: canciones de YouTube con un comunicado cada N
// canciones, como los turnos con los videos promocionales.
// Todo vive en API-Base (LoungeController): las canciones y la configuración
// de cada pantalla en lounge_songs / lounge_screens; los comunicados son
// ScreenVideo de esas pantallas (se suben, convierten y activan desde este
// módulo, y uno puede ir a los dos comedores).
// Las TVs no viven aquí: son pantallas de point-of-sale-back, como las de
// turnos (views/pantallas/comedor.pug + public/javascripts/lounge-screen.js),
// que piden su lista a API-Base y se enteran de cambios por Ably.

// Las claves deben coincidir con ScreenVideo::LOUNGE_SCREENS de API-Base; path,
// con las rutas de app.js de point-of-sale-back.
export const LOUNGE_SCREENS = [
  { key: 'cdmx-comedor',      name: 'CDMX',      site: '3100', path: '/pantallas/cdmx/comedor' },
  { key: 'monterrey-comedor', name: 'Monterrey', site: '3000', path: '/pantallas/monterrey/comedor' },
]
// Deben coincidir con ScreenVideo::MAX_UPLOAD_KB / MAX_DURATION_SECONDS (grupo lounge).
export const LOUNGE_MAX_UPLOAD_MB = 250
export const LOUNGE_MAX_UPLOAD_BYTES = LOUNGE_MAX_UPLOAD_MB * 1024 * 1024
export const LOUNGE_MAX_DURATION_SECONDS = 300

// Deben coincidir con LoungeScreen::MIN/MAX_SONGS_PER_BREAK.
export const MIN_SONGS_PER_BREAK = 1
export const MAX_SONGS_PER_BREAK = 20
export const DEFAULT_SONGS_PER_BREAK = 4

const base = screen => `/lounge/${screen}`

// ── Gestor (requiere login) ────────────────────────────────────────────────
export async function getLoungeConfig(screen) {
  const { data } = await api.get(base(screen))
  return data
}

export async function updateSongsPerBreak(screen, songsPerBreak) {
  const { data } = await api.put(base(screen), { songs_per_break: songsPerBreak })
  return data
}

export async function addSong(screen, { youtubeId, title }) {
  const { data } = await api.post(`${base(screen)}/songs`, { youtube_id: youtubeId, title })
  return data
}

export async function updateSongTitle(screen, id, title) {
  const { data } = await api.put(`${base(screen)}/songs/${id}`, { title })
  return data
}

export async function reorderSongs(screen, ids) {
  await api.post(`${base(screen)}/songs/reorder`, { ids })
}

export async function deleteSong(screen, id) {
  await api.delete(`${base(screen)}/songs/${id}`)
}

export function toSongItem(song) {
  return { type: 'youtube', videoId: song.youtube_id, title: song.title }
}

// Donde se sirven las pantallas de turnos (point-of-sale-back).
const SCREENS_BASE_URL = (import.meta.env.VITE_SCREENS_URL || 'http://pos.miplayera.com.mx:3001').replace(/\/$/, '')

export function buildScreenLink(screen) {
  const path = LOUNGE_SCREENS.find(s => s.key === screen)?.path ?? ''
  return `${SCREENS_BASE_URL}${path}`
}

// ── Utilidades ─────────────────────────────────────────────────────────────
// youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID
export function parseYoutubeId(input) {
  const text = String(input || '').trim()
  if (/^[\w-]{11}$/.test(text)) return text
  let url
  try { url = new URL(text) } catch { return null }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
  if (host === 'youtu.be') return matchId(url.pathname.slice(1))
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
  if (url.searchParams.get('v')) return matchId(url.searchParams.get('v'))
  const path = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)
  return path ? path[1] : null
}

function matchId(value) {
  const id = String(value || '').slice(0, 11)
  return /^[\w-]{11}$/.test(id) ? id : null
}

export function clampSongsPerBreak(value) {
  const n = Math.round(Number(value))
  return Number.isFinite(n)
    ? Math.min(MAX_SONGS_PER_BREAK, Math.max(MIN_SONGS_PER_BREAK, n))
    : DEFAULT_SONGS_PER_BREAK
}

/**
 * Orden de la TV, igual que los turnos con los promocionales: N canciones,
 * un comunicado, las N siguientes canciones, el siguiente comunicado… Cada
 * lista sigue donde se quedó y vuelve a empezar al terminarse.
 * Sin canciones, solo rota comunicados; sin comunicados, solo canciones.
 * La TV usa una copia de esta lógica en lounge-screen.js de point-of-sale-back:
 * si cambia aquí, cambia allá (la vista previa del gestor debe coincidir).
 */
export function createRotation({ songs, announcements, songsPerBreak: perBreak }) {
  const songsPerBreak = clampSongsPerBreak(perBreak)
  let songIndex = 0
  let announcementIndex = 0
  let songsSinceBreak = 0

  function next() {
    if (announcements.length && (songsSinceBreak >= songsPerBreak || !songs.length)) {
      const item = announcements[announcementIndex]
      announcementIndex = (announcementIndex + 1) % announcements.length
      songsSinceBreak = 0
      return item
    }
    if (!songs.length) return null
    const item = songs[songIndex]
    songIndex = (songIndex + 1) % songs.length
    songsSinceBreak++
    return item
  }

  return { next }
}
