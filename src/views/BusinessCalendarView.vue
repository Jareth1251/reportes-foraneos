<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import { useAuthStore } from '@/stores/auth'
import { officialHolidays } from '@/utils/businessHours'
import {
  loadBusinessHoursExceptions,
  createBusinessHoursException,
  deleteBusinessHoursException,
} from '@/services/businessHours'
import { apiErrorMessage } from '@/services/storeReturns'

// Días no laborables (cajas, depto 002). Lo que se marca aquí detiene el reloj
// de los reportes de tiempos y del contador de las tarjetas: paros programados
// (día completo o por horas) y si un festivo oficial aplica o no a la empresa.

const router = useRouter()
if (!sessionStorage.getItem('foraneos_module_chosen')) {
  router.replace({ name: 'selector' })
}

const auth = useAuthStore()

const currentYear = new Date().getFullYear()
const year = ref(currentYear)
const years = [currentYear - 1, currentYear, currentYear + 1]

const rows = ref([])
const loading = ref(false)
const saving = ref(false)

async function reload() {
  loading.value = true
  try {
    const data = await loadBusinessHoursExceptions()
    if (data) rows.value = data
    else Swal.fire('Error', 'No se pudo cargar el calendario.', 'error')
  } finally {
    loading.value = false
  }
}
onMounted(reload)

const inYear = (r) => String(r.date).startsWith(`${year.value}-`)

const holidays = computed(() => officialHolidays(year.value).map((h) => ({
  ...h,
  working: rows.value.find((r) => r.kind === 'working' && String(r.date).slice(0, 10) === h.date) || null,
})))

const closures = computed(() => rows.value.filter((r) => r.kind === 'closure' && inYear(r)))

const form = reactive({ date: '', fullDay: true, start_time: '', end_time: '', reason: '' })

const formValid = computed(() =>
  form.date && form.reason.trim() &&
  (form.fullDay || (form.start_time && form.end_time && form.start_time < form.end_time)))

async function saveClosure() {
  if (!formValid.value) return
  saving.value = true
  try {
    await createBusinessHoursException({
      date: form.date,
      kind: 'closure',
      start_time: form.fullDay ? null : form.start_time,
      end_time: form.fullDay ? null : form.end_time,
      reason: form.reason.trim(),
    })
    Object.assign(form, { date: '', fullDay: true, start_time: '', end_time: '', reason: '' })
    await reload()
  } catch (e) {
    Swal.fire('Error', apiErrorMessage(e, 'No se pudo guardar el paro.'), 'error')
  } finally {
    saving.value = false
  }
}

async function markHolidayWorking(h) {
  saving.value = true
  try {
    await createBusinessHoursException({ date: h.date, kind: 'working', reason: `Se trabaja: ${h.name}` })
    await reload()
  } catch (e) {
    Swal.fire('Error', apiErrorMessage(e, 'No se pudo guardar.'), 'error')
  } finally {
    saving.value = false
  }
}

