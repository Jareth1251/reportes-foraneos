<script setup>
defineProps({
  dateStart: { type: String, required: true },
  dateEnd: { type: String, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:dateStart', 'update:dateEnd', 'shift', 'refresh'])
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <button class="btn btn-sm btn-ghost px-2" @click="emit('shift', -1)" title="Día anterior">◄</button>
    <div class="flex flex-col gap-0.5">
      <label class="text-[10px] text-base-content/50 leading-none">Fecha Inicio</label>
      <input
        type="date"
        :value="dateStart"
        class="input input-bordered input-sm w-36"
        @change="emit('update:dateStart', $event.target.value)"
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <label class="text-[10px] text-base-content/50 leading-none">Fecha Fin</label>
      <input
        type="date"
        :value="dateEnd"
        class="input input-bordered input-sm w-36"
        @change="emit('update:dateEnd', $event.target.value)"
      />
    </div>
    <button class="btn btn-sm btn-ghost px-2" @click="emit('shift', 1)" title="Día siguiente">►</button>

    <slot />

    <button class="btn btn-sm btn-primary" :class="{ loading }" @click="emit('refresh')">
      <span v-if="!loading">↻ Actualizar</span>
      <span v-else>Cargando...</span>
    </button>

    <slot name="actions" />
  </div>
</template>
