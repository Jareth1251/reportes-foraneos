<script setup>
import { shortName, fmtDate, toInt } from '@/utils/inventoryLookupHelpers'

const props = defineProps({
  pendingRecounts: { type: Array, default: () => [] },
  pendingLoading: { type: Boolean, default: false },
  expandedValId: { type: [Number, String, null], default: null },
})

const emit = defineEmits(['refresh', 'toggle-expand', 'mark-done'])
</script>

<template>
  <div
    class="rounded-lg border p-3 mb-3"
    :class="props.pendingRecounts.length > 0 ? 'bg-amber-50 border-amber-300' : 'bg-base-100 border-base-300'"
  >
    <div class="flex items-center justify-between">
      <span class="font-extrabold text-sm" :class="props.pendingRecounts.length > 0 ? 'text-amber-800' : 'text-base-content/50'">
        🔁 Artículos pendientes de reconteo
        <span
          class="badge badge-sm ml-1"
          :class="props.pendingRecounts.length > 0 ? 'badge-warning' : 'badge-ghost'"
        >{{ props.pendingLoading ? '…' : props.pendingRecounts.length }}</span>
      </span>
      <button type="button" class="btn btn-xs" @click="emit('refresh')">Actualizar</button>
    </div>

    <div v-if="props.pendingRecounts.length > 0" class="flex flex-col gap-2 mt-3">
      <div
        v-for="v in props.pendingRecounts"
        :key="v.id"
        class="bg-base-100 border border-amber-200 rounded-md px-3.5 py-2.5"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="text-sm leading-relaxed">
            <b>{{ v.product_id }}</b><span v-if="v.article"> · {{ v.article }}</span>
            <span v-if="v.brand_name" class="text-base-content/50 text-xs ml-1.5">{{ v.brand_name }}</span>
            <br />
            <span class="text-base-content/70">{{ v.color_label || '—' }} · {{ v.size_label || '—' }}</span>
            <br />
            <span class="text-xs text-base-content/40">
              Solicitado por <b class="text-base-content/60">{{ v.requested_by_name || v.requested_by }}</b> · {{ fmtDate(v.requested_at) }}
            </span>
          </div>
          <div class="flex gap-1.5 flex-shrink-0">
            <button type="button" class="btn btn-xs" @click="emit('toggle-expand', v.id)">
              {{ props.expandedValId === v.id ? 'Ocultar' : 'Ver dónde se contó' }}
            </button>
            <button type="button" class="btn btn-xs btn-success" @click="emit('mark-done', v)">
              ✏️ Editar / Confirmar
            </button>
          </div>
        </div>

        <div v-if="props.expandedValId === v.id" class="mt-2.5">
          <div v-if="!v.breakdown.length" class="text-xs text-base-content/40">Sin registros de conteo actuales.</div>
          <table v-else class="table table-xs">
            <thead>
              <tr>
                <th>Ubicación</th>
                <th class="text-right">Qty</th>
                <th>Contó</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(b, i) in v.breakdown" :key="i">
                <td>{{ b.location || '—' }}</td>
                <td class="text-right font-bold">{{ toInt(b.qty) }}</td>
                <td>{{ shortName(b.counted_by_name) }}</td>
                <td class="whitespace-nowrap">{{ fmtDate(b.counted_at) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="font-extrabold">
                <td class="text-base-content/60">Total</td>
                <td class="text-right">{{ v.breakdown.reduce((a, b) => a + toInt(b.qty), 0) }}</td>
                <td colspan="2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
    <div v-else-if="!props.pendingLoading" class="text-xs text-base-content/40 mt-1.5">
      Sin solicitudes de reconteo pendientes.
    </div>
  </div>
</template>
