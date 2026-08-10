<script setup>
const props = defineProps({
  cajerasMty: { type: Array, default: () => [] },
  cajerasCdmx: { type: Array, default: () => [] },
})

const emit = defineEmits(['toggle-activa'])

function activasCount(cajeras) {
  return cajeras.filter((c) => c.activa !== false).length
}
</script>

<template>
  <details class="border border-base-300 rounded-lg bg-base-100 mt-4">
    <summary class="cursor-pointer px-4 py-3 font-bold text-sm bg-base-200 rounded-t-lg">
      Administrar cajeras visibles en el selector
    </summary>

    <div class="p-3">
      <p class="text-xs text-base-content/50 mb-3">
        Desde aquí puedes habilitar o inhabilitar qué cajeras aparecen en el buscador de asignación.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="border border-base-300 rounded-md overflow-hidden">
          <div class="px-3 py-2 bg-base-200 flex items-center justify-between font-bold text-sm">
            <span>Cajeras MTY</span>
            <span class="badge badge-primary badge-sm">{{ activasCount(cajerasMty) }}/{{ cajerasMty.length }}</span>
          </div>
          <div class="p-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            <div
              v-for="cajera in cajerasMty"
              :key="cajera.id"
              class="grid grid-cols-[1fr_auto] items-center gap-1.5 py-1 border-b border-base-200 min-h-9"
            >
              <div class="min-w-0">
                <div class="font-medium text-xs truncate">
                  {{ cajera.nombre }}
                  <span v-if="cajera.activa === false" class="ml-1 text-error text-[9px] font-bold">INACTIVA</span>
                </div>
                <div class="text-[9px] text-base-content/50 truncate">
                  {{ cajera.cajera_code }}
                  <span v-if="!cajera.row_ids || cajera.row_ids.length === 0"> · Sin BD</span>
                </div>
              </div>
              <button
                class="btn btn-xs"
                :class="cajera.activa !== false ? 'btn-success' : 'btn-error'"
                @click="emit('toggle-activa', cajera.id, cajera.activa !== false, cajera.nombre)"
              >
                {{ cajera.activa !== false ? 'Inhabilitar' : 'Habilitar' }}
              </button>
            </div>
          </div>
        </div>

        <div class="border border-base-300 rounded-md overflow-hidden">
          <div class="px-3 py-2 bg-base-200 flex items-center justify-between font-bold text-sm">
            <span>Cajeras CDMX</span>
            <span class="badge badge-primary badge-sm">{{ activasCount(cajerasCdmx) }}/{{ cajerasCdmx.length }}</span>
          </div>
          <div class="p-2">
            <div
              v-for="cajera in cajerasCdmx"
              :key="cajera.id"
              class="grid grid-cols-[1fr_auto] items-center gap-1.5 py-1 border-b border-base-200 min-h-9"
            >
              <div class="min-w-0">
                <div class="font-medium text-xs truncate">
                  {{ cajera.nombre }}
                  <span v-if="cajera.activa === false" class="ml-1 text-error text-[9px] font-bold">INACTIVA</span>
                </div>
                <div class="text-[9px] text-base-content/50 truncate">
                  {{ cajera.cajera_code }}
                  <span v-if="!cajera.row_ids || cajera.row_ids.length === 0"> · Sin BD</span>
                </div>
              </div>
              <button
                class="btn btn-xs"
                :class="cajera.activa !== false ? 'btn-success' : 'btn-error'"
                @click="emit('toggle-activa', cajera.id, cajera.activa !== false, cajera.nombre)"
              >
                {{ cajera.activa !== false ? 'Inhabilitar' : 'Habilitar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </details>
</template>
