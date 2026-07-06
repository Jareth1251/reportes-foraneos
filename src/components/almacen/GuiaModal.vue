<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  open:          { type: Boolean, default: false },
  order:         { type: Object,  default: null  },
  actionLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm'])

const input = ref('')

function parseGuias(raw) {
  if (!raw) return []
  return raw.split(/[\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
}

const count = computed(() => parseGuias(input.value).length)

watch(() => props.open, (val) => {
  if (val && props.order) input.value = parseGuias(props.order.guia).join('\n')
  else input.value = ''
})

function confirm() {
  const guias = parseGuias(input.value)
  if (!guias.length) return
  emit('confirm', guias.join(','))
}
</script>

<template>
  <dialog :open="open" class="modal modal-bottom sm:modal-middle">
    <div v-if="open && order" class="modal-box p-0 overflow-hidden" style="max-width:420px;border-radius:16px;">
      <div style="background:linear-gradient(135deg,#455A64,#263238);padding:24px 24px 20px;text-align:center;">
        <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:26px;">📋</div>
        <h3 style="color:#fff;font-size:1.1rem;font-weight:700;margin:0;">Número de guía</h3>
        <p style="color:rgba(255,255,255,0.75);font-size:0.8rem;margin:4px 0 0;">{{ order.erp_order_id }} — {{ order.customer_name }}</p>
      </div>
      <div style="padding:20px 24px;">
        <div style="background:#ECEFF1;border:1px solid #CFD8DC;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.78rem;color:#555;">Paquetería</span>
            <span style="font-weight:600;color:#222;font-size:0.88rem;">{{ order.carrier || '—' }}</span>
          </div>
        </div>
        <label style="display:block;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:0.8rem;color:#555;font-weight:600;">Guías <span style="font-weight:400;color:#aaa;">(una por línea o separadas por coma)</span></span>
            <span v-if="count" style="font-size:0.75rem;background:#455A64;color:#fff;border-radius:10px;padding:1px 8px;">{{ count }}</span>
          </div>
          <textarea v-model="input" rows="5"
                    placeholder="Pega o escribe las guías aquí&#10;Ej:&#10;123456789012&#10;987654321098"
                    class="textarea textarea-bordered w-full"
                    style="font-family:monospace;font-size:0.85rem;resize:vertical;"
                    @input="input = input.toUpperCase()" />
        </label>
      </div>
      <div style="padding:0 24px 20px;display:flex;gap:10px;">
        <button @click="$emit('close')"
                style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:0.88rem;color:#555;font-weight:600;">
          Cancelar
        </button>
        <button :disabled="!input.trim() || actionLoading" @click="confirm"
                style="flex:1;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,#455A64,#263238);color:#fff;cursor:pointer;font-size:0.88rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;">
          <span v-if="actionLoading" class="loading loading-spinner loading-xs"></span>
          <span v-else>✓</span> Guardar guía
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button @click="$emit('close')">cerrar</button></form>
  </dialog>
</template>
