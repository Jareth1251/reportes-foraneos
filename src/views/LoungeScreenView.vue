<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  listScreenVideos,
  uploadScreenVideo,
  updateScreenVideo,
  reorderScreenVideos,
  deleteScreenVideo,
  readVideoMetadata,
  apiErrorMessage,
} from '@/services/screenVideos'
import {
  LOUNGE_SCREEN,
  LOUNGE_MAX_UPLOAD_BYTES,
  LOUNGE_MAX_UPLOAD_MB,
  LOUNGE_MAX_DURATION_SECONDS,
  parseYoutubeId,
  loadPlaylist,
  savePlaylist,
  clampSongsPerBreak,
  createRotation,
  buildScreenLink,
} from '@/services/loungeScreen'

const router = useRouter()
if (!sessionStorage.getItem('foraneos_module_chosen')) {
  router.replace({ name: 'selector' })
}

const auth = useAuthStore()

// Canciones: en este navegador. Comunicados: en API-Base.
const playlist = ref(loadPlaylist())
watch(playlist, savePlaylist, { deep: true })

const announcements = ref([])
const loading       = ref(false)
const error         = ref(null)
const notice        = ref(null)
const copied        = ref(false)

const youtubeForm = reactive({ link: '', title: '', error: null })

const upload = reactive({ file: null, title: '', metadata: null, progress: null, error: null })
const fileInput = ref(null)

const screenLink = computed(() => buildScreenLink(playlist.value))

// Mismo criterio que la playlist de API-Base: activo y con MP4 convertido.
const playingAnnouncements = computed(() =>
  announcements.value
    .filter(v => v.is_active && v.public_url)
    .map(v => ({ type: 'video', url: v.public_url, title: v.title })),
)
const hasProcessing = computed(() => announcements.value.some(v => v.status === 'processing'))

// Lo que la TV va a reproducir, con la misma lógica que usa ella.
const PREVIEW_LENGTH = 14
const sequencePreview = computed(() => {
  const next = createRotation(playlist.value, playingAnnouncements.value)
  const sequence = []
  for (let i = 0; i < PREVIEW_LENGTH; i++) {
    const item = next()
    if (!item) break
    sequence.push(item)
  }
  return sequence
})

async function fetchAnnouncements() {
  loading.value = true
  error.value = null
  try {
    announcements.value = await listScreenVideos('lounge')
  } catch (e) {
    error.value = apiErrorMessage(e, 'No se pudieron cargar los comunicados')
  } finally {
    loading.value = false
  }
}

onMounted(fetchAnnouncements)

// ── Canciones ──────────────────────────────────────────────────────────────
function addYoutube() {
  const videoId = parseYoutubeId(youtubeForm.link)
  if (!videoId) { youtubeForm.error = 'No reconozco ese link. Pega el link de un video de YouTube (no de una lista).'; return }
  playlist.value.songs.push({
    key: `${Date.now()}-${videoId}`,
    type: 'youtube',
    videoId,
    title: youtubeForm.title.trim() || `YouTube ${videoId}`,
  })
  Object.assign(youtubeForm, { link: '', title: '', error: null })
}

function moveSong(index, delta) {
  const songs = playlist.value.songs
  const target = index + delta
  if (target < 0 || target >= songs.length) return
  ;[songs[index], songs[target]] = [songs[target], songs[index]]
}

function removeSong(index) {
  playlist.value.songs.splice(index, 1)
}

function setSongsPerBreak(value) {
  playlist.value.songsPerBreak = clampSongsPerBreak(value)
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(screenLink.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    error.value = 'No se pudo copiar; selecciona el link y cópialo a mano.'
  }
}

// ── Comunicados: subida ────────────────────────────────────────────────────
const uploadWarnings = computed(() => {
  const m = upload.metadata
  if (!upload.file || !m) return []
  const warnings = []
  if (m.height > m.width) warnings.push('Tu video es vertical: se verá al centro con un fondo difuminado a los lados.')
  if (m.width && m.width < 1280 && m.height < 1280) warnings.push(`La resolución es baja (${m.width}×${m.height}); podría verse borroso en la TV.`)
  return warnings
})

