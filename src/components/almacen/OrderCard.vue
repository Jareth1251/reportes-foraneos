<script setup>
defineProps({
  order:         { type: Object,  required: true },
  bucket:        { type: String,  required: true },
  badgeColor:    { type: String,  default: '#00897B' },
  badgeTextColor:{ type: String,  default: '#fff'    },
  pendiente:     { type: Boolean, default: false },
  turno:         { type: [Number, String], default: '—' },
  elapsed:       { type: String,  default: '—' },
  actionLoading: { type: Boolean, default: false },
  guiaLabel:     { type: String,  default: 'Guía'   },
  readOnly:      { type: Boolean, default: false },
})

defineEmits([
  'assign-surtidor', 'mark-surtido',
  'assign-despachador', 'assign-empacador',
  'enviar', 'deliver', 'open-guia', 'return', 'print',
])

function erpGroups(order) {
  if (Array.isArray(order.erp_group_list) && order.erp_group_list.length) return order.erp_group_list
  return String(order.erp_group_csv ?? '').split(',').map(s => s.trim()).filter(Boolean)
}
</script>

<template>
  <div
    class="rounded-lg p-4 mb-4 relative text-sm shadow-md border"
    :class="bucket === 'enviado'
      ? 'bg-warning/10 border-warning/40'
      : 'bg-base-100 border-base-300'">

    <!-- Header: turno + tiempo -->
    <div class="flex justify-between items-center mb-2">
      <div :class="['turno-badge', pendiente ? 'pend' : '']" :style="`background-color:${badgeColor};color:${badgeTextColor};`">
        <span v-if="pendiente" class="pending-badge pending-blink">PENDIENTE</span>
        <span>Turno {{ turno }}</span>
      </div>
      <div class="text-base-content font-bold text-sm">⏱ {{ elapsed }}</div>
    </div>

    <!-- Datos del pedido -->
    <h3 class="font-bold text-base text-base-content m-0 mb-1">{{ order.customer_name || 'Sin cliente' }}</h3>
    <h3 class="text-base-content/70 text-sm m-0 mb-2">{{ order.erp_order_id || 'Sin número' }}</h3>

    <div v-if="erpGroups(order).length" class="flex flex-wrap gap-1 mb-1.5">
      <span v-for="erp in erpGroups(order)" :key="erp" class="erp-badge">{{ erp }}</span>
    </div>

    <p class="my-1 text-base-content"><b>Vendedor:</b> {{ order.sales_person || 'No asignado' }}</p>
    <p class="my-1 text-base-content"><b>Paquetería:</b> {{ order.carrier || '—' }}</p>
    <p class="my-1 text-base-content">📦 <b>Piezas:</b> {{ order.quantity_total || '—' }}</p>

    <!-- Surtidor badge -->
    <div v-if="bucket !== 'facturado' && (order.surtidor_name || order.assigned_to_name)"
         class="mt-1.5 inline-block bg-success/15 text-success rounded-xl px-2.5 py-0.5 text-xs font-semibold">
      👷 {{ order.surtidor_name || order.assigned_to_name }}
    </div>

    <!-- Despachador -->
    <div v-if="bucket === 'surtido'" class="mt-1.5 flex items-center gap-2 text-base-content">
      <span><b>Despachador:</b> {{ order.despachador_name || order.dispatcher_name || 'No asignado' }}</span>
    </div>

    <!-- Empacado por -->
    <p v-if="bucket === 'empacando' || bucket === 'enviado'" class="my-1 text-base-content">
      <b>Empacado por:</b> {{ order.packed_by_name || 'Sin agente' }}
    </p>

    <!-- Comentario -->
    <div v-if="order.advisor_comment?.trim()" class="comment-box">
      <strong>Comentario:</strong>
      <div class="comment-text">{{ order.advisor_comment }}</div>
    </div>

    <!-- Pago contra entrega -->
    <span v-if="Number(order.pay_on_delivery) && bucket !== 'facturado' && bucket !== 'surtido-despachador'"
          class="inline-block mt-1.5 bg-success text-success-content px-2.5 py-1.5 rounded font-bold">
      💵 Pago contra entrega
    </span>

    <!-- Botones -->
    <div class="flex flex-wrap gap-2 mt-3">

      <button v-if="!readOnly && bucket === 'facturado'"
              @click="$emit('assign-surtidor', order)"
              class="btn btn-sm w-full border-none text-white"
              style="background-color:#00796B;">
        👷 Confirmar Surtidor
      </button>

      <button v-if="!readOnly && bucket === 'surtiendo'"
              :disabled="actionLoading"
              @click="$emit('mark-surtido', order)"
              class="btn btn-sm border-none text-white"
              style="background-color:#8E24AA;">
        <span v-if="actionLoading" class="loading loading-spinner loading-xs"></span>
        👷 Marcar SURTIDO
      </button>

      <button v-if="!readOnly && bucket === 'surtido-despachador'"
              @click="$emit('assign-despachador', order)"
              class="btn btn-sm border-none text-white"
              style="background-color:#8E24AA;">
        🚚 Confirmar Despachador
      </button>

      <button v-if="!readOnly && bucket === 'surtido'"
              @click="$emit('assign-empacador', order)"
              class="btn btn-sm border-none text-white"
              style="background-color:#8E24AA;">
        📦 Empacar
      </button>

      <button v-if="!readOnly && bucket === 'empacando'"
              :disabled="actionLoading"
              @click="$emit('enviar', order)"
              class="btn btn-sm border-none text-white"
              style="background-color:#00796B;">
        <span v-if="actionLoading" class="loading loading-spinner loading-xs"></span>
        🚚 Enviar
      </button>

      <button v-if="!readOnly && bucket === 'enviado'"
              :disabled="actionLoading"
              @click="$emit('deliver', order)"
              class="btn btn-sm border-none text-white"
              style="background-color:#388e3c;">
        <span v-if="actionLoading" class="loading loading-spinner loading-xs"></span>
        ✅ Entregado
      </button>

      <button @click="$emit('print', order)"
              class="btn btn-sm border-none text-white"
              style="background-color:#1976d2;">
        🖨️ Imprimir
      </button>

      <button @click="$emit('open-guia', order)"
              class="btn btn-sm border-none text-white"
              style="background-color:#455A64;">
        📋 {{ guiaLabel }}
      </button>

      <button v-if="!readOnly" @click="$emit('return', order)"
              class="btn btn-sm border-none text-white"
              style="background-color:#ff9800;">
        ↩️ Regresar a asesor
      </button>

    </div>
  </div>
