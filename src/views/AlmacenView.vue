<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter }        from 'vue-router'
import { useAuthStore }     from '@/stores/auth'
import { useForaneosStore } from '@/stores/foraneos'

const router = useRouter()
if (!sessionStorage.getItem('foraneos_module_chosen')) {
  router.replace({ name: 'selector' })
}
import PrintOrderView       from '@/components/PrintOrderView.vue'
import OrderCard            from '@/components/almacen/OrderCard.vue'
import AgentPickerModal     from '@/components/almacen/AgentPickerModal.vue'
import ConfirmModal         from '@/components/almacen/ConfirmModal.vue'
import GuiaModal            from '@/components/almacen/GuiaModal.vue'

const auth  = useAuthStore()
const store = useForaneosStore()

const searchText    = ref('')
const activeStatus  = ref('facturado')
const activeCarrier = ref(null)
const onlyDomicilio = ref(false)
const toast         = ref(null)
const printViewRef  = ref(null)

// ── Estado de modales ──────────────────────────────────────────────────────
const surtidorModal    = ref(null)   // { order }
const despachadorModal = ref(null)
const empacadorModal   = ref(null)
const envioModal       = ref(null)
const guiaInput        = ref('')
const guiaModal        = ref(null)
const deliverModal     = ref(null)
const deliverName      = ref('')
const returnModal      = ref(null)
const returnReason     = ref('')

const warehouseAgents = ref([])
const agentsLoading   = ref(false)

onMounted(() => store.fetchAlmacen())

