<script setup>
import { ref, computed } from 'vue'
import { buildCajeraOptions, SUCURSALES_ASIGNAR, SITIOS } from '@/utils/cajerasSucursalHelpers'

const props = defineProps({
  todasLasCajeras: { type: Array, default: () => [] },
})

const emit = defineEmits(['asignar'])

const searchText = ref('')
const showOptions = ref(false)
const cajeraSeleccionada = ref(null)
const sucursalSeleccionada = ref(null)
const sitioSeleccionado = ref(null)

const opciones = computed(() => buildCajeraOptions(props.todasLasCajeras, searchText.value))

function seleccionarCajera(opcion) {
  cajeraSeleccionada.value = opcion
  searchText.value = opcion.label
  showOptions.value = false
}

function onInputFocus() {
  showOptions.value = true
}

function onInputChange() {
  cajeraSeleccionada.value = null
  showOptions.value = true
}

function onAsignar() {
  emit('asignar', {
    cajera: cajeraSeleccionada.value,
    sucursal: sucursalSeleccionada.value,
    sitio: sitioSeleccionado.value,
  })
}
</script>

<template>
  <div class="bg-base-200 rounded-lg p-4 mb-6">
    <h3 class="font-bold text-sm mb-3">Asignar nueva cajera</h3>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <div class="flex flex-col gap-0.5 relative">
        <label class="text-xs font-bold">Cajera</label>
        <input
          type="text"
          class="input input-bordered input-sm w-full"
          placeholder="Buscar cajera..."
          v-model="searchText"
          @focus="onInputFocus"
          @input="onInputChange"
          @blur="() => setTimeout(() => (showOptions = false), 150)"
        />
        <ul
          v-if="showOptions && opciones.length > 0"
          class="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto bg-base-100 border border-base-300 rounded-md shadow-lg text-xs"
        >
          <li
            v-for="opcion in opciones"
            :key="opcion.value"
            class="px-3 py-2 hover:bg-base-200 cursor-pointer"
            @mousedown.prevent="seleccionarCajera(opcion)"
          >
            {{ opcion.label }}
          </li>
        </ul>
      </div>

      <div class="flex flex-col gap-0.5">
        <label class="text-xs font-bold">Sucursal</label>
        <select class="select select-bordered select-sm w-full" v-model="sucursalSeleccionada">
          <option :value="null">Seleccionar sucursal</option>
          <option v-for="suc in SUCURSALES_ASIGNAR" :key="suc.id" :value="suc">{{ suc.label }}</option>
        </select>
      </div>

      <div class="flex flex-col gap-0.5">
        <label class="text-xs font-bold">Sitio</label>
        <select class="select select-bordered select-sm w-full" v-model="sitioSeleccionado">
          <option :value="null">Seleccionar sitio</option>
          <option v-for="sitio in SITIOS" :key="sitio.id" :value="sitio">{{ sitio.label }}</option>
        </select>
      </div>

      <button class="btn btn-sm btn-primary" @click="onAsignar">Asignar</button>
    </div>
  </div>
</template>
