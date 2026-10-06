<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  SCREEN_GROUPS,
  SCREEN_OPTIONS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  MAX_DURATION_SECONDS,
  listScreenVideos,
  uploadScreenVideo,
  replaceScreenVideo,
  updateScreenVideo,
  reorderScreenVideos,
  deleteScreenVideo,
  readVideoMetadata,
  apiErrorMessage,
} from '@/services/screenVideos'

const router = useRouter()
if (!sessionStorage.getItem('foraneos_module_chosen')) {
  router.replace({ name: 'selector' })
}

const auth = useAuthStore()

const videos    = ref([])
const loading   = ref(false)
const error     = ref(null)
const showGuide = ref(false)

const upload = reactive({
  file: null,
  title: '',
  screens: ['cdmx-piso'],
  metadata: null,
  progress: null,
  error: null,
})
const fileInput = ref(null)

// id del video cuyo archivo se está reemplazando → % de subida
const replacing = reactive({})
// <input type=file> oculto de cada fila (no necesita ser reactivo)
const replaceInputs = {}

const hasProcessing = computed(() => videos.value.some(v => v.status === 'processing'))

// Mismo criterio que la playlist de API-Base (ScreenVideo::scopePlayableOn):
// activo y con un MP4 ya convertido. El orden de la lista es el de rotación.
function isPlayable(video) {
  return video.is_active && !!video.public_url
}

const rotationByCity = computed(() =>
  SCREEN_GROUPS.map(group => ({
    ...group,
    screens: group.screens.map(screen => ({
      ...screen,
      videos: videos.value.filter(v => isPlayable(v) && v.screens.includes(screen.key)),
    })),
  })),
)

// Los videos nuevos y los reemplazos llegan desactivados: alguien los revisa
// en la vista previa y los activa a mano (API-Base bloquea activar sin MP4).
function rotationLabel(video) {
  if (video.status === 'processing' && !video.is_active) return { tone: 'muted', text: 'Convirtiendo… cuando termine podrás revisarlo aquí' }
  if (video.status === 'failed' && !video.is_active) return { tone: 'muted', text: 'No se muestra: falló la conversión' }
  if (!video.is_active && video.status === 'ready') return { tone: 'review', text: 'Listo para revisar: míralo en la vista previa y presiona Activar para mostrarlo' }
  if (!video.is_active) return { tone: 'muted', text: 'No se muestra: desactivado' }
  const labels = SCREEN_OPTIONS.filter(o => video.screens.includes(o.key)).map(o => o.label)
  return { tone: 'onAir', text: `En rotación en ${labels.join(', ')}` }
}

const ROTATION_TONES = {
  onAir:  { icon: '🟢', color: '#15803D' },
  review: { icon: '👀', color: '#1D4ED8' },
  muted:  { icon: '⚪', color: '#6B7280' },
}

const uploadNotice = ref(null)

async function fetchVideos() {
  loading.value = true
  error.value = null
  try {
    videos.value = await listScreenVideos()
  } catch (e) {
    error.value = apiErrorMessage(e, 'No se pudo cargar la lista de videos')
  } finally {
    loading.value = false
  }
}

onMounted(fetchVideos)

// ── Subida ─────────────────────────────────────────────────────────────────
const uploadWarnings = computed(() => {
  const warnings = []
  const m = upload.metadata
  if (!upload.file) return warnings
  if (!m) {
    warnings.push('No se pudo previsualizar el video en este navegador (común con videos de iPhone). No pasa nada: el sistema lo convierte igual.')
    return warnings
  }
  if (m.height > m.width) warnings.push('Tu video es vertical: se verá al centro con un fondo difuminado a los lados. Para aprovechar toda la pantalla, grábalo en horizontal.')
  if (m.duration > 45 && m.duration <= MAX_DURATION_SECONDS) warnings.push(`Dura ${Math.round(m.duration)} s. Recomendamos 10 a 45 s para que los clientes no pierdan de vista sus turnos.`)
  if (m.width && m.width < 1280 && m.height < 1280) warnings.push(`La resolución es baja (${m.width}×${m.height}); podría verse borroso en la TV.`)
  return warnings
})

