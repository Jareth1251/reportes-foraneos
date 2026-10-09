<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWarehouseAgentsStore } from '@/stores/warehouseAgents'
import { getWarehouseManagerScope } from '@/utils/warehouseManagerScope'

const router = useRouter()
if (!sessionStorage.getItem('foraneos_module_chosen')) {
  router.replace({ name: 'selector' })
}

const auth  = useAuthStore()
const store = useWarehouseAgentsStore()
const scope = getWarehouseManagerScope(auth.user)

const q               = ref('')
const includeInactive = ref(false)
const formOpen        = ref(false)
const editingId       = ref(null)
const form            = reactive({ id: '', username: '', name: '', isActive: 1 })
const formError       = ref(null)

let _debounce = null

function fetchAgents() {
  if (!scope) return
  store.fetchAgents({ q: q.value, includeInactive: includeInactive.value })
}

onMounted(fetchAgents)

function onFilterChange() {
  clearTimeout(_debounce)
  _debounce = setTimeout(fetchAgents, 250)
}

// ── Generación automática de id/username a partir del nombre ───────────────
function stripAccents(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
function normalizeForTokens(s = '') {
  return stripAccents(String(s)).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
const STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'das'])
function pickNameWords(fullName = '') {
  const raw = normalizeForTokens(fullName)
  const parts = raw.split(' ').filter(Boolean)
  const words = parts.filter(w => /[a-z]/.test(w) && !STOP_WORDS.has(w))
  return { raw, parts, words }
}
function getAlmacenNumber(fullName = '') {
  const raw = normalizeForTokens(fullName)
  const m = raw.match(/\balmacen\s*([0-9]+)\b/)
  return (m && m[1]) ? String(parseInt(m[1], 10)) : null
}
function makeUsernameBase(fullName = '') {
  const { raw, words } = pickNameWords(fullName)
  if (!raw) return ''
  const n = getAlmacenNumber(fullName)
  if (n) return `almacen${n}`
  if (!words.length) return ''
  const first = words[0]
  let surname = words.length >= 3 ? words[words.length - 2] : words[words.length - 1] || words[0]
  return ((first[0] || '') + surname).replace(/\s/g, '')
}
function makeIdBase(fullName = '') {
  const n = getAlmacenNumber(fullName)
  if (n) return `VAL${n}`.toUpperCase().slice(0, 4)
  const { words } = pickNameWords(fullName)
  if (!words.length) return ''
  const first = words[0]
  const firstInitial = (first[0] || 'X').toUpperCase()
  const secondLetter = (first[1] || 'X').toUpperCase()
  let surname = words.length >= 3 ? words[words.length - 2] : words[words.length - 1] || words[0]
  const surnameInitial = (surname[0] || 'X').toUpperCase()
  return `V${firstInitial}${secondLetter}${surnameInitial}`.slice(0, 4)
}
function makeUniqueUsername(base, existingSet) {
  if (!base) return ''
  let candidate = base, i = 1
  while (existingSet.has(candidate)) { i += 1; candidate = `${base}${i}`.slice(0, 20) }
  return candidate
}
function makeUniqueId(base4, existingSet) {
  if (!base4) return ''
  const candidate = base4.toUpperCase().slice(0, 4)
  if (!existingSet.has(candidate)) return candidate
  const pre = candidate.slice(0, 3)
  const pool = '23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const c of pool) {
    const id = `${pre}${c}`
    if (!existingSet.has(id)) return id
  }
  return `${pre}Z`
}
function deriveIdsFromName(name) {
  const usernames = new Set(store.rows.map(r => String(r.username || '').toLowerCase()).filter(Boolean))
  const ids       = new Set(store.rows.map(r => String(r.id || '').toUpperCase()).filter(Boolean))
  return {
    id: makeUniqueId(makeIdBase(name), ids),
    username: makeUniqueUsername(makeUsernameBase(name), usernames),
  }
}
function onChangeName(val) {
  form.name = String(val || '')
  if (editingId.value) return
  const { id, username } = deriveIdsFromName(form.name)
  form.id = id
  form.username = username
}

// ── Form ─────────────────────────────────────────────────────────────────
function openNew() {
  editingId.value = null
  formError.value = null
  Object.assign(form, { id: '', username: '', name: '', isActive: 1 })
  formOpen.value = true
}
function openEdit(row) {
  editingId.value = String(row.id || '').toUpperCase()
  formError.value = null
  Object.assign(form, {
    id: String(row.id || '').toUpperCase(),
    username: String(row.username || '').toLowerCase(),
    name: String(row.name || ''),
    isActive: Number(row.isActive) ? 1 : 0,
  })
  formOpen.value = true
}
function closeForm() { formOpen.value = false; editingId.value = null; formError.value = null }