</template>

<style scoped>
.turno-badge {
  padding: 6px 10px;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: bold;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.turno-badge.pend { animation: pulse-bg 1.4s ease-in-out infinite; }

.pending-badge {
  background: #FFEBEE;
  color: #B71C1C;
  border: 1px solid #EF9A9A;
  border-radius: 6px;
  padding: 2px 6px;
  font-weight: 900;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  height: 20px;
}
.pending-blink { animation: blink-pend 1.2s ease-in-out infinite; }

.erp-badge {
  background: rgba(13, 71, 161, 0.15);
  color: #90CAF9;
  border: 1px solid rgba(144, 202, 249, 0.4);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 1.6;
  display: inline-flex;
  align-items: center;
}

/* Modo claro: forzamos colores legibles */
html[data-theme='light'] .erp-badge {
  background: #E3F2FD;
  color: #0D47A1;
  border-color: #90CAF9;
}

.comment-box {
  margin-top: 8px;
  background: var(--fallback-b1, oklch(var(--b1, 1) / 1));
  border: 1px dashed rgba(144, 202, 249, 0.6);
  border-radius: 8px;
  padding: 8px 10px;
  line-height: 1.3;
  font-size: 0.85rem;
  color: var(--fallback-bc, oklch(var(--bc, 0.2) / 1));
}
.comment-text {
  white-space: pre-wrap;
  margin-top: 4px;
  max-height: 80px;
  overflow-y: auto;
  word-break: break-word;
}

@keyframes blink-pend {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes pulse-bg {
  0%   { filter: brightness(1); }
  50%  { filter: brightness(1.25); }
  100% { filter: brightness(1); }
}
</style>