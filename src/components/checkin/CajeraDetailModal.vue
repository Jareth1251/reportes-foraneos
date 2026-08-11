<script setup>
import { computed } from 'vue'
import { collapseConsolidatedPedidos } from '@/utils/pedidos'
import { checkinInvoicedAt } from '@/utils/checkins'

const props = defineProps({
  open: { type: Boolean, default: false },
  cajera: { type: String, default: '' },
  checkinRows: { type: Array, default: () => [] },
  foraneoRows: { type: Array, default: () => [] },
})

defineEmits(['close'])

function fmtDateTime(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  if (isNaN(d)) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Un turno puede traer varios pedidos (erp_order_grouped separado por comas);
// se expande a una fila por pedido para que cuadre con el conteo de la tabla.
const expandedCheckins = computed(() => {
  const out = []
  for (const r of props.checkinRows) {
    const pedidos = String(r.erp_order_grouped || r.erp_order_id || '')
      .split(',').map(s => s.trim()).filter(Boolean)
    for (const pedido of (pedidos.length ? pedidos : ['—'])) {
      out.push({ ...r, pedido })
    }
  }
  return out
})

const paginaCount = computed(() => expandedCheckins.value.filter(r => r.is_web_order).length)
const checkinCount = computed(() => expandedCheckins.value.length - paginaCount.value)

// Un turno foráneo puede traer varios pedidos consolidados (remote_order_groups);
// se expande a una fila por pedido, colapsando los que ya quedaron fusionados
// en un PC, para que cuadre con el conteo del reporte.
//
// Los pedidos "CLIENTE" (pasa cliente) nacen en remote_orders y luego generan
// también un turno "agendado" en checkins cuando el cliente llega a recogerlos
// -- el mismo pedido termina en checkinRows Y en foraneoRows. useCajerasReport.js
// ya los deduplica para el conteo (un pedido de checkins nunca se cuenta también
// como foráneo); aquí se filtra lo mismo para que tampoco aparezcan duplicados
// en la tabla, aunque ya no se estén contando dos veces.
const expandedForaneos = computed(() => {
  const checkinPedidos = new Set(expandedCheckins.value.map(r => r.pedido))
  const out = []
  for (const o of props.foraneoRows) {
    const allPedidos = collapseConsolidatedPedidos([o.erp_order_id, ...(o.erp_group_list || [])])
    const pedidos = allPedidos.length
      ? allPedidos.filter(pedido => !checkinPedidos.has(pedido))
      : ['—']
    for (const pedido of pedidos) {
      out.push({ ...o, pedido })
    }
  }
  return out
})
</script>

<template>
  <dialog :open="open" class="modal modal-bottom sm:modal-middle">
    <div v-if="open" class="modal-box max-w-4xl">
      <h3 class="font-bold text-lg mb-1">{{ cajera }}</h3>
      <p class="text-sm text-base-content/60 mb-4">
        {{ expandedCheckins.length }} pedido(s) en {{ checkinRows.length }} turno(s)
        ({{ checkinCount }} checkin, {{ paginaCount }} página) · {{ expandedForaneos.length }} foráneo(s) en {{ foraneoRows.length }} turno(s)
      </p>

      <h4 class="font-semibold text-sm mb-2">Checkins Facturados</h4>
      <div class="overflow-x-auto mb-6">
        <table class="table table-xs">
          <thead>
            <tr class="bg-base-200">
              <th>Turno</th>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Origen</th>
              <th>Facturado</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="expandedCheckins.length === 0">
              <td colspan="6" class="text-center text-base-content/40">Sin checkins.</td>
            </tr>
            <tr v-for="(r, i) in expandedCheckins" :key="`${r.id}-${i}`">
              <td>{{ r.turn }}</td>
              <td>{{ r.pedido }}</td>
              <td>{{ r.name || '—' }}</td>
              <td>
                <span class="badge badge-sm" :class="r.is_web_order ? 'badge-info' : 'badge-ghost'">
                  {{ r.is_web_order ? 'Página' : 'Checkin' }}
                </span>
              </td>
              <td>{{ fmtDateTime(checkinInvoicedAt(r)) }}</td>
              <td>{{ r.status_label || r.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h4 class="font-semibold text-sm mb-2">Foráneos Facturados</h4>
      <div class="overflow-x-auto">
        <table class="table table-xs">
          <thead>
            <tr class="bg-base-200">
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Paquetería</th>
              <th>Facturado</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="expandedForaneos.length === 0">
              <td colspan="5" class="text-center text-base-content/40">Sin foráneos.</td>
            </tr>
            <tr v-for="(o, i) in expandedForaneos" :key="`${o.id}-${i}`">
              <td>{{ o.pedido }}</td>
              <td>{{ o.customer_name || '—' }}</td>
              <td>{{ o.carrier || '—' }}</td>
              <td>{{ fmtDateTime(o.facturado_at) }}</td>
              <td>{{ o.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modal-action">
        <button class="btn btn-sm" @click="$emit('close')">Cerrar</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button @click="$emit('close')">cerrar</button></form>
  </dialog>
</template>
