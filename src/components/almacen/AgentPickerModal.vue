<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  open:          { type: Boolean, default: false },
  order:         { type: Object,  default: null  },
  title:         { type: String,  default: ''    },
  icon:          { type: String,  default: '👤'  },
  gradient:      { type: String,  default: 'linear-gradient(135deg,#00897B,#004D40)' },
  highlightBg:   { type: String,  default: 'rgba(0, 137, 123, 0.15)' },
  highlightColor:{ type: String,  default: '#00897B' },
  confirmLabel:  { type: String,  default: 'Confirmar' },
  agents:        { type: Array,   default: () => [] },
  agentsLoading: { type: Boolean, default: false },
  actionLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm'])

const search       = ref('')
const selectedId   = ref('')
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
    <div v-if="open && order" class="modal-box p-0 overflow-hidden max-w-[440px] rounded-2xl bg-base-100 text-base-content">
      <div :style="`background:${gradient};padding:20px 24px 16px;text-align:center;`">
        <div class="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2.5 text-2xl"
             style="background:rgba(255,255,255,0.15);">{{ icon }}</div>
        <h3 class="text-white text-base font-bold m-0">{{ title }}</h3>
        <p class="text-white/75 text-xs mt-1">{{ order.erp_order_id }} — {{ order.customer_name }}</p>
      </div>

      <div class="p-4">
        <input v-model="search" type="search" placeholder="🔍 Buscar por nombre..."
               class="input input-bordered input-sm w-full mb-2" />

        <div class="max-h-60 overflow-y-auto border border-base-300 rounded-lg bg-base-100">
          <div v-if="agentsLoading" class="p-5 text-center text-base-content/50 text-sm">
            Cargando agentes...
          </div>
          <div v-else-if="!filtered.length" class="p-4 text-center text-base-content/50 text-sm">
            Sin resultados
          </div>
          <div v-for="a in filtered" :key="a.id"
               @click="select(a)"
               :style="{
                 padding: '10px 14px',
                 cursor: 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'space-between',
                 borderBottom: '1px solid var(--fallback-b3, oklch(var(--b3, 0.9) / 1))',
                 background: selectedId === a.id ? highlightBg : '',
                 fontWeight: selectedId === a.id ? '700' : '400',
               }">
            <span class="text-sm text-base-content">{{ a.name }}</span>
            <span v-if="selectedId === a.id" :style="`color:${highlightColor};font-size:1rem;`">✓</span>
          </div>
        </div>
      </div>

      <div class="px-4 pb-4 flex gap-2.5">
        <button @click="$emit('close')"
                class="btn btn-outline btn-sm flex-1 text-base-content/70">
          Cancelar
        </button>
        <button :disabled="!selectedId || actionLoading"
                @click="confirm"
                class="btn btn-sm flex-1 border-none text-white"
                :style="`background:${gradient};`">
          <span v-if="actionLoading" class="loading loading-spinner loading-xs"></span>
          <span v-else>✓</span> {{ confirmLabel }}
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button @click="$emit('close')">cerrar</button></form>
  </dialog>
</template>