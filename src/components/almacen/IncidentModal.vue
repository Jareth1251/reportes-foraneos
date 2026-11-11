<script setup>
import { ref, watch } from 'vue'
import { api } from '@/config/axios'

const props = defineProps({
  open:   { type: Boolean, default: false },
  orders: { type: Array,   default: () => [] },
  agents: { type: Array,   default: () => [] },
  agentsLoading: { type: Boolean, default: false },
  user:   { type: Object,  default: null },
})

const emit = defineEmits(['close', 'saved', 'error'])

const incidentTypes  = ref([])
const erp            = ref('')
const orderInfo      = ref(null)
const incidentList   = ref([])
const searched       = ref(false)
const incidentTypeId = ref('')
const agentId        = ref('')
const cause          = ref('')
const comment        = ref('')
const loadingLookup  = ref(false)
const saving         = ref(false)
const formError      = ref('')

function resetForm() {
  incidentTypeId.value = ''
  agentId.value        = ''
  cause.value          = ''
  comment.value        = ''
}

watch(() => props.open, (val) => {
  if (!val) return
  erp.value          = ''
  orderInfo.value    = null
  incidentList.value = []
  searched.value     = false
  formError.value    = ''
  resetForm()
  if (!incidentTypes.value.length) loadIncidentTypes()
})

async function loadIncidentTypes() {
  try {
    const { data } = await api.get('/surtido/incident-types')
    incidentTypes.value = data?.data || []
  } catch (e) {
    console.error('[IncidentModal] error tipos de incidencia', e)
    emit('error', 'No se pudieron cargar los tipos de incidencia')
  }
}

function findOrder(erpNorm) {
  return props.orders.find((o) => {
    const group = Array.isArray(o?.erp_group_list) ? o.erp_group_list : []
    return [o?.erp_order_id, ...group]
      .map(s => String(s || '').trim().toUpperCase())
      .includes(erpNorm)
  }) || null
}

async function lookupOrder() {
  const erpNorm = erp.value.trim().toUpperCase()
  formError.value = ''
  if (!erpNorm) { formError.value = 'Escribe el número de pedido'; return }

  erp.value = erpNorm
  loadingLookup.value = true
  try {
    const { data } = await api.get('/surtido/incidents', {
      params: { erp_order_id: erpNorm },
    })
    orderInfo.value    = findOrder(erpNorm)
    incidentList.value = data?.data || []
    searched.value     = true
  } catch (e) {
    console.error('[IncidentModal] error buscando pedido', e)
    formError.value = e?.response?.data?.message || 'No se pudo buscar el pedido. Intenta nuevamente.'
  } finally {
    loadingLookup.value = false
  }
}

