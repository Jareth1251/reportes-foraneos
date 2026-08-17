<script setup>
import { computed } from 'vue'
import { toInt, rowKey, pillClass } from '@/utils/inventoryLookupHelpers'

const props = defineProps({
  visibleRows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  isAdminUser: { type: Boolean, default: false },
  canSendQad: { type: Boolean, default: false },
  canSeeResults: { type: Boolean, default: true },
  selected: { type: Map, required: true },
  selectedKey: { type: String, default: '' },
  stockByPid: { type: Object, default: () => ({}) },
  committedByPid: { type: Object, default: () => ({}) },
  shippedByPid: { type: Object, default: () => ({}) },
  doneValidations: { type: Set, required: true },
  sendingErp: { type: [String, null], default: null },
  deletingRow: { type: [String, null], default: null },
  requestingRow: { type: [String, null], default: null },
  eligibleCount: { type: Number, default: 0 },
  sendingAll: { type: Boolean, default: false },
  allVisibleSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle-select', 'toggle-select-all', 'row-click', 'send-erp', 'delete-row', 'request-recount', 'send-all'])

const tableRows = computed(() => props.visibleRows.map((r, idx) => {
  const counted = toInt(r.counted_qty)
  const pid = String(r.product_id || '').trim()
  const hasQad = pid && Object.prototype.hasOwnProperty.call(props.stockByPid, pid)
  const qadQty = hasQad ? toInt(props.stockByPid[pid]) : 0
  const committed = pid && props.committedByPid[pid] != null ? toInt(props.committedByPid[pid]) : 0
  const shipped = pid && props.shippedByPid[pid] != null ? toInt(props.shippedByPid[pid]) : 0
  const diff = hasQad ? counted - qadQty - committed - shipped : null
  const doneKey = `${pid.toUpperCase()}|${(r.color_label || '').toUpperCase()}|${(r.size_label || '').toUpperCase()}`
  const key = rowKey(r, idx)
  return {
    r, idx, counted, pid, hasQad, qadQty, committed, shipped, diff,
    isRecontado: props.doneValidations.has(doneKey),
    key,
    isActive: props.selectedKey === key,
    isChecked: props.selected.has(key),
  }
}))
</script>

<template>
  <div class="flex-1 overflow-auto">
    <table class="table table-sm table-pin-rows">
      <thead>
        <tr>
          <th class="w-8 text-center">
            <input
              type="checkbox"
              class="checkbox checkbox-xs"
              :checked="props.allVisibleSelected"
              :disabled="!props.visibleRows.length"
              title="Seleccionar todos los visibles"
              @change="emit('toggle-select-all')"
            />
          </th>
          <th>product_id</th>
          <th>article</th>
          <th>Marca</th>
          <th>Color</th>
          <th>Talla</th>
          <th class="text-right">Contado</th>
          <th class="text-right">QAD</th>
          <th v-if="props.isAdminUser" class="text-right" title="Piezas remisionadas (shipQty GMP)">Remisionados</th>
          <th v-if="props.isAdminUser" class="text-right" title="Piezas en pedidos facturados pendientes de surtir">Comprometido</th>
          <th class="text-right" title="Contado − (QAD + Comprometido + Remisionados)">Diferencia</th>
          <th class="text-center">
            <button
              v-if="props.eligibleCount > 0 && props.canSendQad"
              type="button"
              class="btn btn-xs btn-success"
              :disabled="props.sendingAll"
              title="Enviar todos los artículos con datos QAD (uno por uno)"
              @click="emit('send-all')"
            >
              {{ props.sendingAll ? 'Enviando…' : '📤 Enviar todos' }}
            </button>
            <span v-else class="text-xs text-base-content/40">
              {{ !props.canSendQad ? 'Sin permiso' : 'Sin datos QAD' }}
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!props.canSeeResults && props.visibleRows.length > 0">
          <td :colspan="props.isAdminUser ? 12 : 10" class="text-center py-5 font-bold text-amber-700">
            ⏳ Los conteos están pendientes de validación por el administrador de almacén.
          </td>
        </tr>
        <tr v-else-if="!props.visibleRows.length">
          <td :colspan="props.isAdminUser ? 12 : 10" class="text-center text-base-content/40 py-5">
            {{ props.loading ? 'Consultando…' : 'Sin datos. Selecciona una marca y da clic en Buscar.' }}
          </td>
        </tr>
        <tr
          v-for="row in tableRows"
          v-else
          :key="row.key"
          class="cursor-pointer hover"
          :class="{ 'bg-primary/10': row.isActive, 'bg-info/10': row.isChecked }"
          title="Click para ver desglose por ubicación"
          @click="emit('row-click', row.r, row.idx)"
        >
          <td class="text-center" @click.stop>
            <input
              type="checkbox"
              class="checkbox checkbox-xs"
              :checked="row.isChecked"
              @change="emit('toggle-select', row.r, row.idx)"
            />
          </td>
          <td>
            {{ row.r.product_id || '' }}
            <span
              v-if="row.isRecontado"
              class="badge badge-success badge-xs ml-1"
              title="Este artículo fue recontado recientemente"
            >✓ Recontado</span>
          </td>
          <td>{{ row.r.article || '' }}</td>
          <td>{{ row.r.brand_name || '' }}</td>
          <td>{{ row.r.color_label || '' }}</td>
          <td>{{ row.r.size_label || '' }}</td>
          <td class="text-right font-bold">{{ row.counted }}</td>
          <td class="text-right font-bold">
            <span v-if="row.hasQad">{{ row.qadQty }}</span>
            <span v-else class="text-base-content/40">—</span>
          </td>
          <td v-if="props.isAdminUser" class="text-right font-bold">
            <span v-if="row.hasQad && row.shipped > 0" class="text-violet-600">{{ row.shipped }}</span>
            <span v-else class="text-base-content/40">—</span>
          </td>
          <td v-if="props.isAdminUser" class="text-right font-bold">
            <span v-if="row.hasQad && row.committed > 0" class="badge badge-error" title="Piezas comprometidas en pedidos facturados sin surtir">{{ row.committed }}</span>
            <span v-else class="text-base-content/40">—</span>
          </td>
          <td class="text-right font-bold">
            <span v-if="row.hasQad" class="badge" :class="pillClass(row.diff)">{{ row.diff }}</span>
            <span v-else class="text-base-content/40">—</span>
          </td>
          <td @click.stop>
            <div class="flex gap-1 items-center">
              <button
                type="button"
                class="btn btn-xs"
                :class="row.hasQad && props.canSendQad ? 'btn-success' : 'btn-disabled'"
                :disabled="!!props.sendingErp || !row.hasQad || !props.canSendQad"
                :title="!props.canSendQad ? 'Pendiente de validación' : row.hasQad ? 'Enviar conteo a QAD' : 'Carga QAD primero'"
                @click="emit('send-erp', row.r)"
              >
                {{ props.sendingErp === row.pid ? 'Enviando…' : '→ QAD' }}
              </button>

              <button
                v-if="props.isAdminUser"
                type="button"
                class="btn btn-xs btn-error btn-outline"
                :disabled="props.deletingRow === row.pid"
                title="Borrar conteo de este artículo"
                @click="emit('delete-row', row.r)"
              >
                {{ props.deletingRow === row.pid ? '…' : '🗑' }}
              </button>

              <button
                v-if="props.isAdminUser"
                type="button"
                class="btn btn-xs btn-info btn-outline"
                :disabled="props.requestingRow === row.pid"
                title="Solicitar que jdomingu vuelva a contar este artículo"
                @click="emit('request-recount', row.r)"
              >
                {{ props.requestingRow === row.pid ? '…' : '🔁' }}
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