const uploadBlocker = computed(() => {
  if (!upload.file) return 'Selecciona un video'
  if (upload.file.size > LOUNGE_MAX_UPLOAD_BYTES) return `El video pesa más de ${LOUNGE_MAX_UPLOAD_MB} MB`
  if (upload.metadata && upload.metadata.duration > LOUNGE_MAX_DURATION_SECONDS) return `El video dura más de ${LOUNGE_MAX_DURATION_SECONDS / 60} minutos`
  if (!upload.title.trim()) return 'Escribe un título'
  return null
})

async function onFileSelected(event) {
  const file = event.target.files?.[0] ?? null
  Object.assign(upload, { file, error: null, metadata: null })
  if (!file) return
  if (!upload.title.trim()) upload.title = file.name.replace(/\.[^.]+$/, '').slice(0, 120)
  upload.metadata = await readVideoMetadata(file)
}

function resetUpload() {
  Object.assign(upload, { file: null, title: '', metadata: null, progress: null, error: null })
  if (fileInput.value) fileInput.value.value = ''
}

async function submitUpload() {
  if (uploadBlocker.value) { upload.error = uploadBlocker.value; return }
  upload.error = null
  notice.value = null
  upload.progress = 0
  try {
    await uploadScreenVideo(
      { file: upload.file, title: upload.title.trim(), screens: [LOUNGE_SCREEN] },
      p => { upload.progress = p },
    )
    resetUpload()
    notice.value = 'Comunicado subido. Se está convirtiendo; cuando esté listo, revísalo en la vista previa y presiona Activar.'
    await fetchAnnouncements()
  } catch (e) {
    upload.error = apiErrorMessage(e, 'No se pudo subir el comunicado')
    upload.progress = null
  }
}

// ── Comunicados: acciones ──────────────────────────────────────────────────
async function patchAnnouncement(video, payload) {
  error.value = null
  try {
    Object.assign(video, await updateScreenVideo(video.id, payload))
  } catch (e) {
    error.value = apiErrorMessage(e, 'No se pudo guardar el cambio')
    await fetchAnnouncements()
  }
}

function saveTitle(video, value) {
  const title = String(value || '').trim()
  if (!title || title === video.title) return
  patchAnnouncement(video, { title })
}

async function moveAnnouncement(index, delta) {
  const target = index + delta
  if (target < 0 || target >= announcements.value.length) return
  const reordered = [...announcements.value]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  announcements.value = reordered
  error.value = null
  try {
    await reorderScreenVideos(reordered.map(v => v.id))
  } catch (e) {
    error.value = apiErrorMessage(e, 'No se pudo guardar el orden')
    await fetchAnnouncements()
  }
}

async function removeAnnouncement(video) {
  if (!confirm(`Esto elimina "${video.title}" de forma definitiva y deja de mostrarse en el comedor. ¿Seguro?`)) return
  error.value = null
  try {
    await deleteScreenVideo(video.id)
    await fetchAnnouncements()
  } catch (e) {
    error.value = apiErrorMessage(e, 'No se pudo eliminar el comunicado')
  }
}

function announcementStatus(video) {
  if (video.status === 'processing') return { color: '#B45309', text: '⏳ Convirtiendo… presiona Actualizar en un momento' }
  if (video.status === 'failed') return { color: '#B91C1C', text: `❌ ${video.error_message || 'Falló la conversión'}` }
  if (!video.is_active) return { color: '#1D4ED8', text: '👀 Listo para revisar: míralo en la vista previa y presiona Activar' }
  return { color: '#15803D', text: '🟢 En rotación en el comedor' }
}

