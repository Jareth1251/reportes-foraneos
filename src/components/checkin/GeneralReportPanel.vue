<script setup>
defineProps({
  totals: { type: Object, required: true },
  totalsLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['refresh'])
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-bold text-xl">Turnos en espera</h2>
      <button class="btn btn-xs btn-primary" :class="{ loading: totalsLoading }" @click="emit('refresh')">
        <span v-if="!totalsLoading">↻ Actualizar Ahora</span>
        <span v-else>Cargando...</span>
      </button>
    </div>

    <div v-if="totalsLoading && !Object.keys(totals).length" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>

    <div v-else-if="!Object.keys(totals).length" class="text-center text-base-content/40 py-16">
      No hay turnos en espera.
    </div>

    <div v-else class="flex flex-col gap-6">
      <div v-for="(group, dept) in totals" :key="dept">
        <h3 class="font-bold text-lg mb-2">{{ dept }}</h3>
        <div class="flex flex-wrap gap-3">
          <div
            v-for="(row, idx) in group.statuses"
            :key="dept + '_' + idx"
            class="rounded-lg px-4 py-3 shadow text-sm font-semibold min-w-48"
            :style="`background:${row.bgcolor_status || '#eee'};`"
          >
            Turnos {{ row.label }} en espera: {{ row.qty }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
