<script setup>
import { SITIOS } from '@/utils/cajerasSucursalHelpers'

const props = defineProps({
  sucursal: { type: Object, required: true },
  cajeras: { type: Array, default: () => [] },
  isSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['remover'])

function siteLabel(sitio) {
  return SITIOS.find((s) => s.id === sitio)?.label || 'MTY'
}
</script>

<template>
  <div
    class="border border-base-300 rounded-md bg-base-100 h-72 flex flex-col transition-opacity"
    :class="isSelected ? 'opacity-100' : 'opacity-40'"
  >
    <div class="px-3 py-2 bg-base-300 border-b border-base-300 flex items-center justify-between">
      <span class="font-bold text-xs truncate">{{ sucursal.icon }} {{ sucursal.label }}</span>
      <span class="badge badge-primary badge-sm">{{ isSelected ? cajeras.length : 0 }}</span>
    </div>

    <div class="overflow-y-auto flex-1 p-1.5">
      <div v-if="!isSelected" class="text-center text-base-content/40 text-xs py-8">No seleccionada</div>
      <div v-else-if="cajeras.length === 0" class="text-center text-base-content/50 text-xs py-8">
        No hay cajeras asignadas
      </div>
      <div
        v-else
        v-for="cajera in cajeras"
        :key="`${cajera.id}-${sucursal.id}`"
        class="grid grid-cols-[1fr_auto] items-center gap-1.5 py-1.5 px-1 border-b border-base-200 text-xs"
        :class="cajera.activa === false ? 'bg-base-200' : ''"
      >
        <div class="truncate">
          <strong>{{ cajera.nombre }}</strong>
          <span v-if="cajera.sitio" class="ml-1 text-base-content/50 text-[10px]">({{ siteLabel(cajera.sitio) }})</span>
          <span v-if="cajera.activa === false" class="ml-1 text-error text-[10px]">(Inactiva)</span>
        </div>
        <button
          class="btn btn-circle btn-xs btn-error"
          title="Remover asignación"
          @click="emit('remover', cajera.id)"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
</template>