// ── Helpers de tiempo ──────────────────────────────────────────────────────
function ymdTZ(dateLike) {
  try {
    const parts = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(dateLike))
    return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`
  } catch { return null }
}

const todayYMD = computed(() => ymdTZ(Date.now()))

const turnoMap = computed(() => {
  const list = store.orders
    .filter(o => o?.created_at && String(o.status).toLowerCase() !== 'cancelado')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const counters = {}, map = {}
  for (const o of list) {
    const day = ymdTZ(o.created_at)
    if (!day) continue
    counters[day] = (counters[day] || 0) + 1
    map[o.id] = counters[day]
  }
  return map
})

function getTurno(order)      { return turnoMap.value[order?.id] ?? '—' }
function fmtHora(ts)          { if (!ts) return '—'; return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ts)) }
function fmtFecha(ts)         { if (!ts) return 'No disponible'; return new Date(ts).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function timeSince(ts) {
  if (!ts) return '—'
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000)
  if (mins < 1) return '0 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
function getStatusStartTime(order) {
  const st = String(order?.status || '').toLowerCase()
  switch (st) {
    case 'facturado': return order.facturado_at
    case 'surtiendo': return order.surtidor_asignado_at || order.facturado_at
    case 'surtido':   return order.surtido_at || order.surtidor_asignado_at
    case 'empacando': return order.empacado_at || order.surtido_at
    case 'enviado':   return order.packed_at   || order.empacado_at
    case 'entregado': return order.delivered_at
    default:          return order.created_at
  }
}

function isPendiente(order) {
  if (!order?.created_at) return false
  const day = ymdTZ(order.created_at)
  const st  = String(order?.status || '').toLowerCase()
  return !!day && !!todayYMD.value && day < todayYMD.value && st !== 'entregado' && st !== 'cancelado'
}

function isDeliveredToday(o) {
  return String(o?.status || '').toLowerCase() === 'entregado' &&
    ymdTZ(o.delivered_at || o.last_status_change_at || o.updated_at) === todayYMD.value
}

function hasDespachador(o) {
  return !!(o?.despachador_id ||
    (o?.despachador_name && String(o.despachador_name).trim() !== '') ||
    (o?.dispatcher_name  && String(o.dispatcher_name).trim()  !== ''))
}

function norm(s) { return (s ?? '').toString().trim().toLowerCase() }
function isCarrierDomicilio(o) { return norm(o?.carrier) === 'domicilio' }

function parseGuias(raw) {
  if (!raw) return []
  return raw.split(/[\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
}

function guiaLabel(order) {
  const list = parseGuias(order.guia)
  if (!list.length) return 'Guía'
  if (list.length === 1) return list[0]
  return `${list.length} guías`
}

// ── Filtros ────────────────────────────────────────────────────────────────
const filteredBase = computed(() => {
  const base = store.orders.filter(o =>
    onlyDomicilio.value ? isCarrierDomicilio(o) : !isCarrierDomicilio(o)
  )
  const q = searchText.value.trim().toLowerCase()
  if (!q) return base
  return base.filter(o =>
    (o.customer_name ?? '').toLowerCase().includes(q) ||
    (o.erp_order_id  ?? '').toLowerCase().includes(q) ||
    (o.carrier       ?? '').toLowerCase().includes(q)
  )
})

const uniqueCarriers = computed(() => {
  const seen = new Set()
  for (const o of filteredBase.value) {
    const c = (o.carrier || '').trim()
    if (c) seen.add(c)
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
})

const filtered = computed(() =>
  activeCarrier.value
    ? filteredBase.value.filter(o => norm(o.carrier) === norm(activeCarrier.value))
    : filteredBase.value
)

function getCarrierCount(carrier) {
  if (!carrier) return filteredBase.value.length
  return filteredBase.value.filter(o => norm(o.carrier) === norm(carrier)).length
}

// ── Tabs de status ─────────────────────────────────────────────────────────
const STATUS_TABS = computed(() => [
  { bucket: 'facturado',           label: 'Asignar Surtidor',   color: '#00897B', icon: '🧑‍🏭', textColor: '#fff' },
  { bucket: 'surtiendo',           label: 'Surtiendo',           color: '#FFD700', icon: '🛠️',  textColor: '#000' },
  { bucket: 'surtido-despachador', label: 'Asignar Despachador', color: '#8E24AA', icon: '🚚',  textColor: '#fff' },
  ...(!onlyDomicilio.value ? [{ bucket: 'surtido', label: 'Asignar Empacador', color: '#9C27B0', icon: '🧑‍🔧', textColor: '#fff' }] : []),
  { bucket: 'empacando',           label: 'Empacado',            color: '#0288D1', icon: '📦',  textColor: '#fff' },
  { bucket: 'enviado',             label: 'Entregando',          color: '#F57C00', icon: '🚚',  textColor: '#fff' },
  { bucket: 'entregado',           label: 'Entregado',           color: '#616161', icon: '✅',  textColor: '#fff' },
])

function getOrdersForBucket(bucket) {
  if (bucket === 'surtido-despachador') return filtered.value.filter(o => norm(o.status) === 'surtido' && !hasDespachador(o))
  if (bucket === 'surtido')             return filtered.value.filter(o => norm(o.status) === 'surtido' && hasDespachador(o))
  if (bucket === 'entregado')           return filtered.value.filter(isDeliveredToday)
  if (bucket === 'empacando' && onlyDomicilio.value)
    return filtered.value.filter(o =>
      norm(o.status) === 'empacando' ||
      (norm(o.status) === 'surtido' && hasDespachador(o) && isCarrierDomicilio(o))
    )
  return filtered.value.filter(o => norm(o.status) === bucket)
}

const activeTab      = computed(() => STATUS_TABS.value.find(t => t.bucket === activeStatus.value))
const visibleOrders  = computed(() => {
  if (!activeStatus.value) return []
  return getOrdersForBucket(activeStatus.value).sort((a, b) => {
    const pa = isPendiente(a) ? 0 : 1, pb = isPendiente(b) ? 0 : 1
    if (pa !== pb) return pa - pb
    return new Date(a.created_at) - new Date(b.created_at)
  })
})

// ── Agentes ────────────────────────────────────────────────────────────────
async function loadAgents() {
  agentsLoading.value = true
  warehouseAgents.value = await store.fetchWarehouseAgents(auth.user?.site ?? '')
  agentsLoading.value = false
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(type, message) {
  toast.value = { type, message }
  setTimeout(() => (toast.value = null), 3500)
}

// ── Acciones ───────────────────────────────────────────────────────────────
async function confirmSurtidor({ id, name }) {
  const { order } = surtidorModal.value
  const res = await store.almacenAssignSurtidor(order.id, id, name)
  surtidorModal.value = null
  if (res.ok) { showToast('success', 'Surtidor asignado'); await store.fetchAlmacen() }
  else showToast('error', res.message)
}

async function confirmMarkSurtido(order) {
  const res = await store.almacenUpdateStatus(order.id, 'surtido')
  if (res.ok) { showToast('success', 'Marcado como SURTIDO'); await store.fetchAlmacen() }
  else showToast('error', res.message)
}

async function confirmDespachador({ id, name }) {
  const { order } = despachadorModal.value
  const res = await store.almacenAssignDespachador(order.id, id, name)
  despachadorModal.value = null
  if (res.ok) { showToast('success', 'Despachador asignado'); await store.fetchAlmacen() }
  else showToast('error', res.message)
}

async function confirmEmpacador({ id, name }) {
  const { order } = empacadorModal.value
  const res = await store.almacenPack(order.id, id, name)
  empacadorModal.value = null
  if (res.ok) { showToast('success', 'Pedido empacado'); await store.fetchAlmacen() }
  else showToast('error', res.message)
}

async function confirmEnvio() {
  const { order } = envioModal.value
  const res = await store.almacenMarkAsSent(order.id, guiaInput.value.trim(), order.carrier)
  envioModal.value = null
  guiaInput.value  = ''
  if (res.ok) { showToast('success', 'Pedido enviado'); await store.fetchAlmacen() }
  else showToast('error', res.message)
}

async function confirmDeliver() {
  const { order } = deliverModal.value
  const res = await store.almacenMarkAsDelivered(order.id, deliverName.value || auth.user?.name)
  deliverModal.value = null
  if (res.ok) { showToast('success', 'Pedido entregado'); await store.fetchAlmacen() }
  else showToast('error', res.message)
}

async function confirmReturn() {
  const { order } = returnModal.value
  const res = await store.returnToAdvisor(order.id, returnReason.value || 'Sin motivo')
  returnModal.value = null
  if (res.ok) { showToast('success', 'Turno regresado al asesor'); await store.fetchAlmacen() }
  else showToast('error', res.message)
}

async function confirmGuia(raw) {
  const { order } = guiaModal.value
  const guias = parseGuias(raw)
  const res = await store.updateGuia(order.id, raw)
  guiaModal.value = null
  if (res.ok) { showToast('success', guias.length === 1 ? 'Guía guardada' : `${guias.length} guías guardadas`); await store.fetchAlmacen() }
  else showToast('error', res.message)
}

// ── Apertura de modales ────────────────────────────────────────────────────
function openSurtidor(order)    { surtidorModal.value    = { order }; loadAgents() }
function openDespachador(order) { despachadorModal.value = { order }; loadAgents() }
function openEmpacador(order)   { empacadorModal.value   = { order }; loadAgents() }
function openEnviar(order)      { envioModal.value = { order }; guiaInput.value = '' }
function openDeliver(order)     { deliverModal.value = { order }; deliverName.value = auth.user?.name ?? '' }
function openReturn(order)      { returnModal.value = { order }; returnReason.value = '' }

// ── Imprimir ───────────────────────────────────────────────────────────────
function buildPrintOrders(item, turn) {
  const allDetails = item.all_order_details || []
  const orderedIds = [item.erp_order_id, ...(item.erp_group_list || [])]
  return orderedIds.map(erpId => {
    const snap = allDetails.find(d => d.erp_order_id === erpId) || {}
    return {
      numeroPedido: erpId,
      remision:     item.remision || '',
      cliente:      item.customer_name,
      vendedor:     item.sales_person || snap.order_salesperson || '',
      comentarios:  item.advisor_comment || snap.order_remarks || '',
      direccion:    snap.order_address || '',
      fecha:        fmtFecha(item.created_at),
      status:       item.status,
      subtotal:     snap.snapshot_subtotal || '',
      iva:          snap.snapshot_iva      || '',
      total:        snap.snapshot_total    || '',
      invoice:      item.invoice_id        || '',
      turn,
      articulos:    Array.isArray(snap.order_detail) ? snap.order_detail : [],
    }
  })
}

async function handlePrint(order) {
  const item = await store.getDetail(order.id)
  if (!item) { showToast('error', 'No se pudo obtener el detalle para imprimir'); return }
  await printViewRef.value.print({ orders: buildPrintOrders(item, getTurno(order)) })
}
</script>

<template>
  <div class="min-h-screen bg-gray-100" style="font-family:sans-serif;">

    <!-- Navbar -->
    <div class="navbar bg-white shadow-sm px-4 sticky top-0 z-30">
      <div class="navbar-start gap-2 flex items-center">
        <button @click="router.push({ name: 'selector' })"
                style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:6px;border:none;cursor:pointer;font-size:0.95rem;font-weight:700;background-color:#1565C0;color:#fff;">
          ← Módulos
        </button>
        <span style="font-weight:700;padding:4px 12px;border-radius:8px;color:#E65100;background:#FFE0B2;font-size:1.2rem;line-height:1.2;">
          {{ onlyDomicilio ? 'Pedidos Domicilio' : 'Pedidos Foráneos' }}
        </span>
        <button :disabled="store.loading" @click="store.fetchAlmacen()"
                style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#FFA000;color:#fff;">
          <span v-if="store.loading" class="loading loading-spinner loading-xs"></span>
          <span v-else>🔄</span> Actualizar
        </button>
        <span v-if="store.lastFetch" class="text-xs text-gray-400 hidden md:block">
          Última act. {{ fmtHora(store.lastFetch) }}
        </span>
        <button @click="onlyDomicilio = !onlyDomicilio; activeStatus = 'facturado'; activeCarrier = null"
                style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;color:#fff;"
                :style="{ backgroundColor: onlyDomicilio ? '#9C27B0' : '#000' }">
          {{ onlyDomicilio ? 'Ver Foráneos' : 'Ver Domicilio' }}
        </button>
      </div>
      <div class="navbar-center">
        <input v-model="searchText" type="search" placeholder="Buscar cliente, pedido o paquetería..."
               class="input input-bordered input-sm w-72" />
      </div>
      <div class="navbar-end">
        <div class="dropdown dropdown-end">
          <div tabindex="0" role="button" class="avatar placeholder cursor-pointer">
            <div class="bg-primary text-primary-content rounded-full w-9">
              <span class="text-xs font-bold">{{ (auth.user?.name ?? '?')[0]?.toUpperCase() }}</span>
            </div>
          </div>
          <ul tabindex="0" class="menu menu-sm dropdown-content bg-base-100 rounded-box z-50 mt-3 w-44 p-2 shadow border border-base-300">
            <li class="menu-title text-xs px-2">{{ auth.user?.name }}</li>
            <li><a @click="auth.logout()" class="text-error">Cerrar sesión</a></li>
          </ul>
        </div>
      </div>
    </div>

    <div class="p-4">

      <!-- Error -->
      <div v-if="store.error" role="alert" class="alert alert-error mb-4 text-sm">
        <span>{{ store.error }}</span>
        <button class="btn btn-ghost btn-xs ml-auto" @click="store.clearError()">✕</button>
      </div>

      <!-- Filtro de paqueterías -->
      <div v-if="uniqueCarriers.length" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <button @click="activeCarrier = null"
                style="padding:6px 10px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;color:#fff;"
                :style="{ backgroundColor: activeCarrier === null ? '#455A64' : '#000' }">
          Todas las paqueterías ({{ getCarrierCount(null) }})
        </button>
        <button v-for="carrier in uniqueCarriers" :key="carrier"
                @click="activeCarrier = activeCarrier === carrier ? null : carrier"
                style="padding:6px 10px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;color:#fff;"
                :style="{ backgroundColor: activeCarrier === carrier ? '#1E88E5' : '#000' }">
          {{ carrier }} ({{ getCarrierCount(carrier) }})
        </button>
      </div>

      <!-- Tabs de status -->
      <div style="display:flex;justify-content:space-around;margin-bottom:20px;gap:10px;flex-wrap:wrap;">
        <button v-for="tab in STATUS_TABS" :key="tab.bucket"
                @click="activeStatus = activeStatus === tab.bucket ? null : tab.bucket"
                style="flex:1;min-width:100px;padding:10px;font-weight:bold;border:none;border-radius:6px;cursor:pointer;transition:opacity 0.2s;"
                :style="{
                  backgroundColor: tab.color,
                  color: tab.textColor,
                  opacity: activeStatus === null || activeStatus === tab.bucket ? 1 : 0.5,
                }">
          {{ tab.icon }} {{ tab.label }} ({{ getOrdersForBucket(tab.bucket).length }})
        </button>
      </div>

      <!-- Skeleton -->
      <div v-if="store.loading && store.orders.length === 0"
           style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;">
        <div v-for="n in 4" :key="n" class="animate-pulse"
             style="background:#f0f0f0;border-radius:8px;height:250px;"></div>
      </div>

      <!-- Grid de pedidos (todos los buckets excepto entregado) -->
      <div v-else-if="activeStatus && activeStatus !== 'entregado'"
           style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;">
        <OrderCard
          v-for="order in visibleOrders"
          :key="order.id"
          :order="order"
          :bucket="activeStatus"
          :badge-color="activeTab?.color ?? '#00897B'"
          :badge-text-color="activeTab?.textColor ?? '#fff'"
          :pendiente="isPendiente(order)"
          :turno="getTurno(order)"
          :elapsed="timeSince(getStatusStartTime(order))"
          :action-loading="store.actionLoading === order.id"
          :guia-label="guiaLabel(order)"
          @assign-surtidor="openSurtidor"
          @mark-surtido="confirmMarkSurtido"
          @assign-despachador="openDespachador"
          @assign-empacador="openEmpacador"
          @enviar="openEnviar"
          @deliver="openDeliver"
          @open-guia="order => guiaModal = { order }"
          @return="openReturn"
          @print="handlePrint"
        />
        <div v-if="visibleOrders.length === 0 && !store.loading"
             style="grid-column:1/-1;text-align:center;color:#aaa;padding:40px 0;font-style:italic;">
          Sin pedidos en este estatus
        </div>
      </div>

      <!-- Bucket: entregado -->
      <div v-else-if="activeStatus === 'entregado'">
        <h4 style="margin-bottom:12px;font-weight:bold;font-size:1rem;">Entregados — Hoy</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:15px;">
          <div v-for="order in visibleOrders" :key="order.id"
               style="border-left:6px solid #4CAF50;border-radius:10px;padding:1rem;background-color:#E8F5E9;font-size:0.9rem;box-shadow:0 2px 6px rgba(0,0,0,0.1);min-height:210px;">
            <p style="margin:0;"><strong>Cliente:</strong> {{ order.customer_name }}</p>
            <p style="margin:4px 0;"><strong>Pedido:</strong> {{ order.erp_order_id }}</p>
            <p style="margin:4px 0;">📦 <b>Piezas:</b> {{ order.quantity_total || '—' }}</p>
            <p style="margin:4px 0;"><strong>Vendedor:</strong> {{ order.sales_person || 'No disponible' }}</p>
            <p style="margin:4px 0;"><strong>Paquetería:</strong> {{ order.carrier || '—' }}</p>
            <p style="margin:4px 0;"><strong>Factura:</strong> {{ order.invoice_id || '—' }}</p>
            <div v-if="order.advisor_comment?.trim()" class="comment-box">
              <strong>Comentario:</strong><div class="comment-text">{{ order.advisor_comment }}</div>
            </div>
            <p style="margin:4px 0;">📦 <strong>Empacado por:</strong> {{ order.packed_by_name || 'No disponible' }}</p>
            <p style="margin:4px 0;">✔️ <strong>Entregado por:</strong> {{ order.delivered_by_name || 'No disponible' }}</p>
            <p style="margin:4px 0;">🕒 <strong>Entregado el:</strong> {{ fmtFecha(order.delivered_at) }}</p>
          </div>
          <p v-if="visibleOrders.length === 0" style="color:#888;font-style:italic;">Sin entregados hoy.</p>
        </div>
      </div>

      <div v-else-if="!store.loading" style="text-align:center;color:#aaa;padding:60px 0;">
        Selecciona un estatus para ver los pedidos
      </div>

    </div>

    <!-- Toast -->
    <div class="toast toast-end z-50" v-if="toast">
      <div class="alert text-sm" :class="toast.type === 'error' ? 'alert-error' : 'alert-success'">
        <span>{{ toast.message }}</span>
      </div>
    </div>

    <!-- Modales de selección de agente -->
    <AgentPickerModal
      :open="!!surtidorModal" :order="surtidorModal?.order"
      title="Asignar Surtidor" icon="👷"
      gradient="linear-gradient(135deg,#00897B,#004D40)"
      highlight-bg="#E8F5E9" highlight-color="#00796B"
      confirm-label="Confirmar Surtidor"
      :agents="warehouseAgents" :agents-loading="agentsLoading"
      :action-loading="!!store.actionLoading"
      @close="surtidorModal = null"
      @confirm="confirmSurtidor"
    />

    <AgentPickerModal
      :open="!!despachadorModal" :order="despachadorModal?.order"
      title="Asignar Despachador" icon="🚚"
      gradient="linear-gradient(135deg,#8E24AA,#4A148C)"
      highlight-bg="#F3E5F5" highlight-color="#8E24AA"
      confirm-label="Confirmar Despachador"
      :agents="warehouseAgents" :agents-loading="agentsLoading"
      :action-loading="!!store.actionLoading"
      @close="despachadorModal = null"
      @confirm="confirmDespachador"
    />

    <AgentPickerModal
      :open="!!empacadorModal" :order="empacadorModal?.order"
      title="Registrar Empaque" icon="📦"
      gradient="linear-gradient(135deg,#E65100,#BF360C)"
      highlight-bg="#FFF3E0" highlight-color="#E65100"
      confirm-label="Empacar"
      :agents="warehouseAgents" :agents-loading="agentsLoading"
      :action-loading="!!store.actionLoading"
      @close="empacadorModal = null"
      @confirm="confirmEmpacador"
    />

    <!-- Modal: Enviar -->
    <ConfirmModal
      :open="!!envioModal" :order="envioModal?.order"
      title="¿Marcar como enviado?" subtitle="El pedido pasará a estatus Entregando"
      icon="🚚" confirm-icon="✓" confirm-label="Sí, enviar"
      gradient="linear-gradient(135deg,#0288D1,#01579B)"
      info-bg="#E3F2FD" info-border="#90CAF9" info-accent="#0288D1"
      :loading="!!store.actionLoading"
      @close="envioModal = null"
      @confirm="confirmEnvio"
    >
      <label style="display:block;">
        <span style="font-size:0.8rem;color:#555;font-weight:600;display:block;margin-bottom:4px;">
          Número de guía <span style="font-weight:400;color:#aaa;">(opcional)</span>
        </span>
        <input v-model="guiaInput" type="text" placeholder="Ej: 123456789012"
               class="input input-bordered input-sm w-full" style="text-transform:uppercase;"
               @input="guiaInput = guiaInput.toUpperCase()" />
      </label>
    </ConfirmModal>

    <!-- Modal: Entregado -->
    <ConfirmModal
      :open="!!deliverModal" :order="deliverModal?.order"
      title="Confirmar entrega" subtitle="El pedido quedará como entregado"
      icon="✅" confirm-icon="✅" confirm-label="Confirmar entrega"
      gradient="linear-gradient(135deg,#388E3C,#1B5E20)"
      info-bg="#F1F8F7" info-border="#C8E6C9" info-accent="#388E3C"
      :show-carrier="false"
      :loading="!!store.actionLoading"
      @close="deliverModal = null"
      @confirm="confirmDeliver"
    >
      <label style="display:block;">
        <span style="font-size:0.8rem;color:#555;font-weight:600;display:block;margin-bottom:4px;">Entregado por</span>
        <input v-model="deliverName" type="text" placeholder="Nombre del responsable"
               class="input input-bordered input-sm w-full" />
      </label>
    </ConfirmModal>

    <!-- Modal: Regresar al asesor -->
    <ConfirmModal
      :open="!!returnModal" :order="returnModal?.order"
      title="Regresar al asesor" subtitle="El turno volverá a manos del asesor"
      icon="↩️" confirm-icon="↩️" confirm-label="Regresar"
      gradient="linear-gradient(135deg,#F57C00,#E65100)"
      info-bg="#FFF8F0" info-border="#FFCC80" info-accent="#F57C00"
      :show-carrier="false"
      :loading="store.actionLoading !== null"
      @close="returnModal = null"
      @confirm="confirmReturn"
    >
      <label style="display:block;">
        <span style="font-size:0.8rem;color:#555;font-weight:600;display:block;margin-bottom:4px;">Motivo (opcional)</span>
        <input v-model="returnReason" type="text" placeholder="Ej: Comprobante no coincide"
               class="input input-bordered input-sm w-full" />
      </label>
    </ConfirmModal>

    <!-- Modal: Guía -->
    <GuiaModal
      :open="!!guiaModal" :order="guiaModal?.order"
      :action-loading="!!store.actionLoading"
      @close="guiaModal = null"
      @confirm="confirmGuia"
    />

    <PrintOrderView ref="printViewRef" />

  </div>
</template>

<style scoped>
.comment-box  { margin-top: 8px; background: #fff; border: 1px dashed #90caf9; border-radius: 8px; padding: 8px 10px; line-height: 1.3; font-size: 0.85rem; }
.comment-text { white-space: pre-wrap; margin-top: 4px; max-height: 80px; overflow-y: auto; word-break: break-word; }
</style>