async function remove(row, question) {
  const { isConfirmed } = await Swal.fire({
    title: question,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí',
    cancelButtonText: 'Cancelar',
  })
  if (!isConfirmed) return
  saving.value = true
  try {
    await deleteBusinessHoursException(row.id)
    await reload()
  } catch (e) {
    Swal.fire('Error', apiErrorMessage(e, 'No se pudo eliminar.'), 'error')
  } finally {
    saving.value = false
  }
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function formatDate(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${WEEKDAYS[dow]} ${d} ${MONTHS[m - 1]} ${y}`
}
const hhmm = (t) => String(t || '').slice(0, 5)
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
        <span style="font-weight:700;padding:4px 12px;border-radius:8px;color:#4338CA;background:#E0E7FF;font-size:1.2rem;line-height:1.2;">
          📅 Días no laborables
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

    <div class="p-4" style="max-width:1000px;margin:0 auto;">

      <div class="alert alert-info text-sm mb-4 block">
        Los tiempos de turnos y foráneos solo cuentan en horario laboral:
        <b>lunes a viernes 8:30 – 18:00</b> y <b>sábado 9:00 – 13:00</b>. Domingos, festivos y los paros
        que registres aquí no cuentan: el reloj se detiene y sigue al abrir el siguiente día hábil.
      </div>

      <div class="flex items-center gap-2 mb-4">
        <span class="text-sm font-semibold">Año</span>
        <button v-for="y in years" :key="y" class="btn btn-sm"
                :class="y === year ? 'btn-primary' : 'btn-ghost bg-white'" @click="year = y">{{ y }}</button>
        <span v-if="loading" class="loading loading-spinner loading-sm ml-2"></span>
      </div>

      <!-- Festivos oficiales -->
      <div class="bg-white p-4 mb-4" style="border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h2 class="font-bold text-lg mb-1">Festivos oficiales y puentes</h2>
        <p class="text-xs text-gray-500 mb-3">
          Por defecto no se cuentan. Si la empresa sí trabaja ese día, márcalo y contará como día normal.
        </p>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead><tr><th>Fecha</th><th>Festivo</th><th>¿Aplica a la empresa?</th><th></th></tr></thead>
            <tbody>
              <tr v-for="h in holidays" :key="h.date">
                <td class="whitespace-nowrap">{{ formatDate(h.date) }}</td>
                <td>{{ h.name }}</td>
                <td>
                  <span v-if="h.working" class="badge badge-warning">Se trabaja (cuenta)</span>
                  <span v-else class="badge badge-success">Descanso (no cuenta)</span>
                </td>
                <td class="text-right">
                  <button v-if="h.working" class="btn btn-xs btn-ghost" :disabled="saving"
                          @click="remove(h.working, `¿Marcar ${h.name} como descanso?`)">Marcar descanso</button>
                  <button v-else class="btn btn-xs btn-outline" :disabled="saving"
                          @click="markHolidayWorking(h)">La empresa sí trabaja</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Registrar paro -->
      <div class="bg-white p-4 mb-4" style="border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h2 class="font-bold text-lg mb-3">Registrar paro programado o día de descanso</h2>
        <form class="flex flex-wrap gap-3 items-end" @submit.prevent="saveClosure">
          <label class="form-control">
            <span class="label-text text-xs font-semibold mb-1">Fecha</span>
            <input v-model="form.date" type="date" class="input input-bordered input-sm" />
          </label>
          <label class="label cursor-pointer gap-2 pb-1">
            <input v-model="form.fullDay" type="checkbox" class="checkbox checkbox-sm" />
            <span class="label-text text-sm">Todo el día</span>
          </label>
          <template v-if="!form.fullDay">
            <label class="form-control">
              <span class="label-text text-xs font-semibold mb-1">Desde</span>
              <input v-model="form.start_time" type="time" class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs font-semibold mb-1">Hasta</span>
              <input v-model="form.end_time" type="time" class="input input-bordered input-sm" />
            </label>
          </template>
          <label class="form-control grow" style="min-width:220px;">
            <span class="label-text text-xs font-semibold mb-1">Motivo</span>
            <input v-model="form.reason" type="text" maxlength="150" placeholder="Ej. Inventario anual, junta general…"
                   class="input input-bordered input-sm w-full" />
          </label>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="saving || !formValid">
            <span v-if="saving" class="loading loading-spinner loading-xs"></span>
            Guardar
          </button>
        </form>
        <p v-if="!form.fullDay && form.start_time && form.end_time && form.start_time >= form.end_time"
           class="text-xs text-error mt-2">La hora final debe ser después de la inicial.</p>
      </div>

      <!-- Paros registrados -->
      <div class="bg-white p-4" style="border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h2 class="font-bold text-lg mb-3">Paros registrados {{ year }}</h2>
        <p v-if="!closures.length" class="text-sm text-gray-500">No hay paros registrados en {{ year }}.</p>
        <div v-else class="overflow-x-auto">
          <table class="table table-sm">
            <thead><tr><th>Fecha</th><th>Horario</th><th>Motivo</th><th>Registró</th><th></th></tr></thead>
            <tbody>
              <tr v-for="r in closures" :key="r.id">
                <td class="whitespace-nowrap">{{ formatDate(r.date) }}</td>
                <td class="whitespace-nowrap">{{ r.start_time ? `${hhmm(r.start_time)} – ${hhmm(r.end_time)}` : 'Todo el día' }}</td>
                <td>{{ r.reason }}</td>
                <td class="text-xs text-gray-500">{{ r.created_by_name || '—' }}</td>
                <td class="text-right">
                  <button class="btn btn-xs btn-ghost text-error" :disabled="saving"
                          @click="remove(r, '¿Eliminar este paro?')">Eliminar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
