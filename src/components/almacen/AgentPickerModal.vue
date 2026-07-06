<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  open:          { type: Boolean, default: false },
  order:         { type: Object,  default: null  },
  title:         { type: String,  default: ''    },
  icon:          { type: String,  default: '👤'  },
  gradient:      { type: String,  default: 'linear-gradient(135deg,#00897B,#004D40)' },
  highlightBg:   { type: String,  default: '#E8F5E9' },
  highlightColor:{ type: String,  default: '#00796B' },
  confirmLabel:  { type: String,  default: 'Confirmar' },
  agents:        { type: Array,   default: () => [] },
  agentsLoading: { type: Boolean, default: false },
  actionLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm'])

const search     = ref('')
const selectedId = ref('')
const selectedName = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.agents
  return props.agents.filter(a => a.name.toLowerCase().includes(q))
})

watch(() => props.open, (val) => {
  if (val) { search.value = ''; selectedId.value = ''; selectedName.value = '' }
})

function select(agent) {
  selectedId.value   = agent.id
  selectedName.value = agent.name
}

function confirm() {
  if (!selectedId.value) return
  emit('confirm', { id: selectedId.value, name: selectedName.value })
}
</script>

<template>
  <dialog :open="open" class="modal modal-bottom sm:modal-middle">
    <div v-if="open && order" class="modal-box p-0 overflow-hidden" style="max-width:440px;border-radius:16px;">
      <div :style="`background:${gradient};padding:20px 24px 16px;text-align:center;`">
        <div style="width:48px;height:48px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:22px;">{{ icon }}</div>
        <h3 style="color:#fff;font-size:1rem;font-weight:700;margin:0;">{{ title }}</h3>
        <p style="color:rgba(255,255,255,0.75);font-size:0.78rem;margin:3px 0 0;">{{ order.erp_order_id }} — {{ order.customer_name }}</p>
      </div>
      <div style="padding:16px 20px;">
        <input v-model="search" type="search" placeholder="🔍 Buscar por nombre..."
               class="input input-bordered input-sm w-full mb-2" />
        <div style="max-height:240px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;">
          <div v-if="agentsLoading" style="padding:20px;text-align:center;color:#aaa;font-size:0.85rem;">Cargando agentes...</div>
          <div v-else-if="!filtered.length" style="padding:16px;text-align:center;color:#aaa;font-size:0.85rem;">Sin resultados</div>
          <div v-for="a in filtered" :key="a.id"
               @click="select(a)"
               :style="{
                 padding:'10px 14px', cursor:'pointer', display:'flex',
                 alignItems:'center', justifyContent:'space-between',
                 borderBottom:'1px solid #f3f4f6',
                 background: selectedId === a.id ? highlightBg : '',
                 fontWeight: selectedId === a.id ? '700' : '400',
               }">
            <span style="font-size:0.88rem;">{{ a.name }}</span>
            <span v-if="selectedId === a.id" :style="`color:${highlightColor};font-size:1rem;`">✓</span>
          </div>
        </div>
      </div>
      <div style="padding:0 20px 20px;display:flex;gap:10px;">
        <button @click="$emit('close')"
                style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:0.88rem;color:#555;font-weight:600;">
          Cancelar
        </button>
        <button :disabled="!selectedId || actionLoading"
                @click="confirm"
                :style="`flex:1;padding:10px;border-radius:8px;border:none;background:${gradient};color:#fff;cursor:pointer;font-size:0.88rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;`">
          <span v-if="actionLoading" class="loading loading-spinner loading-xs"></span>
          <span v-else>✓</span> {{ confirmLabel }}
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button @click="$emit('close')">cerrar</button></form>
  </dialog>
</template>
