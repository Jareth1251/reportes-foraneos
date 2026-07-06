<script setup>
defineProps({
  open:         { type: Boolean, default: false },
  order:        { type: Object,  default: null  },
  title:        { type: String,  default: ''    },
  subtitle:     { type: String,  default: ''    },
  icon:         { type: String,  default: '✓'   },
  confirmIcon:  { type: String,  default: '✓'   },
  gradient:     { type: String,  default: 'linear-gradient(135deg,#455A64,#263238)' },
  infoBg:       { type: String,  default: '#F5F5F5' },
  infoBorder:   { type: String,  default: '#E0E0E0' },
  infoAccent:   { type: String,  default: '#333'    },
  showCarrier:  { type: Boolean, default: true  },
  confirmLabel: { type: String,  default: 'Confirmar' },
  loading:      { type: Boolean, default: false },
})

defineEmits(['close', 'confirm'])
</script>

<template>
  <dialog :open="open" class="modal modal-bottom sm:modal-middle">
    <div v-if="open && order" class="modal-box p-0 overflow-hidden" style="max-width:420px;border-radius:16px;">
      <div :style="`background:${gradient};padding:24px 24px 20px;text-align:center;`">
        <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:26px;">{{ icon }}</div>
        <h3 style="color:#fff;font-size:1.1rem;font-weight:700;margin:0;">{{ title }}</h3>
        <p style="color:rgba(255,255,255,0.75);font-size:0.8rem;margin:4px 0 0;">{{ subtitle }}</p>
      </div>
      <div style="padding:20px 24px;">
        <div :style="`background:${infoBg};border:1px solid ${infoBorder};border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;margin-bottom:14px;`">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.78rem;color:#555;">Pedido</span>
            <span :style="`font-weight:700;color:${infoAccent};font-size:0.95rem;`">{{ order.erp_order_id }}</span>
          </div>
          <div :style="`border-top:1px solid ${infoBorder};margin:2px 0;`"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.78rem;color:#555;">Cliente</span>
            <span style="font-weight:600;color:#222;font-size:0.88rem;text-align:right;max-width:220px;">{{ order.customer_name }}</span>
          </div>
          <template v-if="showCarrier && order.carrier">
            <div :style="`border-top:1px solid ${infoBorder};margin:2px 0;`"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.78rem;color:#555;">Paquetería</span>
              <span style="font-size:0.85rem;color:#333;">{{ order.carrier }}</span>
            </div>
          </template>
        </div>
        <slot />
      </div>
      <div style="padding:0 24px 20px;display:flex;gap:10px;">
        <button @click="$emit('close')"
                style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:0.88rem;color:#555;font-weight:600;">
          Cancelar
        </button>
        <button :disabled="loading" @click="$emit('confirm')"
                :style="`flex:1;padding:10px;border-radius:8px;border:none;background:${gradient};color:#fff;cursor:pointer;font-size:0.88rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;`">
          <span v-if="loading" class="loading loading-spinner loading-xs"></span>
          <span v-else>{{ confirmIcon }}</span> {{ confirmLabel }}
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button @click="$emit('close')">cerrar</button></form>
  </dialog>
</template>
