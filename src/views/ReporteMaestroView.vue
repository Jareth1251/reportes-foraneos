<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { SESSION_KEY } from '@/router'
import { useReporteMaestro } from '@/composables/useReporteMaestro'
import { exportToExcel } from '@/utils/excelExport'
import { MAESTRO_FIELDS } from '@/components/reporteMaestro/reportFields'
import { SITIOS } from '@/utils/cajerasSucursalHelpers'

const router = useRouter()
if (!sessionStorage.getItem(SESSION_KEY)) {
  router.replace({ name: 'selector' })
}

const auth = useAuthStore()
const siteFilter = ref(SITIOS[0].id)

const { loading, dateStart, dateEnd, rows, fetchAll, shiftDay } = useReporteMaestro(siteFilter)

const AREAS = ['Tienda', 'Foráneo', 'Domicilio', 'Página']
const areaFilter = ref('todas')
const searchText = ref('')

const displayRows = computed(() => {
  let list = rows.value
  if (areaFilter.value !== 'todas') list = list.filter((r) => r.area === areaFilter.value)
  const term = searchText.value.trim().toLowerCase()
  if (term) list = list.filter((r) => String(r.erp_order || '').toLowerCase().includes(term))
  return list
})

const fieldCount = Object.keys(MAESTRO_FIELDS).length

function exportReport() {
  exportToExcel(displayRows.value, MAESTRO_FIELDS, `ReporteMaestro_${dateStart.value}_a_${dateEnd.value}.xlsx`)
}

onMounted(() => fetchAll())
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">

    <!-- Barra superior fija -->
    <div class="flex-none bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-slate-900 hover:bg-slate-50 border-0 font-bold" @click="router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">🗂️ Reporte Maestro</span>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => router.push('/login'))">Salir</button>
    </div>

    <!-- Filtros fijos -->
    <div class="flex-none bg-base-100 border-b border-base-300 px-4 py-2 flex flex-wrap gap-3 items-center shadow-sm">
      <div class="flex gap-2 items-center">
        <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(-1)" title="Día anterior">◄</button>
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] text-base-content/50 leading-none">Desde</label>
          <input type="date" v-model="dateStart" class="input input-bordered input-xs w-36" @change="fetchAll({ force: true })" />
        </div>
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] text-base-content/50 leading-none">Hasta</label>
          <input type="date" v-model="dateEnd" class="input input-bordered input-xs w-36" @change="fetchAll({ force: true })" />
        </div>
        <button class="btn btn-sm btn-ghost px-2" @click="shiftDay(1)" title="Día siguiente">►</button>
      </div>

      <select v-model="siteFilter" class="select select-bordered select-xs w-32" @change="fetchAll({ force: true })">
        <option v-for="s in SITIOS" :key="s.id" :value="s.id">{{ s.label }}</option>
      </select>

      <select v-model="areaFilter" class="select select-bordered select-xs w-32">
        <option value="todas">Todas las áreas</option>
        <option v-for="a in AREAS" :key="a" :value="a">{{ a }}</option>
      </select>

      <div class="flex items-center gap-1">
        <input v-model="searchText" type="text" placeholder="Buscar pedido..." class="input input-bordered input-xs w-56" />
        <button v-if="searchText" class="btn btn-xs btn-ghost" @click="searchText = ''">✕</button>
      </div>

      <div class="ml-auto flex items-center gap-3">
        <span class="text-xs text-base-content/70">
          <b class="text-base-content">{{ displayRows.length }}</b> {{ displayRows.length === 1 ? 'registro' : 'registros' }}
        </span>
        <button class="btn btn-xs btn-primary" :class="{ loading }" @click="fetchAll({ force: true })">
          <span v-if="!loading">↻ Actualizar</span>
          <span v-else>Cargando...</span>
        </button>
        <button class="btn btn-xs btn-success" @click="exportReport">⬇ Exportar Excel</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="flex-1 overflow-auto p-4">
      <div v-if="loading" class="flex justify-center py-16">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>
      <div v-else class="overflow-x-auto bg-base-100 rounded-lg shadow-sm">
        <table class="table table-sm">
          <thead>
            <tr class="text-sm">
              <th v-for="(label, field) in MAESTRO_FIELDS" :key="field">{{ label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="displayRows.length === 0">
              <td :colspan="fieldCount" class="text-center text-base-content/40 py-8">Sin registros.</td>
            </tr>
            <tr v-for="(r, i) in displayRows" :key="i" class="text-sm">
              <td
                v-for="(label, field) in MAESTRO_FIELDS"
                :key="field"
                :class="{ 'text-base-content/30 italic': r[field] === 'N/A' }"
              >{{ r[field] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
