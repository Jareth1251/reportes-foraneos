<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { SESSION_KEY } from '@/router'
import { getWarehouseManagerScope } from '@/utils/warehouseManagerScope'
import { MODULE_DEFS, getModuleKeysForDept } from '@/utils/departmentModules'

const router = useRouter()
const auth   = useAuthStore()

const deptId = computed(() =>
  String(auth.user?.departmentId ?? auth.user?.department_id ?? '').trim()
)
const warehouseManagerScope = computed(() => getWarehouseManagerScope(auth.user))

const MODULES = computed(() => {
  const mods = getModuleKeysForDept(deptId.value).map(k => MODULE_DEFS[k])
  if (warehouseManagerScope.value) mods.push(MODULE_DEFS['agentes-almacen'])
  return mods
})

function goTo(key) {
  sessionStorage.setItem(SESSION_KEY, key)
  router.push({ name: key })
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-base-200 p-6">

    <div class="mb-8 text-center">
      <div class="text-5xl mb-3">🏷️</div>
      <p class="text-sm text-base-content/60">
        Bienvenido, <strong class="text-base-content">{{ auth.user?.name || auth.user?.username || 'Usuario' }}</strong>
      </p>
    </div>

    <h2 class="text-xl font-bold text-base-content mb-1 text-center">¿A qué módulo deseas acceder?</h2>
    <p class="text-sm text-base-content/50 mb-8 text-center">Selecciona una opción para continuar</p>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full max-w-6xl">
      <button
        v-for="mod in MODULES"
        :key="mod.key"
        class="card bg-base-100 shadow-md hover:shadow-xl transition-all duration-150 hover:-translate-y-1 cursor-pointer border-2"
        :style="`border-color:${mod.border};`"
        @click="goTo(mod.key)"
      >
        <div class="card-body items-center text-center gap-3 py-7">
          <div
            class="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            :style="`background:${mod.bg};`"
          >
            {{ mod.icon }}
          </div>
          <h3 class="card-title text-base" :style="`color:${mod.color};`">{{ mod.label }}</h3>
          <p class="text-xs text-base-content/60 leading-relaxed">{{ mod.desc }}</p>
        </div>
      </button>
    </div>

<button 
  class="btn btn-sm mt-10" 
  :style="{ backgroundColor: buttonColor, color: '#3b82f6', textColor }" 
  @click="auth.logout().then(() => router.push('/login'))"
>
  Cerrar sesión
</button>

  </div>
</template>
