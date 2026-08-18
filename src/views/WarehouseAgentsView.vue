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

    <div class="p-4" style="max-width:900px;margin:0 auto;">

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
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in store.rows" :key="r.id">
                <td>{{ r.name }}</td>
                <td>{{ Number(r.isActive) ? 'Sí' : 'No' }}</td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn btn-xs" @click="openEdit(r)">✏️ Editar</button>
                    <button v-if="Number(r.isActive)" class="btn btn-xs btn-warning" @click="toggleActive(r, false)">⏸ Desactivar</button>
                    <button v-else class="btn btn-xs btn-success text-white" @click="toggleActive(r, true)">▶ Activar</button>
                    <button class="btn btn-xs btn-error text-white" @click="hardDelete(r)">🗑 Eliminar</button>
                  </div>
                </td>
              </tr>
              <tr v-if="!store.rows.length">
                <td colspan="3" style="text-align:center;padding:16px;color:#999;">
                  {{ store.loading ? 'Cargando...' : 'No hay agentes para estos filtros.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>