function validateForm() {
  if (!String(form.name || '').trim()) return 'Falta nombre'
  if (!editingId.value) {
    if (!String(form.id || '').trim()) return 'No se pudo generar el ID automáticamente'
    if (!String(form.username || '').trim()) return 'No se pudo generar el username automáticamente'
  }
  return null
}

async function save() {
  const err = validateForm()
  if (err) { formError.value = err; return }
  formError.value = null

  const payload = {
    id: String(form.id || '').trim().toUpperCase(),
    username: String(form.username || '').trim().toLowerCase(),
    name: String(form.name || '').trim(),
    site: scope.site,
    isActive: Number(form.isActive) ? 1 : 0,
  }

  const res = editingId.value
    ? await store.updateAgent(editingId.value, payload)
    : await store.createAgent(payload)

  if (res.ok) { closeForm(); await fetchAgents() }
}

async function toggleActive(row, nextActive) {
  await store.updateAgent(row.id, { isActive: nextActive ? 1 : 0 })
  await fetchAgents()
}

async function hardDelete(row) {
  if (!confirm(`Esto borra al agente "${row.name}" de forma definitiva. ¿Seguro?`)) return
  await store.deleteAgent(row.id)
  await fetchAgents()
}

// ── PIN de acceso a microfront-surtido ─────────────────────────────────────
// Mismo criterio que el backend (WarehouseAgentAuthService::isGenericAccount):
// las cuentas compartidas "almacenN" no llevan PIN.
function isGenericAccount(row) {
  return /^almacen\d*$/i.test(String(row.username || ''))
}
function canHavePin(row) {
  return Number(row.isActive) && !!row.username && !isGenericAccount(row)
}
function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

// El PIN en claro solo existe en la respuesta de generatePin: se muestra una
// vez en este modal y al cerrarlo se descarta.
const pinResult = ref(null)

