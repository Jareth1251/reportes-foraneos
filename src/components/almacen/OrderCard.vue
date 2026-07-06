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
  <div :style="bucket === 'enviado'
    ? 'border:1px solid #ccc;border-radius:8px;padding:1rem;background-color:#fffde7;font-size:0.9rem;margin-bottom:1rem;position:relative;box-shadow:0 2px 4px rgba(0,0,0,0.1);'
    : 'background-color:#f9f9f9;border-radius:8px;padding:12px 16px;box-shadow:0 2px 5px rgba(0,0,0,0.15);font-size:0.9rem;margin-bottom:16px;position:relative;'">

    <!-- Header: turno + tiempo -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div :class="['turno-badge', pendiente ? 'pend' : '']" :style="`background-color:${badgeColor};color:${badgeTextColor};`">
        <span v-if="pendiente" class="pending-badge pending-blink">PENDIENTE</span>
        <span>Turno {{ turno }}</span>
      </div>
      <div style="color:#333;font-size:0.9rem;font-weight:bold;">⏱ {{ elapsed }}</div>
    </div>

    <!-- Datos del pedido -->
    <h3 style="font-weight:bold;font-size:1rem;margin:0 0 4px;">{{ order.customer_name || 'Sin cliente' }}</h3>
    <h3 style="color:#555;font-size:0.95rem;margin:0 0 8px;">{{ order.erp_order_id || 'Sin número' }}</h3>

    <div v-if="erpGroups(order).length" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">
      <span v-for="erp in erpGroups(order)" :key="erp" class="erp-badge">{{ erp }}</span>
    </div>

    <p style="margin:4px 0;"><b>Vendedor:</b> {{ order.sales_person || 'No asignado' }}</p>
    <p style="margin:4px 0;"><b>Paquetería:</b> {{ order.carrier || '—' }}</p>
    <p style="margin:4px 0;">📦 <b>Piezas:</b> {{ order.quantity_total || '—' }}</p>

    <!-- Surtidor badge (no se muestra en facturado) -->
    <div v-if="bucket !== 'facturado' && (order.surtidor_name || order.assigned_to_name)"
         style="margin-top:6px;display:inline-block;background:#E8F5E9;color:#1B5E20;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;">
      👷 {{ order.surtidor_name || order.assigned_to_name }}
    </div>

    <!-- Despachador (solo en surtido) -->
    <div v-if="bucket === 'surtido'" style="margin-top:6px;display:flex;align-items:center;gap:8px;">
      <span><b>Despachador:</b> {{ order.despachador_name || order.dispatcher_name || 'No asignado' }}</span>
    </div>

    <!-- Empacado por (empacando + enviado) -->
    <p v-if="bucket === 'empacando' || bucket === 'enviado'" style="margin:4px 0;">
      <b>Empacado por:</b> {{ order.packed_by_name || 'Sin agente' }}
    </p>

    <!-- Comentario -->
    <div v-if="order.advisor_comment?.trim()" class="comment-box">
      <strong>Comentario:</strong>
      <div class="comment-text">{{ order.advisor_comment }}</div>
    </div>

    <!-- Pago contra entrega -->
    <span v-if="Number(order.pay_on_delivery) && bucket !== 'facturado' && bucket !== 'surtido-despachador'"
          style="display:inline-block;margin-top:6px;background-color:#2E7D32;color:#fff;padding:6px 10px;border-radius:5px;font-weight:bold;">
      💵 Pago contra entrega
    </span>

    <!-- Botones -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">

      <!-- Acción primaria según bucket -->
      <button v-if="bucket === 'facturado'"
              @click="$emit('assign-surtidor', order)"
              style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#00796B;color:#fff;width:100%;">
        👷 Confirmar Surtidor
      </button>

      <button v-if="bucket === 'surtiendo'"
              :disabled="actionLoading"
              @click="$emit('mark-surtido', order)"
              style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#8E24AA;color:#fff;">
        <span v-if="actionLoading" class="loading loading-spinner loading-xs"></span>
        👷 Marcar SURTIDO
      </button>

      <button v-if="bucket === 'surtido-despachador'"
              @click="$emit('assign-despachador', order)"
              style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#8E24AA;color:#fff;">
        🚚 Confirmar Despachador
      </button>

      <button v-if="bucket === 'surtido'"
              @click="$emit('assign-empacador', order)"
              style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#8E24AA;color:#fff;">
        📦 Empacar
      </button>

      <button v-if="bucket === 'empacando'"
              :disabled="actionLoading"
              @click="$emit('enviar', order)"
              style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#00796B;color:#fff;">
        <span v-if="actionLoading" class="loading loading-spinner loading-xs"></span>
        🚚 Enviar
      </button>

      <button v-if="bucket === 'enviado'"
              :disabled="actionLoading"
              @click="$emit('deliver', order)"
              style="padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#388e3c;color:#fff;">
        <span v-if="actionLoading" class="loading loading-spinner loading-xs"></span>
        ✅ Entregado
      </button>

      <!-- Imprimir -->
      <button @click="$emit('print', order)"
              style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#1976d2;color:#fff;">
        🖨️ Imprimir
      </button>

      <!-- Guía -->
      <button @click="$emit('open-guia', order)"
              style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#455A64;color:#fff;">
        📋 {{ guiaLabel }}
      </button>

      <!-- Regresar a asesor -->
      <button @click="$emit('return', order)"
              style="padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#ff9800;color:#fff;">
        ↩️ Regresar a asesor
      </button>

    </div>
  </div>
</template>

<style scoped>
.turno-badge { padding: 6px 10px; border-radius: 14px; font-size: 1rem; font-weight: bold; display: inline-flex; align-items: center; gap: 6px; }
.turno-badge.pend { animation: pulse-bg 1.4s ease-in-out infinite; }
.pending-badge { background: #FFEBEE; color: #B71C1C; border: 1px solid #EF9A9A; border-radius: 6px; padding: 2px 6px; font-weight: 900; font-size: 11px; display: inline-flex; align-items: center; height: 20px; }
.pending-blink { animation: blink-pend 1.2s ease-in-out infinite; }
.erp-badge { background: #E3F2FD; color: #0D47A1; border: 1px solid #90CAF9; border-radius: 999px; padding: 2px 8px; font-size: 12px; line-height: 1.6; display: inline-flex; align-items: center; }
.comment-box { margin-top: 8px; background: #fff; border: 1px dashed #90caf9; border-radius: 8px; padding: 8px 10px; line-height: 1.3; font-size: 0.85rem; }
.comment-text { white-space: pre-wrap; margin-top: 4px; max-height: 80px; overflow-y: auto; word-break: break-word; }
@keyframes blink-pend { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes pulse-bg { 0% { filter: brightness(1); } 50% { filter: brightness(1.25); } 100% { filter: brightness(1); } }
</style>