const uploadBlocker = computed(() => {
  if (!upload.file) return 'Selecciona un video'
  if (upload.file.size > MAX_UPLOAD_BYTES) return `El video pesa más de ${MAX_UPLOAD_MB} MB`
  if (upload.metadata && upload.metadata.duration > MAX_DURATION_SECONDS) return `El video dura más de ${MAX_DURATION_SECONDS} segundos`
  if (!upload.title.trim()) return 'Escribe un título'
  if (!upload.screens.length) return 'Elige al menos una pantalla'
  return null
})

async function onFileSelected(event) {
  const file = event.target.files?.[0] ?? null
  upload.file = file
  upload.error = null
  upload.metadata = null
  if (!file) return
  if (!upload.title.trim()) upload.title = file.name.replace(/\.[^.]+$/, '').slice(0, 120)
  upload.metadata = await readVideoMetadata(file)
}

function resetUpload() {
  Object.assign(upload, { file: null, title: '', screens: ['cdmx-piso'], metadata: null, progress: null, error: null })
  if (fileInput.value) fileInput.value.value = ''
}

async function submitUpload() {
  if (uploadBlocker.value) { upload.error = uploadBlocker.value; return }
  upload.error = null
  uploadNotice.value = null
  upload.progress = 0
  try {
    await uploadScreenVideo(
      { file: upload.file, title: upload.title.trim(), screens: upload.screens },
      p => { upload.progress = p },
    )
    resetUpload()
    uploadNotice.value = 'Video subido. Se está convirtiendo; cuando esté listo, revísalo en la vista previa y presiona Activar para que salga en las pantallas.'
    await fetchVideos()
  } catch (e) {
    upload.error = apiErrorMessage(e, 'No se pudo subir el video')
    upload.progress = null
  }
}

// ── Acciones por video ─────────────────────────────────────────────────────
async function patchVideo(video, payload) {
  error.value = null
  try {
    const updated = await updateScreenVideo(video.id, payload)
    Object.assign(video, updated)
  } catch (e) {
    error.value = apiErrorMessage(e, 'No se pudo guardar el cambio')
    await fetchVideos()
  }
}

function saveTitle(video, value) {
  const title = String(value || '').trim()
  if (!title || title === video.title) return
  patchVideo(video, { title })
}

function toggleScreen(video, screenKey) {
  const screens = video.screens.includes(screenKey)
    ? video.screens.filter(s => s !== screenKey)
    : [...video.screens, screenKey]
  if (!screens.length) { error.value = 'El video debe quedar al menos en una pantalla. Si no quieres mostrarlo, desactívalo.'; return }
  patchVideo(video, { screens })
}

async function move(index, delta) {
  const target = index + delta
  if (target < 0 || target >= videos.value.length) return
  const reordered = [...videos.value]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  videos.value = reordered
  error.value = null
  try {
    await reorderScreenVideos(reordered.map(v => v.id))
  } catch (e) {
    error.value = apiErrorMessage(e, 'No se pudo guardar el orden')
    await fetchVideos()
  }
}

function pickReplacement(video) {
  replaceInputs[video.id]?.click()
}

async function onReplacementSelected(video, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > MAX_UPLOAD_BYTES) { error.value = `El video pesa más de ${MAX_UPLOAD_MB} MB`; return }
  if (!confirm(`¿Reemplazar "${video.title}" por "${file.name}"? Las pantallas seguirán mostrando el video actual mientras se convierte el nuevo. Al terminar, quedará desactivado para que lo revises y lo actives.`)) return
  error.value = null
  replacing[video.id] = 0
  try {
    await replaceScreenVideo(video.id, file, p => { replacing[video.id] = p })
    await fetchVideos()
  } catch (e) {
    error.value = apiErrorMessage(e, 'No se pudo reemplazar el video')
  } finally {
    delete replacing[video.id]
  }
}

async function removeVideo(video) {
  if (!confirm(`Esto elimina "${video.title}" de forma definitiva y deja de mostrarse en las pantallas. ¿Seguro?`)) return
  error.value = null
  try {
    await deleteScreenVideo(video.id)
    await fetchVideos()
  } catch (e) {
    error.value = apiErrorMessage(e, 'No se pudo eliminar el video')
  }
}

