<script setup>
import { fmtDate, shortName, toInt, pillClass } from '@/utils/inventoryLookupHelpers'

const props = defineProps({
  open: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  breakdown: { type: Object, default: null },
})

const emit = defineEmits(['close'])
</script>

<template>
  <div
    class="flex-shrink-0 overflow-hidden border-base-300 flex flex-col bg-base-100 transition-[width] duration-200"
    :class="props.open ? 'w-[620px] border-l' : 'w-0'"
  >
    <div v-if="props.open" class="w-[620px] h-full flex flex-col overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-300 bg-base-200 flex-shrink-0">
        <div class="text-sm font-black">Desglose por ubicación</div>
        <button class="btn btn-xs" @click="emit('close')">✕ CERRAR</button>
      </div>

      <div v-if="props.loading" class="p-5 text-base-content/40 text-sm">Generando desglose…</div>
      <div v-else-if="props.error" class="p-3 text-red-800 bg-red-500/10 border-b border-red-500/25 font-bold text-sm">
        {{ props.error }}
      </div>
      <template v-else-if="props.breakdown">
        <div class="flex flex-wrap gap-3.5 px-4.5 py-3 border-b border-base-300 bg-base-200 text-[15px] flex-shrink-0">
          <span><span class="text-base-content/50 font-bold">Líneas: </span><b>{{ toInt(props.breakdown?.totals?.lines) }}</b></span>
          <span><span class="text-base-content/50 font-bold">Ubics.: </span><b>{{ toInt(props.breakdown?.totals?.locations) }}</b></span>
          <span><span class="text-base-content/50 font-bold">Contado: </span><b>{{ toInt(props.breakdown?.totals?.counted) }}</b></span>
          <span><span class="text-base-content/50 font-bold">QAD: </span><b>{{ toInt(props.breakdown?.totals?.system_stock) }}</b></span>
          <span>
            <span class="text-base-content/50 font-bold">Dif.: </span>
            <span class="badge" :class="pillClass(toInt(props.breakdown?.totals?.difference))">
              {{ toInt(props.breakdown?.totals?.difference) }}
            </span>
          </span>
        </div>
        <div class="px-4.5 pt-3 pb-1 text-xs font-black text-base-content/70 uppercase tracking-wide flex-shrink-0">
          Detalle de líneas
        </div>
        <div class="flex-1 overflow-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Ubicación</th>
                <th>Rack</th>
                <th class="text-right">Qty</th>
                <th>Agente</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(x, i) in (props.breakdown.lines || [])" :key="`${x.location}-${x.counted_at}-${i}`">
                <td>{{ x.location || '' }}</td>
                <td>{{ x.rack_code || '' }}</td>
                <td class="text-right font-bold">{{ toInt(x.qty) }}</td>
                <td>{{ shortName(x.counted_by_name) }}</td>
                <td>{{ fmtDate(x.counted_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>
