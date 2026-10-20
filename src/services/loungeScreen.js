import { api } from '@/config/axios'

// Pantalla del comedor: canciones de YouTube con un comunicado cada N
// canciones, como los turnos con los videos promocionales.
// Los comunicados viven en API-Base (ScreenVideo, pantalla 'comedor'): se
// suben, convierten y activan desde el módulo "Pantalla Comedor".
// Las canciones todavía no: el gestor las guarda en este navegador y la TV
// las recibe dentro del link (?p=).

const STORAGE_KEY = 'lounge_screen_playlist'

export const LOUNGE_SCREEN = 'comedor'
// Deben coincidir con ScreenVideo::MAX_UPLOAD_KB / MAX_DURATION_SECONDS (grupo lounge).
export const LOUNGE_MAX_UPLOAD_MB = 250
export const LOUNGE_MAX_UPLOAD_BYTES = LOUNGE_MAX_UPLOAD_MB * 1024 * 1024
export const LOUNGE_MAX_DURATION_SECONDS = 300

/** Comunicados activos y convertidos del comedor, en orden de rotación (público). */
export async function fetchAnnouncements() {
  const { data } = await api.get('/screen-videos/playlist', { params: { screen: LOUNGE_SCREEN } })
  return (Array.isArray(data?.data) ? data.data : [])
    .filter(v => v.url)
    .map(v => ({ type: 'video', url: v.url, title: v.title }))
}

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

export const DEFAULT_SONGS_PER_BREAK = 4

function emptyPlaylist() {
  return { songs: [], songsPerBreak: DEFAULT_SONGS_PER_BREAK }
}

export function loadPlaylist() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    // Formato de la primera prueba: una sola lista mezclada.
    if (Array.isArray(saved)) return { ...emptyPlaylist(), songs: saved.filter(i => i.type === 'youtube') }
    return {
      songs: Array.isArray(saved?.songs) ? saved.songs : [],
      songsPerBreak: clampSongsPerBreak(saved?.songsPerBreak),
    }
  } catch {
    return emptyPlaylist()
  }
}

export function savePlaylist(playlist) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(playlist)) } catch { /* modo privado */ }
}

export function clampSongsPerBreak(value) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : DEFAULT_SONGS_PER_BREAK
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
}

// Solo viaja lo que la TV necesita para reproducir.
export function encodePlaylist(playlist) {
  return toBase64Url(JSON.stringify({
    n: clampSongsPerBreak(playlist.songsPerBreak),
    s: playlist.songs.map(i => i.videoId),
  }))
}

export function decodePlaylist(param) {
  const playlist = emptyPlaylist()
  if (!param) return playlist
  try {
    const wire = JSON.parse(fromBase64Url(param))
    playlist.songsPerBreak = clampSongsPerBreak(wire?.n)
    playlist.songs = (Array.isArray(wire?.s) ? wire.s : [])
      .filter(id => /^[\w-]{11}$/.test(id))
      .map(videoId => ({ type: 'youtube', videoId }))
  } catch { /* link roto: lista vacía */ }
  return playlist
}

export function buildScreenLink(playlist) {
  return `${window.location.origin}/tv/comedor?p=${encodePlaylist(playlist)}`
}

/**
 * Orden de la TV, igual que los turnos con los promocionales: N canciones,
 * un comunicado, las N siguientes canciones, el siguiente comunicado… Cada
 * lista sigue donde se quedó y vuelve a empezar al terminarse.
 * Sin canciones, solo rota comunicados; sin comunicados, solo canciones.
 */
export function createRotation({ songs, songsPerBreak: perBreak }, announcements) {
  const songsPerBreak = clampSongsPerBreak(perBreak)
  let songIndex = 0
  let announcementIndex = 0
  let songsSinceBreak = 0

  return function next() {
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
}