// ── Formato ────────────────────────────────────────────────────────────────
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
        <span style="font-weight:700;padding:4px 12px;border-radius:8px;color:#C2410C;background:#FFEDD5;font-size:1.2rem;line-height:1.2;">
          🎬 Videos de Pantallas
        </span>
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

      <!-- Guía -->
      <div class="bg-white" style="border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:16px;">
        <button @click="showGuide = !showGuide"
                style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:none;border:none;cursor:pointer;font-weight:800;font-size:1rem;">
          <span>📋 ¿Cómo debe ser mi video?</span>
          <span>{{ showGuide ? '▲' : '▼' }}</span>
        </button>
        <div v-if="showGuide" style="padding:0 16px 16px;font-size:0.88rem;line-height:1.55;color:#333;">
          <p style="margin:0 0 10px;">
            <b>No necesitas convertir nada.</b> Sube el video tal cual sale de tu celular o de tu editor (MP4, MOV, etc.)
            y el sistema lo ajusta automáticamente para las pantallas.
          </p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
            <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:10px 12px;">
              <b>✅ Recomendado</b>
              <ul style="margin:6px 0 0;padding-left:18px;">
                <li><b>Horizontal 16:9</b> (1920×1080). Así ocupa toda la pantalla.</li>
                <li>Duración de <b>10 a 45 segundos</b>.</li>
                <li>Texto grande y alejado de las orillas.</li>
                <li>Buena iluminación y audio claro, sin ruido de fondo.</li>
              </ul>
            </div>
            <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 12px;">
              <b>⚠️ Se acepta, pero se ve peor</b>
              <ul style="margin:6px 0 0;padding-left:18px;">
                <li><b>Vertical</b> (de celular): se muestra al centro con fondo difuminado a los lados.</li>
                <li>Más de 45 s: los clientes dejan de ver sus turnos más tiempo.</li>
              </ul>
            </div>
            <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 12px;">
              <b>⛔ Límites</b>
              <ul style="margin:6px 0 0;padding-left:18px;">
                <li>Máximo <b>{{ MAX_UPLOAD_MB }} MB</b> por archivo.</li>
                <li>Máximo <b>{{ MAX_DURATION_SECONDS }} segundos</b> de duración.</li>
              </ul>
            </div>
          </div>
          <p style="margin:10px 0 0;color:#333;">
            <b>👀 Revisión:</b> todo video nuevo o reemplazado queda <b>desactivado</b>. Cuando termine de convertirse,
            revísalo en la vista previa y presiona <b>▶ Activar</b> para que salga en las pantallas.
          </p>
          <p style="margin:10px 0 0;color:#666;">
            El volumen se nivela automáticamente para que todos los videos suenen parecido. Las pantallas muestran
            los turnos 40 s, luego un video completo, y así van rotando en el orden de la lista.
          </p>
        </div>
      </div>

      <!-- Subir -->
      <div class="bg-white" style="padding:14px 16px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:16px;">
        <h4 style="font-weight:800;margin:0 0 10px;">Subir video nuevo</h4>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
          <label style="flex:1;min-width:240px;">
            <span style="font-size:0.78rem;color:#666;display:block;margin-bottom:2px;">Archivo de video</span>
            <input ref="fileInput" type="file" accept="video/*" class="file-input file-input-bordered file-input-sm w-full"
                   :disabled="upload.progress !== null" @change="onFileSelected" />
          </label>
          <label style="flex:1;min-width:220px;">
            <span style="font-size:0.78rem;color:#666;display:block;margin-bottom:2px;">Título (solo para identificarlo)</span>
            <input v-model="upload.title" type="text" maxlength="120" class="input input-bordered input-sm w-full"
                   :disabled="upload.progress !== null" />
          </label>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-top:12px;">
          <div style="flex:1;min-width:280px;">
            <span style="font-size:0.78rem;color:#666;display:block;margin-bottom:4px;">Pantallas donde se mostrará</span>
            <div v-for="group in SCREEN_GROUPS" :key="group.city" class="screen-picker-row">
              <span class="screen-picker-city">{{ group.city }}</span>
              <label v-for="screen in group.screens" :key="screen.key" class="screen-picker-option">
                <input type="checkbox" :value="screen.key" v-model="upload.screens" :disabled="upload.progress !== null" />
                {{ screen.name }}
              </label>
            </div>
          </div>
          <button class="btn btn-sm btn-success text-white" :disabled="!!uploadBlocker || upload.progress !== null" @click="submitUpload">
            <span v-if="upload.progress !== null" class="loading loading-spinner loading-xs"></span>
            ⬆ Subir
          </button>
        </div>

        <div v-if="upload.file" style="margin-top:8px;font-size:0.8rem;color:#666;">
          {{ upload.file.name }} · {{ formatSize(upload.file.size) }}
          <template v-if="upload.metadata">
            · {{ upload.metadata.width }}×{{ upload.metadata.height }} · {{ formatDuration(upload.metadata.duration) }}
          </template>
        </div>

        <div v-for="w in uploadWarnings" :key="w" class="alert alert-warning text-sm" style="margin-top:8px;padding:6px 12px;">
          <span>{{ w }}</span>
        </div>

        <div v-if="upload.progress !== null" style="margin-top:10px;">
          <progress class="progress progress-success w-full" :value="upload.progress" max="100"></progress>
          <div style="font-size:0.78rem;color:#666;">
            {{ upload.progress < 100 ? `Subiendo… ${upload.progress}%` : 'Guardando…' }}
          </div>
        </div>

        <div v-if="uploadNotice" class="alert alert-info text-sm" style="margin-top:8px;padding:6px 12px;">
          <span>{{ uploadNotice }}</span>
          <button class="btn btn-ghost btn-xs ml-auto" @click="uploadNotice = null">✕</button>
        </div>

        <div v-if="upload.error" class="alert alert-error text-sm" style="margin-top:8px;padding:6px 12px;">
          <span>{{ upload.error }}</span>
        </div>
      </div>

      <!-- En rotación -->
      <div v-for="group in rotationByCity" :key="group.city" style="margin-bottom:16px;">
        <h3 style="font-weight:900;margin:0 0 8px;font-size:1rem;color:#374151;">📍 {{ group.city }}</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;">
          <div v-for="screen in group.screens" :key="screen.key" class="bg-white"
               :style="{ padding: '12px 16px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: `4px solid ${screen.videos.length ? '#16A34A' : '#D1D5DB'}` }">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
              <b>📺 {{ screen.name }}</b>
              <span style="font-size:0.78rem;color:#666;white-space:nowrap;">{{ screen.videos.length }} en rotación</span>
            </div>
            <ol v-if="screen.videos.length" style="margin:0;padding-left:20px;font-size:0.88rem;">
              <li v-for="v in screen.videos" :key="v.id">
                {{ v.title }} <span style="color:#888;">· {{ formatDuration(v.duration_seconds) }}</span>
              </li>
            </ol>
            <div v-else style="font-size:0.85rem;color:#999;">Sin videos: solo muestra los turnos.</div>
          </div>
        </div>
      </div>

      <!-- Lista -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        <h3 style="font-weight:900;margin:0;font-size:1.15rem;">Videos ({{ videos.length }})</h3>
        <button class="btn btn-sm" :disabled="loading" @click="fetchVideos">
          <span v-if="loading" class="loading loading-spinner loading-xs"></span>
          <span v-else>🔄</span> Actualizar
        </button>
        <span v-if="hasProcessing" style="font-size:0.8rem;color:#B45309;">
          Hay videos convirtiéndose. Presiona <b>Actualizar</b> en un momento para ver si ya están listos.
        </span>
      </div>

      <div v-if="error" role="alert" class="alert alert-error mb-3 text-sm">
        <span>{{ error }}</span>
        <button class="btn btn-ghost btn-xs ml-auto" @click="error = null">✕</button>
      </div>

      <div v-if="!videos.length" class="bg-white" style="padding:24px;border-radius:10px;text-align:center;color:#999;">
        {{ loading ? 'Cargando...' : 'Aún no hay videos. Sube el primero arriba.' }}
      </div>

      <div v-for="(v, index) in videos" :key="v.id" class="bg-white"
           :style="`display:flex;gap:14px;flex-wrap:wrap;padding:12px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:10px;${v.is_active ? '' : 'opacity:0.6;'}`">

        <!-- Orden -->
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:34px;">
          <button class="btn btn-xs" :disabled="index === 0" title="Subir en el orden" @click="move(index, -1)">▲</button>
          <span style="font-weight:800;">{{ index + 1 }}</span>
          <button class="btn btn-xs" :disabled="index === videos.length - 1" title="Bajar en el orden" @click="move(index, 1)">▼</button>
        </div>

        <!-- Vista previa -->
        <div style="width:240px;aspect-ratio:16/9;background:#111;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.8rem;text-align:center;">
          <video v-if="v.public_url" :src="v.public_url" controls preload="metadata" style="width:100%;height:100%;object-fit:contain;"></video>
          <span v-else-if="v.status === 'processing'">⏳ Convirtiendo…</span>
          <span v-else>Sin video</span>
        </div>

        <!-- Datos -->
        <div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:8px;">
          <input :value="v.title" type="text" maxlength="120" class="input input-bordered input-sm w-full" style="font-weight:700;"
                 @blur="saveTitle(v, $event.target.value)" @keyup.enter="$event.target.blur()" />

          <div :style="`font-size:0.8rem;font-weight:700;color:${ROTATION_TONES[rotationLabel(v).tone].color};`">
            {{ ROTATION_TONES[rotationLabel(v).tone].icon }} {{ rotationLabel(v).text }}
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:0.8rem;">
            <span v-if="v.status === 'ready'" class="badge badge-success badge-sm text-white">Listo</span>
            <span v-else-if="v.status === 'processing'" class="badge badge-warning badge-sm">Convirtiendo</span>
            <span v-else class="badge badge-error badge-sm text-white">Error</span>
            <span style="color:#666;">{{ formatDuration(v.duration_seconds) }} · {{ formatSize(v.size_bytes) }}</span>
            <span v-if="v.is_vertical" style="color:#B45309;">· Vertical (fondo difuminado)</span>
          </div>

          <div v-if="v.status === 'failed'" style="font-size:0.8rem;color:#B91C1C;">
            {{ v.error_message }}
            <template v-if="v.public_url"> Se sigue mostrando la versión anterior.</template>
          </div>
          <div v-else-if="v.status === 'processing' && v.public_url" style="font-size:0.8rem;color:#B45309;">
            Se está convirtiendo el reemplazo; mientras tanto se muestra la versión anterior. Al terminar quedará desactivado para revisión.
          </div>

          <div>
            <div v-for="group in SCREEN_GROUPS" :key="group.city" class="screen-picker-row">
              <span class="screen-picker-city">{{ group.city }}</span>
              <label v-for="screen in group.screens" :key="screen.key" class="screen-picker-option">
                <input type="checkbox" :checked="v.screens.includes(screen.key)" @change="toggleScreen(v, screen.key)" />
                {{ screen.name }}
              </label>
            </div>
          </div>

          <div v-if="replacing[v.id] !== undefined">
            <progress class="progress progress-success w-full" :value="replacing[v.id]" max="100"></progress>
            <div style="font-size:0.78rem;color:#666;">Subiendo reemplazo… {{ replacing[v.id] }}%</div>
          </div>
        </div>

        <!-- Acciones -->
        <div style="display:flex;flex-direction:column;gap:6px;justify-content:center;min-width:130px;">
          <button v-if="v.is_active" class="btn btn-xs btn-warning" @click="patchVideo(v, { is_active: false })">⏸ Desactivar</button>
          <button v-else class="btn btn-xs btn-success text-white" :disabled="v.status !== 'ready'"
                  :title="v.status !== 'ready' ? 'Espera a que termine de convertirse para revisarlo' : ''"
                  @click="patchVideo(v, { is_active: true })">▶ Activar</button>
          <button class="btn btn-xs" :disabled="replacing[v.id] !== undefined" @click="pickReplacement(v)">🔁 Reemplazar</button>
          <input :ref="el => { if (el) replaceInputs[v.id] = el }" type="file" accept="video/*" style="display:none;"
                 @change="onReplacementSelected(v, $event)" />
          <button class="btn btn-xs btn-error text-white" @click="removeVideo(v)">🗑 Eliminar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen-picker-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  padding: 3px 0;
  font-size: 0.86rem;
}
.screen-picker-row + .screen-picker-row {
  border-top: 1px dashed #E5E7EB;
}
.screen-picker-city {
  width: 82px;
  font-weight: 700;
  color: #374151;
}
.screen-picker-option {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
</style>