async function addIncident() {
  const erpNorm = erp.value.trim().toUpperCase()
  formError.value = ''
  if (!erpNorm)              { formError.value = 'Escribe el número de pedido'; return }
  if (!incidentTypeId.value) { formError.value = 'Selecciona el tipo de error'; return }
  if (!agentId.value)        { formError.value = 'Selecciona el agente que provocó el error'; return }
  if (!cause.value.trim())   { formError.value = 'Describe la causa del error'; return }

  const agent = props.agents.find(a => String(a.id) === String(agentId.value))
  const user  = props.user || {}

  saving.value = true
  try {
    const payload = {
      erp_order_id:     erpNorm,
      incident_type_id: incidentTypeId.value,
      comment:          [cause.value.trim(), comment.value.trim()].filter(Boolean).join(' — '),
      agent_id:         agentId.value || null,
      agent_name:       agent?.name || null,
      created_by:       user.username || user.salesPersonId || user.salesperson_id || null,
      created_by_name:  user.name || user.username || null,
    }

    const { data } = await api.post('/surtido/incidents', payload)

    if (data?.ok && data?.data) {
      incidentList.value = [data.data, ...incidentList.value]
    }
    resetForm()
    emit('saved')
  } catch (e) {
    console.error('[IncidentModal] error guardando incidencia', e)
    const msg = e?.response?.data?.message
      || e?.response?.data?.errors?.incident_type_id?.[0]
      || 'No se pudo guardar la incidencia. Intenta nuevamente.'
    formError.value = msg
    emit('error', msg)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog :open="open" class="modal modal-bottom sm:modal-middle">
    <div v-if="open" class="modal-box p-0 overflow-hidden max-w-[640px] rounded-2xl bg-base-100 text-base-content">
      <div style="background:linear-gradient(135deg,#EF6C00,#BF360C);padding:24px 24px 20px;text-align:center;">
        <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl"
             style="background:rgba(255,255,255,0.15);">⚠️</div>
        <h3 class="text-white text-lg font-bold m-0">Registrar incidencia de surtido</h3>
        <p class="text-white/75 text-xs mt-1">Un mismo pedido admite varias incidencias</p>
      </div>

      <div class="px-5 py-4 max-h-[65vh] overflow-y-auto">
        <label class="block mb-3.5">
          <span class="lbl">Número de pedido</span>
          <div class="flex gap-2">
            <input v-model="erp" type="text" placeholder="Ej. P303351"
                   class="input input-bordered input-sm w-full uppercase"
                   @keydown.enter="lookupOrder" />
            <button :disabled="loadingLookup" @click="lookupOrder"
                    class="btn btn-sm border-none text-white whitespace-nowrap"
                    style="background:#1565C0;">
              <span v-if="loadingLookup" class="loading loading-spinner loading-xs"></span>
              {{ loadingLookup ? 'Buscando...' : 'Buscar pedido' }}
            </button>
          </div>
        </label>

        <div v-if="orderInfo"
             class="bg-info/15 border border-info/40 rounded-lg px-3.5 py-2.5 text-sm text-info mb-3.5">
          🚚 <b>{{ orderInfo.erp_order_id }}</b> — {{ orderInfo.customer_name || 'Sin nombre' }}
          <span v-if="orderInfo.carrier"> — {{ orderInfo.carrier }}</span>
          — estatus: <b>{{ String(orderInfo.status || '').toUpperCase() }}</b>
        </div>
        <div v-else-if="searched"
             class="bg-warning/15 border border-warning/40 rounded-lg px-3.5 py-2.5 text-xs text-warning-content mb-3.5">
          El pedido no está en el tablero actual; la incidencia se registra igual por número de pedido.
        </div>

        <div v-if="incidentList.length"
             class="bg-base-200 border border-base-300 rounded-lg px-3.5 py-1 mb-3.5">
          <div class="lbl mt-2.5">Incidencias ya registradas para este pedido</div>
          <div v-for="(inc, idx) in incidentList" :key="inc.id"
               class="py-2.5"
               :class="idx === 0 ? '' : 'border-t border-base-300'">
            <span class="inline-block bg-error/15 text-error text-[0.7rem] font-bold rounded-full px-2.5 py-0.5 uppercase mb-1">
              {{ inc.incident_type_name }}
            </span>
            <div class="text-sm text-base-content/80">
              {{ inc.cause }}<span v-if="inc.comment && inc.comment !== inc.cause" class="text-base-content/50"> — {{ inc.comment }}</span>
            </div>
            <div class="text-[0.72rem] text-base-content/50 mt-0.5">
              Agente: <b>{{ inc.agent_name || 'Sin agente' }}</b> · Registró: {{ inc.created_by_name || 'Sin usuario' }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block">
            <span class="lbl">Tipo de error</span>
            <select v-model="incidentTypeId" class="select select-bordered select-sm w-full">
              <option value="">Selecciona un tipo</option>
              <option v-for="t in incidentTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
          <label class="block">
            <span class="lbl">Agente que provocó el error</span>
            <select v-model="agentId" class="select select-bordered select-sm w-full" :disabled="agentsLoading">
              <option value="">{{ agentsLoading ? 'Cargando agentes...' : 'Selecciona un agente' }}</option>
              <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
          <label class="block sm:col-span-2">
            <span class="lbl">Causa del error</span>
            <textarea v-model="cause" rows="3" placeholder="Describe qué originó el error"
                      class="textarea textarea-bordered w-full resize-y" />
          </label>
          <label class="block sm:col-span-2">
            <span class="lbl">Comentario <span class="font-normal text-base-content/40 normal-case">(opcional)</span></span>
            <textarea v-model="comment" rows="3" placeholder="Comentario adicional"
                      class="textarea textarea-bordered w-full resize-y" />
          </label>
        </div>

        <div v-if="formError" class="mt-3 text-error text-xs font-semibold">{{ formError }}</div>
      </div>

      <div class="px-5 pb-4 flex gap-2.5">
        <button @click="$emit('close')"
                class="btn btn-outline btn-sm flex-1 text-base-content/70">
          Cerrar
        </button>
        <button :disabled="saving" @click="addIncident"
                class="btn btn-sm flex-1 border-none text-white"
                style="background:linear-gradient(135deg,#EF6C00,#BF360C);">
          <span v-if="saving" class="loading loading-spinner loading-xs"></span>
          <span v-else>＋</span> Agregar incidencia
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button @click="$emit('close')">cerrar</button></form>
  </dialog>
</template>

<style scoped>
.lbl {
  font-size: 0.75rem;
  color: var(--fallback-bc, oklch(var(--bc, 0.2) / 1));
  opacity: 0.7;
  font-weight: 600;
  display: block;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
</style>