<script setup>
import { computed } from 'vue'
import { fmtDate, fmtMoney, histAmount, shortName, toInt } from '@/utils/inventoryLookupHelpers'

const props = defineProps({
  site: { type: String, required: true },
  histDate: { type: String, required: true },
  histRows: { type: Array, default: () => [] },
  histLoading: { type: Boolean, default: false },
  histError: { type: String, default: '' },
})

const emit = defineEmits(['update:site', 'update:hist-date', 'refresh', 'export'])

const totals = computed(() => {
  let rct = 0
  let iss = 0
  let missingCost = 0
  for (const h of props.histRows) {
    const amount = histAmount(h)
    if (amount == null) { if (toInt(h.difference)) missingCost++; continue }
    if (amount > 0) rct += amount
    else iss -= amount
  }
  return { rct, iss, net: rct - iss, missingCost }
})

const diffBadge = (d) => (d < 0 ? 'badge-error badge-outline' : d > 0 ? 'badge-success badge-outline' : 'badge-ghost')
const movementLabel = (d) => (d < 0 ? 'Salida' : d > 0 ? 'Entrada' : 'Sin diferencia')
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <div class="flex items-end gap-3 px-4 py-2.5 bg-base-200 border-b border-base-300 flex-shrink-0">
      <div>
        <label class="block text-xs font-black text-base-content/60 mb-1.5">Sucursal</label>
        <select
          class="select select-sm w-40"
          :value="props.site"
          @change="emit('update:site', $event.target.value)"
        >
          <option value="3000">MTY (3000)</option>
          <option value="3100">CDMX (3100)</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-black text-base-content/60 mb-1.5">Fecha</label>
        <input
          type="date"
          class="input input-sm"
          :value="props.histDate"
          @change="emit('update:hist-date', $event.target.value)"
        />
      </div>
      <button class="btn btn-sm btn-primary" :disabled="props.histLoading" @click="emit('refresh')">
        {{ props.histLoading ? 'CARGANDO…' : 'ACTUALIZAR' }}
      </button>
      <button class="btn btn-sm btn-success" :disabled="!props.histRows.length" @click="emit('export')">
        ↓ Excel
      </button>
      <span class="text-xs text-base-content/50">{{ props.histRows.length }} registros</span>
      <div v-if="props.histRows.length" class="ml-auto flex items-center gap-2 text-sm">
        <span class="badge badge-success badge-outline font-bold">Entradas {{ fmtMoney(totals.rct) }}</span>
        <span class="badge badge-error badge-outline font-bold">Salidas {{ fmtMoney(totals.iss) }}</span>
        <span class="badge font-bold" :class="totals.net < 0 ? 'badge-error' : totals.net > 0 ? 'badge-success' : 'badge-ghost'">
          Neto {{ fmtMoney(Math.abs(totals.net)) }}
        </span>
        <span v-if="totals.missingCost" class="text-xs text-base-content/50">{{ totals.missingCost }} sin costo</span>
      </div>
    </div>

    <div v-if="props.histError" class="px-4 py-2 bg-red-500/10 border-b border-red-500/25 text-red-800 font-bold text-sm">
      {{ props.histError }}
    </div>

    <div class="flex-1 overflow-auto p-2">
      <table class="table table-sm table-pin-rows">
        <thead>
          <tr>
            <th>Hora</th>
            <th>product_id</th>
            <th>Artículo</th>
            <th>Marca</th>
            <th>Color</th>
            <th>Talla</th>
            <th class="text-right">Contado</th>
            <th class="text-right">QAD antes</th>
            <th class="text-right">Diferencia</th>
            <th class="text-right">QAD final</th>
            <th class="text-right">Costo u.</th>
            <th class="text-right">Monto</th>
            <th>Usuario</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!props.histRows.length">
            <td colspan="14" class="text-center text-base-content/40 py-5">
              {{ props.histLoading ? 'Cargando…' : 'Sin registros para esta fecha.' }}
            </td>
          </tr>
          <tr v-for="h in props.histRows" v-else :key="h.id">
            <td class="whitespace-nowrap">{{ fmtDate(h.sent_at) }}</td>
            <td>{{ h.product_id }}</td>
            <td>{{ h.article || '—' }}</td>
            <td>{{ h.brand_name || '—' }}</td>
            <td>{{ h.color_label || '—' }}</td>
            <td>{{ h.size_label || '—' }}</td>
            <td class="text-right font-bold">{{ toInt(h.counted_qty) }}</td>
            <td class="text-right">
              <span v-if="h.qad_qty != null">{{ toInt(h.qad_qty) }}</span>
              <span v-else class="text-base-content/40">—</span>
            </td>
            <td class="text-right">
              <span
                v-if="h.difference != null"
                class="badge"
                :class="diffBadge(toInt(h.difference))"
                :title="movementLabel(toInt(h.difference))"
              >{{ Math.abs(toInt(h.difference)) }}</span>
              <span v-else class="text-base-content/40">—</span>
            </td>
            <td class="text-right">
              <span v-if="String(h.api_status || '').toUpperCase() === 'OK'" class="badge badge-success">{{ toInt(h.counted_qty) }}</span>
              <span v-else class="text-base-content/40">—</span>
            </td>
            <td class="text-right whitespace-nowrap">
              <span v-if="h.unit_cost != null">{{ fmtMoney(h.unit_cost) }}</span>
              <span v-else class="text-base-content/40">—</span>
            </td>
            <td class="text-right whitespace-nowrap">
              <span v-if="histAmount(h) != null" class="badge" :class="diffBadge(toInt(h.difference))">{{ fmtMoney(Math.abs(histAmount(h))) }}</span>
              <span v-else class="text-base-content/40">—</span>
            </td>
            <td>{{ shortName(h.user_name) || h.user_id || '—' }}</td>
            <td>
              <span class="badge badge-sm" :class="String(h.api_status || '').toUpperCase() === 'OK' ? 'badge-success' : 'badge-error'">
                {{ String(h.api_status || '').toUpperCase() === 'OK' ? 'OK' : (h.api_desc || h.api_status || 'ERROR') }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
