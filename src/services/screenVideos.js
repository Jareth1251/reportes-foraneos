import { api } from '@/config/axios'

// Gestor de videos de las pantallas de turnos (API-Base ScreenVideoController).
// La conversión a MP4 1080p la hace API-Base en cola: después de subir, el
// video queda en "processing" hasta que el usuario presiona Actualizar.
// API-Base usa JsonResource::withoutWrapping(): las respuestas vienen sin `data`.

// Las claves deben coincidir con ScreenVideo::SCREENS de API-Base.
export const SCREEN_GROUPS = [
  {
    city: 'CDMX',
    screens: [
      { key: 'cdmx-piso',    name: 'Piso' },
      { key: 'cdmx-cajas',   name: 'Cajas' },
      { key: 'cdmx-almacen', name: 'Almacén' },
    ],
  },
  {
    city: 'Monterrey',
    screens: [
      { key: 'monterrey-piso',            name: 'Piso' },
      { key: 'monterrey-cajas',           name: 'Cajas' },
      { key: 'monterrey-almacen-20',      name: 'Almacén ≤ 20' },
      { key: 'monterrey-almacen-volumen', name: 'Almacén Volumen' },
    ],
  },
]

export const SCREEN_OPTIONS = SCREEN_GROUPS.flatMap(group =>
  group.screens.map(screen => ({ ...screen, label: `${group.city} ${screen.name}` })),
)

export const MAX_UPLOAD_MB = 100
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
export const MAX_DURATION_SECONDS = 60

export async function listScreenVideos() {
  const { data } = await api.get('/screen-videos')
  return Array.isArray(data) ? data : []
}

export async function uploadScreenVideo({ file, title, screens }, onProgress) {
  const form = new FormData()
  form.append('file', file)
  form.append('title', title)
  screens.forEach(s => form.append('screens[]', s))
  const { data } = await api.post('/screen-videos', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
  })
  return data
}

export async function replaceScreenVideo(id, file, onProgress) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post(`/screen-videos/${id}/replace`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
  })
  return data
}

export async function updateScreenVideo(id, payload) {
  const { data } = await api.put(`/screen-videos/${id}`, payload)
  return data
}

export async function reorderScreenVideos(ids) {
  await api.post('/screen-videos/reorder', { ids })
}

export async function deleteScreenVideo(id) {
  await api.delete(`/screen-videos/${id}`)
}

/**
 * Lee duración y orientación en el navegador para avisar antes de subir.
 * Best-effort: Chrome en Linux no decodifica HEVC (MOV de iPhone), en ese caso
 * resuelve null y el servidor valida después de convertir.
 */
export function readVideoMetadata(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const done = result => { URL.revokeObjectURL(url); resolve(result) }
    const timer = setTimeout(() => done(null), 8000)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      clearTimeout(timer)
      done({ duration: video.duration, width: video.videoWidth, height: video.videoHeight })
    }
    video.onerror = () => { clearTimeout(timer); done(null) }
    video.src = url
  })
}

export function apiErrorMessage(e, fallback) {
  const errors = e?.response?.data?.errors
  if (errors) return Object.values(errors).flat()[0]
  if (e?.response?.status === 413) return 'El archivo es demasiado grande para el servidor.'
  return e?.response?.data?.message ?? fallback
}
