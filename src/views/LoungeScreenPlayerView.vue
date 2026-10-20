<script setup>
// Lo que se ve en la TV del comedor: canciones de YouTube con un comunicado
// (MP4) cada N canciones, en el orden de createRotation. Las canciones llegan
// en ?p= (las arma el gestor "Pantalla Comedor") y los comunicados activos se
// piden a API-Base al abrir la página. Sin polling: para ver cambios se
// recarga la página.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { decodePlaylist, createRotation, fetchAnnouncements } from '@/services/loungeScreen'

// YouTube puede meter un anuncio antes del video: se le da más margen para arrancar.
const VIDEO_START_TIMEOUT_MS   = 15000
const YOUTUBE_START_TIMEOUT_MS = 45000
const STALL_TIMEOUT_MS         = 20000
// Si todos los elementos fallan seguidos (sin internet), se espera antes de reintentar.
const ALL_FAILED_RETRY_MS      = 30000

const route = useRoute()
const playlist = decodePlaylist(route.query.p)

let nextItem   = null
let totalItems = 0

const loaded        = ref(false)
const isEmpty       = ref(false)
const current       = ref(null)
const soundUnlocked = ref(false)
const showSoundHint = ref(false)

const videoEl  = ref(null)
const ytHolder = ref(null)

let ytPlayer = null
let ytReady  = null
let watchdog = null
let retryTimer = null
let failuresInARow = 0

function clearWatchdog() {
  if (watchdog) { clearTimeout(watchdog); watchdog = null }
}

function armWatchdog(ms) {
  clearWatchdog()
  watchdog = setTimeout(() => {
    console.warn('[Comedor] sin avanzar, saltando:', current.value)
    skipFailed()
  }, ms)
}

function markPlaying() {
  clearWatchdog()
  failuresInARow = 0
}

function playNext() {
  current.value = nextItem()
  playCurrent()
}

function skipFailed() {
  clearWatchdog()
  failuresInARow++
  if (failuresInARow >= totalItems) {
    failuresInARow = 0
    stopAll()
    retryTimer = setTimeout(() => { retryTimer = null; playNext() }, ALL_FAILED_RETRY_MS)
    return
  }
  playNext()
}

function stopAll() {
  const video = videoEl.value
  if (video) video.pause()
  try { ytPlayer?.stopVideo() } catch { /* aún no listo */ }
}

function playCurrent() {
  const item = current.value
  if (!item) return
  stopAll()
  if (item.type === 'youtube') playYoutube(item.videoId)
  else playVideo(item.url)
}

// ── MP4 ────────────────────────────────────────────────────────────────────
function playVideo(url) {
  const video = videoEl.value
  armWatchdog(VIDEO_START_TIMEOUT_MS)
  video.src = url
  video.muted = false
  video.play().catch(err => {
    if (err?.name !== 'NotAllowedError') { console.warn('[Comedor] no se pudo reproducir:', err); skipFailed(); return }
    // El navegador bloqueó el audio sin interacción: seguir en silencio y pedir OK.
    video.muted = true
    showSoundHint.value = true
    video.play().catch(() => skipFailed())
  })
}

function onVideoWaiting() {
  if (current.value?.type === 'video') armWatchdog(STALL_TIMEOUT_MS)
}

function onVideoError() {
  if (current.value?.type !== 'video') return
  console.warn('[Comedor] error cargando video:', videoEl.value?.currentSrc)
  skipFailed()
}

// ── YouTube ────────────────────────────────────────────────────────────────
function loadYoutubeApi() {
  if (ytReady) return ytReady
  ytReady = new Promise((resolve, reject) => {
    if (window.YT?.Player) { resolve(window.YT); return }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT) }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => { ytReady = null; reject(new Error('No cargó la API de YouTube')) }
    document.head.appendChild(script)
  })
  return ytReady
}

