<script setup>
import { ref, watch } from 'vue'

// Mismo flujo que el panel "Registrar incidencia" del tablero de checkin
// (point-of-sale/modalCheckin.js) y los mismos endpoints del back de Node;
// aquí el pedido se busca entre los foráneos cargados en vez de en checkins.
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
    const res  = await fetch('/node-api/surtido_incident_type')
    const data = await res.json()
    incidentTypes.value = data?.result?.[0]?.data || []
  } catch (e) {
    console.error('[IncidentModal] error tipos de incidencia', e)
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
    const res  = await fetch(`/node-api/surtido-incident?erp_order_id=${encodeURIComponent(erpNorm)}`)
    const data = await res.json()
    orderInfo.value    = findOrder(erpNorm)
    incidentList.value = data?.result?.[0]?.data || []
    searched.value     = true
  } catch (e) {
    console.error('[IncidentModal] error buscando pedido', e)
    formError.value = 'No se pudo buscar el pedido. Intenta nuevamente.'
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
    const res = await fetch('/node-api/surtido-incident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        erpOrderId: erpNorm,
        incidentTypeId: incidentTypeId.value,
        cause: cause.value.trim(),
        comment: comment.value.trim(),
        agentId: agentId.value,
        agentName: agent?.name || '',
        departmentId: user.departmentId ?? user.department_id,
        salesPersonId: user.salesPersonId || user.salespersonId || user.username,
        salesPersonName: user.name || user.username || '',
      }),
    })
    const data = await res.json()
    if (!res.ok || !data || data.error) throw new Error(data?.message || 'No se pudo guardar la incidencia')

    const created = data?.result?.[0]?.data?.[0]
    if (created) incidentList.value = [created, ...incidentList.value]
    resetForm()
    emit('saved')
  } catch (e) {
    console.error('[IncidentModal] error guardando incidencia', e)
    emit('error', 'No se pudo guardar la incidencia. Intenta nuevamente.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <dialog :open="open" class="modal modal-bottom sm:modal-middle">
    <div v-if="open" class="modal-box p-0 overflow-hidden" style="max-width:640px;border-radius:16px;">
      <div style="background:linear-gradient(135deg,#EF6C00,#BF360C);padding:24px 24px 20px;text-align:center;">
        <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:26px;">⚠️</div>
        <h3 style="color:#fff;font-size:1.1rem;font-weight:700;margin:0;">Registrar incidencia de surtido</h3>
        <p style="color:rgba(255,255,255,0.75);font-size:0.8rem;margin:4px 0 0;">Un mismo pedido admite varias incidencias</p>
      </div>

      <div style="padding:20px 24px;max-height:65vh;overflow-y:auto;">
        <label style="display:block;margin-bottom:14px;">
          <span class="lbl">Número de pedido</span>
          <div style="display:flex;gap:8px;">
            <input v-model="erp" type="text" placeholder="Ej. P303351"
                   class="input input-bordered input-sm w-full" style="text-transform:uppercase;"
                   @keydown.enter="lookupOrder" />
            <button :disabled="loadingLookup" @click="lookupOrder"
                    style="padding:0 16px;border-radius:6px;border:none;background:#1565C0;color:#fff;cursor:pointer;font-size:0.82rem;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:6px;">
              <span v-if="loadingLookup" class="loading loading-spinner loading-xs"></span>
              {{ loadingLookup ? 'Buscando...' : 'Buscar pedido' }}
            </button>
          </div>
        </label>

        <div v-if="orderInfo"
             style="background:#E3F2FD;border:1px solid #BBDEFB;border-radius:10px;padding:10px 14px;font-size:0.85rem;color:#0D47A1;margin-bottom:14px;">
          🚚 <b>{{ orderInfo.erp_order_id }}</b> — {{ orderInfo.customer_name || 'Sin nombre' }}
          <span v-if="orderInfo.carrier"> — {{ orderInfo.carrier }}</span>
          — estatus: <b>{{ String(orderInfo.status || '').toUpperCase() }}</b>
        </div>
        <div v-else-if="searched"
             style="background:#FFF8E1;border:1px solid #FFE082;border-radius:10px;padding:10px 14px;font-size:0.82rem;color:#795548;margin-bottom:14px;">
          El pedido no está en el tablero actual; la incidencia se registra igual por número de pedido.
        </div>

        <div v-if="incidentList.length"
             style="background:#FAFAFA;border:1px solid #EEE;border-radius:10px;padding:4px 14px;margin-bottom:14px;">
          <div class="lbl" style="margin-top:10px;">Incidencias ya registradas para este pedido</div>
          <div v-for="(inc, idx) in incidentList" :key="inc.id"
               style="padding:10px 0;" :style="{ borderTop: idx === 0 ? 'none' : '1px solid #EEE' }">
            <span style="display:inline-block;background:#FFEBEE;color:#C62828;font-size:0.7rem;font-weight:700;border-radius:999px;padding:2px 10px;text-transform:uppercase;margin-bottom:4px;">
              {{ inc.incident_type_name }}
            </span>
            <div style="font-size:0.85rem;color:#37474F;">
              {{ inc.cause }}<span v-if="inc.comment" style="color:#78909C;"> — {{ inc.comment }}</span>
            </div>
            <div style="font-size:0.72rem;color:#90A4AE;margin-top:2px;">
              Agente: <b>{{ inc.agent_name || 'Sin agente' }}</b> · Registró: {{ inc.created_by_name || 'Sin usuario' }}
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          <label style="display:block;">
            <span class="lbl">Tipo de error</span>
            <select v-model="incidentTypeId" class="select select-bordered select-sm w-full">
              <option value="">Selecciona un tipo</option>
              <option v-for="t in incidentTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
          <label style="display:block;">
            <span class="lbl">Agente que provocó el error</span>
            <select v-model="agentId" class="select select-bordered select-sm w-full" :disabled="agentsLoading">
              <option value="">{{ agentsLoading ? 'Cargando agentes...' : 'Selecciona un agente' }}</option>
              <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
          <label style="display:block;">
            <span class="lbl">Causa del error</span>
            <textarea v-model="cause" rows="3" placeholder="Describe qué originó el error"
                      class="textarea textarea-bordered w-full" style="resize:vertical;" />
          </label>
          <label style="display:block;">
            <span class="lbl">Comentario <span style="font-weight:400;color:#aaa;text-transform:none;">(opcional)</span></span>
            <textarea v-model="comment" rows="3" placeholder="Comentario adicional"
                      class="textarea textarea-bordered w-full" style="resize:vertical;" />
          </label>
        </div>

        <div v-if="formError" style="margin-top:12px;color:#C62828;font-size:0.82rem;font-weight:600;">{{ formError }}</div>
      </div>

      <div style="padding:0 24px 20px;display:flex;gap:10px;">
        <button @click="$emit('close')"
                style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:0.88rem;color:#555;font-weight:600;">
          Cerrar
        </button>
        <button :disabled="saving" @click="addIncident"
                style="flex:1;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,#EF6C00,#BF360C);color:#fff;cursor:pointer;font-size:0.88rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;">
          <span v-if="saving" class="loading loading-spinner loading-xs"></span>
          <span v-else>＋</span> Agregar incidencia
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button @click="$emit('close')">cerrar</button></form>
  </dialog>
</template>

<style scoped>
.lbl { font-size: 0.75rem; color: #555; font-weight: 600; display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
</style>
