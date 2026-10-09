<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useCajerasSucursal } from '@/composables/useCajerasSucursal'
import { SUCURSALES_FILTRO } from '@/utils/cajerasSucursalHelpers'
import AsignarPanel from '@/components/cajerasSucursal/AsignarPanel.vue'
import SucursalFilterButtons from '@/components/cajerasSucursal/SucursalFilterButtons.vue'
import SucursalColumn from '@/components/cajerasSucursal/SucursalColumn.vue'
import AdminCajerasPanel from '@/components/cajerasSucursal/AdminCajerasPanel.vue'

const auth = useAuthStore()
const user = computed(() => auth.user)

const {
  loading,
  todasLasCajeras,
  cajerasPorSucursal,
  cargarCajeras,
  handleAsignar,
  removerAsignacion,
  toggleActiva,
  getCajerasAdminPorSitio,
} = useCajerasSucursal(user)

const sucursalesSeleccionadas = ref([])

function toggleSucursal(sucursal) {
  const idx = sucursalesSeleccionadas.value.findIndex((s) => s.id === sucursal.id)
  if (idx === -1) {
    sucursalesSeleccionadas.value = [...sucursalesSeleccionadas.value, sucursal]
  } else {
    sucursalesSeleccionadas.value = sucursalesSeleccionadas.value.filter((s) => s.id !== sucursal.id)
  }
}

const cajerasMty = computed(() => getCajerasAdminPorSitio('3000'))
const cajerasCdmx = computed(() => getCajerasAdminPorSitio('3100'))

onMounted(() => {
  cargarCajeras()
})
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">
    <div class="flex-none bg-gradient-to-r from-teal-800 to-teal-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-teal-900 hover:bg-teal-50 border-0 font-bold" @click="$router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">🧑‍💼 Gestión de Cajeras por Sucursal</span>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => $router.push('/login'))">Salir</button>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="loading && todasLasCajeras.length === 0" class="flex justify-center py-10">
        <span class="loading loading-spinner loading-lg"></span>
      </div>

      <template v-else>
        <AsignarPanel :todas-las-cajeras="todasLasCajeras" @asignar="handleAsignar" />

        <SucursalFilterButtons :seleccionadas="sucursalesSeleccionadas" @toggle="toggleSucursal" />

        <div v-if="sucursalesSeleccionadas.length === 0" class="text-center text-base-content/50 py-10">
          Selecciona una o más sucursales para ver sus cajeras asignadas
        </div>
        <div v-else class="overflow-x-auto">
          <div class="grid grid-flow-col auto-cols-[minmax(210px,1fr)] gap-2.5" style="min-width: 1100px;">
            <SucursalColumn
              v-for="sucursal in SUCURSALES_FILTRO"
              :key="sucursal.id"
              :sucursal="sucursal"
              :cajeras="sucursalesSeleccionadas.some((s) => s.id === sucursal.id) ? cajerasPorSucursal[sucursal.id] : []"
              :is-selected="sucursalesSeleccionadas.some((s) => s.id === sucursal.id)"
              @remover="(cajeraId) => removerAsignacion(cajeraId, sucursal.id)"
            />
          </div>
        </div>

        <AdminCajerasPanel
          :cajeras-mty="cajerasMty"
          :cajeras-cdmx="cajerasCdmx"
          @toggle-activa="toggleActiva"
        />
      </template>
    </div>
  </div>
</template>
