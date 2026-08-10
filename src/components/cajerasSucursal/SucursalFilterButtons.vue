<script setup>
import { SUCURSALES_FILTRO } from '@/utils/cajerasSucursalHelpers'

defineProps({
  seleccionadas: { type: Array, default: () => [] },
})

const emit = defineEmits(['toggle'])
</script>

<template>
  <div class="mb-4">
    <h3 class="font-bold text-sm mb-2">Filtrar sucursales</h3>
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
      <button
        v-for="suc in SUCURSALES_FILTRO"
        :key="suc.id"
        class="btn btn-sm"
        :class="seleccionadas.some((s) => s.id === suc.id) ? 'btn-primary' : 'btn-outline opacity-60'"
        @click="emit('toggle', suc)"
      >
        {{ suc.icon }} {{ suc.label }}
      </button>
    </div>
  </div>
</template>