async function playYoutube(videoId) {
  armWatchdog(YOUTUBE_START_TIMEOUT_MS)
  let YT
  try {
    YT = await loadYoutubeApi()
  } catch (e) {
    console.warn('[Comedor]', e.message)
    skipFailed()
    return
  }
  // Mientras cargaba la API pudo haber cambiado el elemento actual.
  if (current.value?.videoId !== videoId) return

  if (!soundUnlocked.value) showSoundHint.value = true

  if (ytPlayer) {
    ytPlayer.loadVideoById(videoId)
    if (soundUnlocked.value) ytPlayer.unMute()
    else ytPlayer.mute()
    return
  }

  // YT.Player reemplaza el nodo que recibe; se le da uno propio para no pelear con Vue.
  const host = document.createElement('div')
  ytHolder.value.appendChild(host)
  ytPlayer = new YT.Player(host, {
    width: '100%',
    height: '100%',
    videoId,
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      iv_load_policy: 3,
      playsinline: 1,
      rel: 0,
      origin: window.location.origin,
    },
    events: {
      onReady: e => {
        if (soundUnlocked.value) e.target.unMute()
        else e.target.mute()
        e.target.playVideo()
      },
      onStateChange: e => {
        if (current.value?.type !== 'youtube') return
        if (e.data === YT.PlayerState.PLAYING) markPlaying()
        else if (e.data === YT.PlayerState.BUFFERING) armWatchdog(STALL_TIMEOUT_MS)
        else if (e.data === YT.PlayerState.ENDED) { clearWatchdog(); playNext() }
      },
      // 2 id inválido, 5 error de HTML5, 100 no existe, 101/150 no permite embeber.
      onError: e => {
        if (current.value?.type !== 'youtube') return
        console.warn('[Comedor] YouTube error', e.data, current.value.videoId)
        skipFailed()
      },
    },
  })
}

// ── Sonido ─────────────────────────────────────────────────────────────────
// En la LG el botón OK del control llega como keydown (Enter).
function unlockSound() {
  soundUnlocked.value = true
  showSoundHint.value = false
  if (videoEl.value) videoEl.value.muted = false
  try { ytPlayer?.unMute(); ytPlayer?.setVolume(100) } catch { /* aún no listo */ }
}

async function start() {
  let announcements = []
  try {
    announcements = await fetchAnnouncements()
  } catch (e) {
    // Sin API-Base la TV sigue con las canciones.
    console.warn('[Comedor] no se pudieron cargar los comunicados', e)
  }
  totalItems = playlist.songs.length + announcements.length
  nextItem = createRotation(playlist, announcements)
  loaded.value = true
  isEmpty.value = totalItems === 0
  if (totalItems) playNext()
}

onMounted(() => {
  document.addEventListener('keydown', unlockSound)
  document.addEventListener('click', unlockSound)
  start()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', unlockSound)
  document.removeEventListener('click', unlockSound)
  clearWatchdog()
  if (retryTimer) clearTimeout(retryTimer)
  try { ytPlayer?.destroy() } catch { /* nada */ }
})
</script>

<template>
  <div class="tv">
    <div v-if="loaded && isEmpty" class="tv-empty">
      Sin canciones ni comunicados activos.<br />
      Abre el link que genera el módulo "Pantalla Comedor".
    </div>

    <video v-show="current?.type === 'video'" ref="videoEl" class="tv-layer" playsinline preload="auto"
           @playing="markPlaying" @waiting="onVideoWaiting" @ended="playNext" @error="onVideoError"></video>

    <div v-show="current?.type === 'youtube'" ref="ytHolder" class="tv-layer tv-youtube"></div>

    <div v-if="showSoundHint" class="tv-sound-hint">Presiona OK para activar el sonido</div>
  </div>
</template>

<style scoped>
.tv {
  position: fixed;
  inset: 0;
  background: #000;
  overflow: hidden;
  cursor: none;
}
.tv-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}
/* El iframe no debe robar el foco ni los clics: el OK del control lo escucha la página. */
.tv-youtube {
  pointer-events: none;
}
.tv-youtube :deep(iframe) {
  width: 100%;
  height: 100%;
  border: 0;
}
.tv-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #ccc;
  font: 700 clamp(1.2rem, 2.5vw, 2.4rem)/1.4 sans-serif;
}
.tv-sound-hint {
  position: absolute;
  left: 50%;
  bottom: clamp(1rem, 3vw, 2.5rem);
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  padding: 0.6em 1.2em;
  border-radius: 999px;
  font: 700 clamp(1rem, 1.6vw, 1.6rem) sans-serif;
}
</style>