function formatDuration(seconds) {
  if (seconds == null) return '—'
  const s = Math.round(seconds)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`
}
function formatSize(bytes) {
  if (!bytes) return '—'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div class="min-h-screen bg-gray-100" style="font-family: sans-serif;">

    <!-- Navbar -->
    <div class="navbar bg-white shadow-sm px-4 sticky top-0 z-30">
      <div class="navbar-start gap-2 flex items-center">
        <button @click="router.push({ name: 'selector' })"
                style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:6px;border:none;cursor:pointer;font-size:0.95rem;font-weight:700;background-color:#1565C0;color:#fff;">
          ← Módulos
        </button>
        <span style="font-weight:700;padding:4px 12px;border-radius:8px;color:#0E7490;background:#CFFAFE;font-size:1.2rem;line-height:1.2;">
          📺 Pantalla Comedor
        </span>
        <span class="badge badge-warning badge-sm">Prueba</span>
      </div>
      <div class="navbar-end">
        <div class="dropdown dropdown-end">
          <div tabindex="0" role="button" class="avatar placeholder cursor-pointer">
            <div class="bg-primary text-primary-content rounded-full w-9">
              <span class="text-xs font-bold">{{ (auth.user?.name ?? '?')[0]?.toUpperCase() }}</span>
            </div>
          </div>
          <ul tabindex="0" class="menu menu-sm dropdown-content bg-base-100 rounded-box z-50 mt-3 w-44 p-2 shadow border border-base-300">
            <li class="menu-title text-xs px-2">{{ auth.user?.name }}</li>
            <li><a @click="auth.logout()" class="text-error">Cerrar sesión</a></li>
          </ul>
        </div>
      </div>
    </div>

    <div class="p-4" style="max-width:1100px;margin:0 auto;">

      <div class="alert alert-info text-sm mb-4">
        <span>
          Versión de prueba: los <b>comunicados</b> se guardan en el sistema; las <b>canciones</b> se guardan solo en
          este navegador y viajan dentro del link de la TV. Si cambias algo, recarga la TV (o abre el link nuevo si
          cambiaste canciones).
        </span>
      </div>

      <div v-if="error" role="alert" class="alert alert-error mb-3 text-sm">
        <span>{{ error }}</span>
        <button class="btn btn-ghost btn-xs ml-auto" @click="error = null">✕</button>
      </div>

      <!-- Agregar -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:16px;">
        <div class="bg-white" style="padding:14px 16px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h4 style="font-weight:800;margin:0 0 10px;">🎵 Agregar canción (YouTube)</h4>
          <label style="display:block;margin-bottom:8px;">
            <span style="font-size:0.78rem;color:#666;display:block;margin-bottom:2px;">Link del video</span>
            <input v-model="youtubeForm.link" type="text" placeholder="https://www.youtube.com/watch?v=…"
                   class="input input-bordered input-sm w-full" @keyup.enter="addYoutube" />
          </label>
          <label style="display:block;margin-bottom:8px;">
            <span style="font-size:0.78rem;color:#666;display:block;margin-bottom:2px;">Título (solo para identificarlo)</span>
            <input v-model="youtubeForm.title" type="text" maxlength="120" class="input input-bordered input-sm w-full"
                   @keyup.enter="addYoutube" />
          </label>
          <button class="btn btn-sm btn-success text-white" :disabled="!youtubeForm.link.trim()" @click="addYoutube">＋ Agregar</button>
          <div v-if="youtubeForm.error" style="margin-top:8px;font-size:0.8rem;color:#B91C1C;">{{ youtubeForm.error }}</div>
          <p style="margin:8px 0 0;font-size:0.78rem;color:#888;">
            Algunos videos musicales no permiten reproducirse fuera de YouTube; revisa la vista previa. Si dice
            "Video no disponible", la TV lo va a saltar.
          </p>
        </div>

        <div class="bg-white" style="padding:14px 16px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h4 style="font-weight:800;margin:0 0 10px;">📢 Subir comunicado</h4>
          <label style="display:block;margin-bottom:8px;">
            <span style="font-size:0.78rem;color:#666;display:block;margin-bottom:2px;">Archivo de video</span>
            <input ref="fileInput" type="file" accept="video/*" class="file-input file-input-bordered file-input-sm w-full"
                   :disabled="upload.progress !== null" @change="onFileSelected" />
          </label>
          <label style="display:block;margin-bottom:8px;">
            <span style="font-size:0.78rem;color:#666;display:block;margin-bottom:2px;">Título (solo para identificarlo)</span>
            <input v-model="upload.title" type="text" maxlength="120" class="input input-bordered input-sm w-full"
                   :disabled="upload.progress !== null" />
          </label>
          <button class="btn btn-sm btn-success text-white" :disabled="!!uploadBlocker || upload.progress !== null" @click="submitUpload">
            <span v-if="upload.progress !== null" class="loading loading-spinner loading-xs"></span>
            ⬆ Subir
          </button>

          <div v-if="upload.file" style="margin-top:8px;font-size:0.8rem;color:#666;">
            {{ upload.file.name }} · {{ formatSize(upload.file.size) }}
            <template v-if="upload.metadata"> · {{ formatDuration(upload.metadata.duration) }}</template>
          </div>
          <div v-for="w in uploadWarnings" :key="w" class="alert alert-warning text-sm" style="margin-top:8px;padding:6px 12px;">
            <span>{{ w }}</span>
          </div>
          <div v-if="upload.progress !== null" style="margin-top:8px;">
            <progress class="progress progress-success w-full" :value="upload.progress" max="100"></progress>
            <div style="font-size:0.78rem;color:#666;">{{ upload.progress < 100 ? `Subiendo… ${upload.progress}%` : 'Guardando…' }}</div>
          </div>
          <div v-if="upload.error" style="margin-top:8px;font-size:0.8rem;color:#B91C1C;">{{ upload.error }}</div>
          <p style="margin:8px 0 0;font-size:0.78rem;color:#888;">
            Hasta {{ LOUNGE_MAX_DURATION_SECONDS / 60 }} minutos y {{ LOUNGE_MAX_UPLOAD_MB }} MB. Sube el video tal cual;
            el sistema lo convierte para la TV.
          </p>
        </div>
      </div>

      <div v-if="notice" class="alert alert-info text-sm mb-4">
        <span>{{ notice }}</span>
        <button class="btn btn-ghost btn-xs ml-auto" @click="notice = null">✕</button>
      </div>

      <!-- Link para la TV -->
      <div class="bg-white" style="padding:14px 16px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:16px;">
        <h4 style="font-weight:800;margin:0 0 8px;">📺 Link para abrir en la TV</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input :value="screenLink" readonly class="input input-bordered input-sm" style="flex:1;min-width:260px;font-family:monospace;font-size:0.78rem;"
                 @focus="$event.target.select()" />
          <button class="btn btn-sm" @click="copyLink">{{ copied ? '✅ Copiado' : '📋 Copiar' }}</button>
          <a class="btn btn-sm btn-primary" :href="screenLink" target="_blank" rel="noopener">↗ Abrir</a>
        </div>
      </div>

      <!-- Cómo se reproduce -->
      <div class="bg-white" style="padding:14px 16px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:16px;">
        <h4 style="font-weight:800;margin:0 0 8px;">🔁 Cómo se reproduce</h4>
        <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:0.9rem;">
          Poner un comunicado cada
          <input :value="playlist.songsPerBreak" type="number" min="1" max="20" class="input input-bordered input-sm" style="width:70px;"
                 @change="setSongsPerBreak($event.target.value); $event.target.value = playlist.songsPerBreak" />
          canciones.
        </label>
        <p style="margin:6px 0 10px;font-size:0.78rem;color:#888;">
          Cada lista sigue donde se quedó: después del comunicado vienen las siguientes canciones, y el siguiente
          descanso pone el siguiente comunicado activo. Al terminar una lista vuelve a empezar.
        </p>
        <div v-if="sequencePreview.length" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:0.8rem;">
          <span v-for="(item, i) in sequencePreview" :key="i"
                :style="`padding:2px 8px;border-radius:999px;${item.type === 'youtube' ? 'background:#FEE2E2;color:#991B1B;' : 'background:#DBEAFE;color:#1E40AF;font-weight:700;'}`">
            {{ item.type === 'youtube' ? '🎵' : '📢' }} {{ item.title }}
          </span>
          <span style="color:#888;">…</span>
        </div>
        <div v-else style="font-size:0.85rem;color:#999;">Agrega canciones o activa comunicados para ver el orden.</div>
      </div>

      <!-- Canciones -->
      <h3 style="font-weight:900;margin:0 0 10px;font-size:1.15rem;">🎵 Canciones ({{ playlist.songs.length }})</h3>

      <div v-if="!playlist.songs.length" class="bg-white" style="padding:18px;border-radius:10px;text-align:center;color:#999;margin-bottom:18px;">
        Sin canciones: la TV solo rotará los comunicados.
      </div>

      <div v-for="(song, index) in playlist.songs" :key="song.key" class="bg-white"
           style="display:flex;gap:14px;flex-wrap:wrap;padding:12px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:10px;">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:34px;">
          <button class="btn btn-xs" :disabled="index === 0" title="Subir en el orden" @click="moveSong(index, -1)">▲</button>
          <span style="font-weight:800;">{{ index + 1 }}</span>
          <button class="btn btn-xs" :disabled="index === playlist.songs.length - 1" title="Bajar en el orden" @click="moveSong(index, 1)">▼</button>
        </div>
        <div style="width:240px;aspect-ratio:16/9;background:#111;border-radius:6px;overflow:hidden;">
          <iframe :src="`https://www.youtube.com/embed/${song.videoId}`"
                  title="Vista previa" allow="encrypted-media; picture-in-picture" allowfullscreen
                  referrerpolicy="strict-origin-when-cross-origin"
                  style="width:100%;height:100%;border:0;"></iframe>
        </div>
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px;justify-content:center;">
          <input v-model="song.title" type="text" maxlength="120" class="input input-bordered input-sm w-full" style="font-weight:700;" />
          <div><span class="badge badge-error badge-sm text-white">YouTube</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;justify-content:center;min-width:110px;">
          <button class="btn btn-xs btn-error text-white" @click="removeSong(index)">🗑 Quitar</button>
        </div>
      </div>

      <!-- Comunicados -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:18px 0 10px;">
        <h3 style="font-weight:900;margin:0;font-size:1.15rem;">📢 Comunicados ({{ announcements.length }})</h3>
        <button class="btn btn-sm" :disabled="loading" @click="fetchAnnouncements">
          <span v-if="loading" class="loading loading-spinner loading-xs"></span>
          <span v-else>🔄</span> Actualizar
        </button>
        <span v-if="hasProcessing" style="font-size:0.8rem;color:#B45309;">
          Hay comunicados convirtiéndose. Presiona <b>Actualizar</b> en un momento para ver si ya están listos.
        </span>
      </div>

      <div v-if="!announcements.length" class="bg-white" style="padding:18px;border-radius:10px;text-align:center;color:#999;">
        {{ loading ? 'Cargando…' : 'Sin comunicados: la TV solo pondrá canciones.' }}
      </div>

      <div v-for="(video, index) in announcements" :key="video.id" class="bg-white"
           :style="`display:flex;gap:14px;flex-wrap:wrap;padding:12px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:10px;${video.is_active ? '' : 'opacity:0.7;'}`">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:34px;">
          <button class="btn btn-xs" :disabled="index === 0" title="Subir en el orden" @click="moveAnnouncement(index, -1)">▲</button>
          <span style="font-weight:800;">{{ index + 1 }}</span>
          <button class="btn btn-xs" :disabled="index === announcements.length - 1" title="Bajar en el orden" @click="moveAnnouncement(index, 1)">▼</button>
        </div>
        <div style="width:240px;aspect-ratio:16/9;background:#111;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.8rem;">
          <video v-if="video.public_url" :src="video.public_url" controls preload="metadata" style="width:100%;height:100%;object-fit:contain;"></video>
          <span v-else-if="video.status === 'processing'">⏳ Convirtiendo…</span>
          <span v-else>Sin video</span>
        </div>
        <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px;justify-content:center;">
          <input :value="video.title" type="text" maxlength="120" class="input input-bordered input-sm w-full" style="font-weight:700;"
                 @blur="saveTitle(video, $event.target.value)" @keyup.enter="$event.target.blur()" />
          <div :style="`font-size:0.8rem;font-weight:700;color:${announcementStatus(video).color};`">{{ announcementStatus(video).text }}</div>
          <div style="font-size:0.8rem;color:#666;">
            {{ formatDuration(video.duration_seconds) }} · {{ formatSize(video.size_bytes) }}
            <span v-if="video.is_vertical" style="color:#B45309;">· Vertical (fondo difuminado)</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;justify-content:center;min-width:110px;">
          <button v-if="video.is_active" class="btn btn-xs btn-warning" @click="patchAnnouncement(video, { is_active: false })">⏸ Desactivar</button>
          <button v-else class="btn btn-xs btn-success text-white" :disabled="video.status !== 'ready'"
                  :title="video.status !== 'ready' ? 'Espera a que termine de convertirse para revisarlo' : ''"
                  @click="patchAnnouncement(video, { is_active: true })">▶ Activar</button>
          <button class="btn btn-xs btn-error text-white" @click="removeAnnouncement(video)">🗑 Eliminar</button>
        </div>
      </div>
    </div>
  </div>
</template>