async function generatePin(row) {
  const msg = row.hasPin
    ? `¿Restablecer el PIN de "${row.name}"?\n\nEl PIN anterior deja de funcionar y se cierra su sesión en surtido.`
    : `¿Generar PIN para "${row.name}"?`
  if (!confirm(msg)) return
  const res = await store.generatePin(row.id)
  if (res.ok) {
    pinResult.value = res.data
    await fetchAgents()
  }
}
function closePinResult() { pinResult.value = null }
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
        <span style="font-weight:700;padding:4px 12px;border-radius:8px;color:#455A64;background:#ECEFF1;font-size:1.2rem;line-height:1.2;">
          👤 Agentes de Almacén
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

    <div class="p-4" style="max-width:1200px;margin:0 auto;">

      <div v-if="!scope" class="alert alert-error">
        <span>No autorizado.</span>
      </div>

      <template v-else>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
          <h2 style="font-weight:900;margin:0;font-size:1.3rem;">Agentes de Almacén — {{ scope.siteLabel }}</h2>
        </div>

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
          <input v-model="q" @input="onFilterChange" type="search" placeholder="🔍 Buscar..."
                 class="input input-bordered input-sm" style="min-width:220px;" />
          <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;">
            <input type="checkbox" v-model="includeInactive" @change="onFilterChange" />
            Ver inactivos
          </label>
          <button class="btn btn-sm" :disabled="store.loading" @click="fetchAgents">
            <span v-if="store.loading" class="loading loading-spinner loading-xs"></span>
            <span v-else>🔄</span> Actualizar
          </button>
          <button class="btn btn-sm btn-success text-white ml-auto" @click="openNew">
            ＋ Nuevo agente
          </button>
        </div>

        <div v-if="store.error || formError" role="alert" class="alert alert-error mb-3 text-sm">
          <span>{{ formError || store.error }}</span>
          <button class="btn btn-ghost btn-xs ml-auto" @click="store.clearError(); formError = null">✕</button>
        </div>

        <!-- Formulario alta/edición -->
        <div v-if="formOpen" class="bg-white" style="padding:14px;border-radius:10px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <h4 style="font-weight:800;margin:0 0 10px;">{{ editingId ? 'Editar agente' : 'Nuevo agente' }}</h4>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <label style="flex:1;min-width:220px;">
              <span style="font-size:0.78rem;color:#666;display:block;margin-bottom:2px;">Nombre</span>
              <input :value="form.name" @input="onChangeName($event.target.value)"
                     type="text" class="input input-bordered input-sm w-full" />
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;">
              <input type="checkbox" :checked="!!form.isActive"
                     @change="form.isActive = $event.target.checked ? 1 : 0" />
              Activo
            </label>
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;color:#666;font-size:0.78rem;margin-top:8px;">
            <div><b>Usuario generado:</b> {{ form.username || '—' }}</div>
            <div><b>ID generado:</b> {{ form.id || '—' }}</div>
            <div v-if="editingId" style="color:#999;">(En edición no se regeneran)</div>
          </div>
          <div style="display:flex;gap:10px;margin-top:12px;">
            <button class="btn btn-sm btn-success text-white" :disabled="store.loading" @click="save">✓ Guardar</button>
            <button class="btn btn-sm" @click="closeForm">✕ Cancelar</button>
          </div>
        </div>

        <!-- Tabla -->
        <div class="bg-white" style="overflow-x:auto;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Activo</th>
                <th>PIN surtido</th>
                <th>Último acceso</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in store.rows" :key="r.id">
                <td>{{ r.name }}</td>
                <td style="font-family:monospace;">{{ r.username || '—' }}</td>
                <td>{{ Number(r.isActive) ? 'Sí' : 'No' }}</td>
                <td style="white-space:nowrap;">
                  <span v-if="isGenericAccount(r)" style="font-size:0.75rem;color:#999;">Genérica — sin PIN</span>
                  <span v-else-if="r.hasPin" :title="`Asignado ${formatDateTime(r.pinUpdatedAt)}`"
                        style="font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:999px;background:#E8F5E9;color:#2E7D32;">
                    ✓ Asignado
                  </span>
                  <span v-else style="font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:999px;background:#FFF3E0;color:#E65100;">
                    Sin PIN
                  </span>
                </td>
                <td style="font-size:0.8rem;white-space:nowrap;">{{ formatDateTime(r.lastLoginAt) }}</td>
                <td>
                  <!-- Una sola línea; el hueco del botón de PIN se reserva
                       aunque no aplique, para que Desactivar/Eliminar queden
                       alineados en todas las filas. -->
                  <div style="display:flex;gap:6px;flex-wrap:nowrap;align-items:center;">
                    <button class="btn btn-xs" @click="openEdit(r)">✏️ Editar</button>
                    <button v-if="canHavePin(r)" class="btn btn-xs btn-info text-white"
                            style="min-width:128px;"
                            :disabled="store.loading" @click="generatePin(r)">
                      🔑 {{ r.hasPin ? 'Restablecer PIN' : 'Generar PIN' }}
                    </button>
                    <span v-else style="min-width:128px;"></span>
                    <button v-if="Number(r.isActive)" class="btn btn-xs btn-warning" @click="toggleActive(r, false)">⏸ Desactivar</button>
                    <button v-else class="btn btn-xs btn-success text-white" @click="toggleActive(r, true)">▶ Activar</button>
                    <button class="btn btn-xs btn-error text-white" @click="hardDelete(r)">🗑 Eliminar</button>
                  </div>
                </td>
              </tr>
              <tr v-if="!store.rows.length">
                <td colspan="6" style="text-align:center;padding:16px;color:#999;">
                  {{ store.loading ? 'Cargando...' : 'No hay agentes para estos filtros.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- PIN recién generado: se muestra una sola vez -->
    <div v-if="pinResult"
         style="position:fixed;inset:0;z-index:60;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:16px;">
      <div class="bg-white" style="width:100%;max-width:360px;border-radius:12px;padding:20px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.25);">
        <div style="font-size:0.85rem;color:#666;">PIN de acceso a surtido</div>
        <div style="font-weight:800;font-size:1.05rem;margin-top:4px;">{{ pinResult.name }}</div>
        <div style="font-size:0.85rem;color:#666;">
          Usuario: <span style="font-family:monospace;font-weight:700;color:#222;">{{ pinResult.username }}</span>
        </div>
        <div style="font-family:monospace;font-size:3rem;font-weight:900;letter-spacing:0.35em;margin:14px 0 6px;padding-left:0.35em;color:#1565C0;">
          {{ pinResult.pin }}
        </div>
        <div style="font-size:0.8rem;color:#B71C1C;background:#FFEBEE;border-radius:8px;padding:8px;">
          Entrégaselo al agente. Por seguridad <b>no se vuelve a mostrar</b>; si lo olvida, restablécelo.
        </div>
        <button class="btn btn-sm btn-primary mt-4 w-full" @click="closePinResult">Listo</button>
      </div>
    </div>
  </div>
</template>
