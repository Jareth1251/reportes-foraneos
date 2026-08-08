<script setup>
const props = defineProps({
  selectedWeek: { type: Object, default: null },
  selectedMonth: { type: Object, default: null },
  selectedTerritory: { type: Object, default: null },
  dateSelectDraft: { type: Date, default: null },
  dateEndSelectDraft: { type: Date, default: null },
  salesFilterType: { type: String, default: 'salesAmount' },
  weekOptions: { type: Array, default: () => [] },
  monthOptions: { type: Array, default: () => [] },
  territoryOptions: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits([
  'week-change',
  'month-change',
  'territory-change',
  'date-start-change',
  'date-end-change',
  'search',
  'filter-type-change',
])

function toYMD(date) {
  if (!(date instanceof Date) || isNaN(date)) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function onWeekChange(value) {
  if (!value) { emit('week-change', null); return }
  const opt = props.weekOptions.find((w) => String(w.value) === String(value))
  emit('week-change', opt || null)
}

function onMonthChange(value) {
  if (!value) { emit('month-change', null); return }
  const opt = props.monthOptions.find((m) => m.value === value)
  emit('month-change', opt || null)
}

function onTerritoryChange(value) {
  if (!value) { emit('territory-change', null); return }
  const opt = props.territoryOptions.find((t) => t.value === value)
  emit('territory-change', opt || null)
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-4">
    <div class="flex flex-col gap-0.5">
      <label class="text-xs font-bold">Selecciona una semana</label>
      <select
        class="select select-bordered select-sm w-40"
        :value="selectedWeek?.value ?? ''"
        @change="onWeekChange($event.target.value)"
      >
        <option value="">—</option>
        <option v-for="w in weekOptions" :key="w.value" :value="w.value">{{ w.label }}</option>
      </select>
    </div>

    <div class="flex flex-col gap-0.5">
      <label class="text-xs font-bold">Selecciona un mes</label>
      <select
        class="select select-bordered select-sm w-40"
        :value="selectedMonth?.value ?? ''"
        @change="onMonthChange($event.target.value)"
      >
        <option value="">—</option>
        <option v-for="m in monthOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
    </div>

    <div class="flex flex-col gap-0.5">
      <label class="text-xs font-bold">Fecha Inicio</label>
      <input
        type="date"
        class="input input-bordered input-sm w-36"
        :value="toYMD(dateSelectDraft)"
        @change="emit('date-start-change', $event.target.value)"
      />
    </div>

    <div class="flex flex-col gap-0.5">
      <label class="text-xs font-bold">Fecha Fin</label>
      <input
        type="date"
        class="input input-bordered input-sm w-36"
        :value="toYMD(dateEndSelectDraft)"
        @change="emit('date-end-change', $event.target.value)"
      />
    </div>

    <button class="btn btn-sm btn-primary" :disabled="loading" @click="emit('search')">Buscar</button>

    <div class="flex flex-col gap-0.5">
      <label class="text-xs font-bold">Territorio</label>
      <select
        class="select select-bordered select-sm w-48"
        :value="selectedTerritory?.value ?? ''"
        @change="onTerritoryChange($event.target.value)"
      >
        <option value="">Todos</option>
        <option v-for="t in territoryOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
    </div>

    <div class="flex flex-col gap-0.5">
      <label class="text-xs font-bold">Mostrar por</label>
      <div class="flex gap-2">
        <button
          class="btn btn-sm"
          :class="salesFilterType === 'salesAmount' ? 'btn-primary' : 'btn-outline'"
          @click="emit('filter-type-change', 'salesAmount')"
        >Pesos</button>
        <button
          class="btn btn-sm"
          :class="salesFilterType === 'salesQuantity' ? 'btn-primary' : 'btn-outline'"
          @click="emit('filter-type-change', 'salesQuantity')"
        >Piezas</button>
      </div>
    </div>
  </div>
</template>
