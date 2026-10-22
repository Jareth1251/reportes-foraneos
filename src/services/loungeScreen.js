import Ably from 'ably'
import { api } from '@/config/axios'

// Pantallas de los comedores: canciones de YouTube con un comunicado cada N
// canciones, como los turnos con los videos promocionales.
// Todo vive en API-Base (LoungeController): las canciones y la configuración
// de cada pantalla en lounge_songs / lounge_screens; los comunicados son
// ScreenVideo de esas pantallas (se suben, convierten y activan desde este
// módulo, y uno puede ir a los dos comedores).
// Cada TV (/tv/{pantalla}) pide su playlist al abrir y se entera de cambios por Ably.

// Las claves deben coincidir con ScreenVideo::LOUNGE_SCREENS de API-Base.
export const LOUNGE_SCREENS = [
  { key: 'cdmx-comedor',      name: 'CDMX',      site: '3100' },
  { key: 'monterrey-comedor', name: 'Monterrey', site: '3000' },
]
export const LOUNGE_SCREEN_KEYS = LOUNGE_SCREENS.map(s => s.key)
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

// ── TV (pública) ───────────────────────────────────────────────────────────
/** Canciones, configuración y comunicados activos, listos para createRotation. */
export async function fetchPlaylist(screen) {
  const { data } = await api.get(`${base(screen)}/playlist`)
  return {
    songsPerBreak: clampSongsPerBreak(data?.songs_per_break),
    songs: (data?.songs ?? []).map(toSongItem),
    announcements: (data?.announcements ?? [])
      .filter(v => v.url)
      .map(v => ({ type: 'video', url: v.url, title: v.title })),
  }
}

export function toSongItem(song) {
  return { type: 'youtube', videoId: song.youtube_id, title: song.title }
}

/**
 * Avisa cuando cambian canciones/configuración (lounge-updates) o comunicados
 * (screen-videos-updates). Token público de solo-suscripción de API-Base.
 * Regresa una función para desconectarse.
 */
export function subscribeToLoungeUpdates(screen, onUpdate) {
  const ably = new Ably.Realtime({
    authCallback: async (tokenParams, callback) => {
      try {
        const { data } = await api.get('/lounge/ably-token')
        callback(null, data)
      } catch (error) {
        callback(error, null)
      }
    },
  })

  const loungeChannel = ably.channels.get('lounge-updates')
  const videosChannel = ably.channels.get('screen-videos-updates')
  loungeChannel.subscribe('update', message => {
    if (message.data?.screen === screen) onUpdate()
  })
  // Llega por cualquier video (también los de turnos): pedir de más no estorba.
  videosChannel.subscribe('update', () => onUpdate())

  return () => ably.close()
}

export function buildScreenLink(screen) {
  return `${window.location.origin}/tv/${screen}`
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
 *
 * update() cambia las listas sin reiniciar el recorrido (lo usa la TV cuando
 * llega un aviso de Ably): sigue más o menos donde iba.
 */
export function createRotation(playlist) {
  let songs = playlist.songs
  let announcements = playlist.announcements
  let songsPerBreak = clampSongsPerBreak(playlist.songsPerBreak)
  let songIndex = 0
  let announcementIndex = 0
  let songsSinceBreak = 0

  function next() {
    if (announcements.length && (songsSinceBreak >= songsPerBreak || !songs.length)) {
      const item = announcements[announcementIndex % announcements.length]
      announcementIndex = (announcementIndex + 1) % announcements.length
      songsSinceBreak = 0
      return item
    }
    if (!songs.length) return null
    const item = songs[songIndex % songs.length]
    songIndex = (songIndex + 1) % songs.length
    songsSinceBreak++
    return item
  }

  function update(newPlaylist) {
    songs = newPlaylist.songs
    announcements = newPlaylist.announcements
    songsPerBreak = clampSongsPerBreak(newPlaylist.songsPerBreak)
    songIndex = songs.length ? songIndex % songs.length : 0
    announcementIndex = announcements.length ? announcementIndex % announcements.length : 0
  }

  return { next, update, isEmpty: () => !songs.length && !announcements.length }
}
