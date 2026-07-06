<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useForaneosStore } from '@/stores/foraneos'
import PrintOrderView from '@/components/PrintOrderView.vue'

const router = useRouter()
if (!sessionStorage.getItem('foraneos_module_chosen')) {
  router.replace({ name: 'selector' })
}

const auth  = useAuthStore()
const store = useForaneosStore()

// ── Filtros ───────────────────────────────────────────────────────────────
const searchText = ref('')
const dateFrom   = ref('')
const dateTo     = ref('')

// ── Modales ───────────────────────────────────────────────────────────────
const erpModal       = ref(null)  // { order, mode: 'update'|'merge' }
const erpInput       = ref('')
const surtidorModal  = ref(null)  // { order }
const surtidorName   = ref('')
const deliverModal   = ref(null)  // { order }
const deliverCarrier = ref('')
const deliverGuia    = ref('')
const guiaModal      = ref(null)  // { order }
const guiaInput      = ref('')
const invoiceModal   = ref(null)  // { order }
const invoiceInput   = ref('')
const fiscalModal    = ref(null)  // { order }
const fiscalRfc      = ref('')
const fiscalRegimen  = ref('')
const fiscalCfdi     = ref('')
const toast          = ref(null)


// ── Auth ─────────────────────────────────────────────────────────────────
const dept      = computed(() => String(auth.user?.departmentId ?? auth.user?.department_id ?? '').trim())
const isGerente = computed(() => dept.value === '001' || dept.value === '002')
const myUsername = computed(() => auth.user?.username ?? auth.user?.sales_person_id ?? '')
const myName     = computed(() => auth.user?.name ?? '')

// ── Zonas fijas (igual que React) ────────────────────────────────────────
const ZONES = [
  { key: 'VNAH', label: 'Foráneos',     color: '#00796B', icon: '🏷️' },
  { key: 'VDEP', label: 'Saltillo',     color: '#F57C00', icon: '🏠' },
  { key: 'VIDD', label: 'Domicilio',    color: '#9C27B0', icon: '🏠' },
  { key: 'VYIS', label: 'Cliente_pasa', color: '#7B1FA2', icon: '🏬' },
]
const ZONE_MAP = Object.fromEntries(ZONES.map(z => [z.key, z]))

function zoneByCarrier(order) {
  const c = (order?.carrier ?? '').toString().trim().toLowerCase()
  if (c === 'saltillo') return 'VDEP'
  if (c === 'domicilio') return 'VIDD'
  if (c === 'cliente_pasa' || c === 'cliente-pasa' || c === 'cliente pasa' ||
      (c.includes('cliente') && c.includes('pasa'))) return 'VYIS'
  return 'VNAH'
}

function zoneMeta(key) { return ZONE_MAP[key] }

const STATUS_COLOR = {
  'aplicando pago': '#F59E0B',
  'facturado':      '#06B6D4',
  'surtiendo':      '#A855F7',
  'surtido':        '#10B981',
  'empacando':      '#3B82F6',
  'enviado':        '#22C55E',
  'entregado':      '#6B7280',
}

// ── Carga ────────────────────────────────────────────────────────────────
async function load(useDates = false) {
  const params = {}
  if (useDates && dateFrom.value) params.from = dateFrom.value
  if (useDates && dateTo.value)   params.to   = dateTo.value
  await store.fetchForaneos(params)
}

onMounted(async () => {
  await load()
})

// ── Turno global por día (mismo algoritmo que React) ─────────────────────
function ymdTZ(dateLike) {
  try {
    const parts = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(dateLike))
    const y = parts.find(p => p.type === 'year')?.value
    const m = parts.find(p => p.type === 'month')?.value
    const d = parts.find(p => p.type === 'day')?.value
    return `${y}-${m}-${d}`
  } catch { return null }
}

const turnoMap = computed(() => {
  const list = store.orders
    .filter(o => o?.created_at && String(o.status).toLowerCase() !== 'cancelado')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const counters = {}
  const map = {}
  for (const o of list) {
    const day = ymdTZ(o.created_at)
    if (!day) continue
    counters[day] = (counters[day] || 0) + 1
    map[o.id] = counters[day]
  }
  return map
})

function getTurno(order) { return turnoMap.value[order?.id] ?? '—' }

const todayYMD = computed(() => ymdTZ(Date.now()))

function isPendiente(order) {
  if (!order?.created_at) return false
  const day = ymdTZ(order.created_at)
  const st  = String(order?.status || '').toLowerCase()
  return !!day && !!todayYMD.value && day < todayYMD.value && st !== 'entregado' && st !== 'cancelado'
}

function carrierLabel(order) {
  return isPickup(order) ? 'Cliente pasa' : (order.carrier || '—')
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtHora(ts) {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(ts))
}

function timeSince(ts) {
  if (!ts) return '—'
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function erpList(order) {
  const groups = Array.isArray(order.erp_group_list) && order.erp_group_list.length
    ? order.erp_group_list
    : String(order.erp_group_csv ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return groups
}

function vouchers(order) {
  if (Array.isArray(order.voucher_files) && order.voucher_files.length) return order.voucher_files
  return String(order.voucher_file_url ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

function showVouchers(order) {
  return !Number(order.has_credit_note) && !Number(order.pay_on_delivery) && vouchers(order).length > 0
}

function isPickup(order) {
  return String(order.delivery_mode ?? '').toLowerCase() === 'pickup' ||
         String(order.carrier ?? '').toUpperCase() === 'CLIENTE'
}

function openVoucher(url) { window.open(url, '_blank') }

// ── Agrupación ───────────────────────────────────────────────────────────
const filtered = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  return store.orders.filter(o => {
    if (!q) return true
    return (
      (o.customer_name ?? '').toLowerCase().includes(q) ||
      (o.erp_order_id  ?? '').toLowerCase().includes(q) ||
      (o.sales_person  ?? '').toLowerCase().includes(q) ||
      (o.assigned_to   ?? '').toLowerCase().includes(q)
    )
  })
})

const groupsMap = computed(() => {
  const map = { VNAH: [], VDEP: [], VIDD: [], VYIS: [] }
  for (const o of filtered.value) {
    map[zoneByCarrier(o)].push(o)
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }
  return map
})

const activeGroup = ref('VNAH')

const visibleOrders = computed(() => {
  if (!activeGroup.value) return []
  return groupsMap.value[activeGroup.value] ?? []
})

// ── Acciones ──────────────────────────────────────────────────────────────
function showToast(type, message) {
  toast.value = { type, message }
  setTimeout(() => (toast.value = null), 3500)
}

async function run(res) {
  if (res.ok) { showToast('success', 'Listo'); await load(false) }
  else         showToast('error', res.message)
}

// ERP
function openErpModal(order, mode = 'update') {
  erpModal.value = { order, mode }
  erpInput.value = mode === 'merge' ? '' : (order.erp_order_id ?? '')
}
async function confirmErp() {
  const { order, mode } = erpModal.value
  if (!erpInput.value.trim()) return
  const res = mode === 'merge'
    ? await store.mergeErp(order.id, erpInput.value.trim())
    : await store.updateErp(order.id, erpInput.value.trim())
  erpModal.value = null
  await run(res)
}

// Surtidor
function openSurtidorModal(order) { surtidorModal.value = { order }; surtidorName.value = '' }
async function confirmSurtidor() {
  const { order } = surtidorModal.value
  if (!surtidorName.value.trim()) return
  const res = await store.assignSurtidor(order.id, myUsername.value, surtidorName.value.trim())
  surtidorModal.value = null
  await run(res)
}

// Pack
async function handlePack(order) { await run(await store.pack(order.id, myUsername.value, myName.value)) }

// Deliver
function openDeliverModal(order) {
  deliverModal.value   = { order }
  deliverCarrier.value = order.carrier ?? ''
  deliverGuia.value    = order.guia ?? ''
}
async function confirmDeliver() {
  const { order } = deliverModal.value
  const res = await store.deliver(order.id, {
    carrier:           deliverCarrier.value.trim() || undefined,
    invoice_id:        order.invoice_id            || undefined,
    guia:              deliverGuia.value.trim()    || undefined,
    delivered_by_name: myName.value,
  })
  deliverModal.value = null
  await run(res)
}

async function handleEntregado(order) {
  await run(await store.deliver(order.id, {
    carrier:           order.carrier    || undefined,
    invoice_id:        order.invoice_id || undefined,
    guia:              order.guia       || undefined,
    delivered_by_name: myName.value,
  }))
}

// Guía
function openGuiaModal(order) { guiaModal.value = { order }; guiaInput.value = order.guia ?? '' }
async function confirmGuia() {
  const { order } = guiaModal.value
  guiaModal.value = null
  await run(await store.updateGuia(order.id, guiaInput.value.trim()))
}

// Factura
function openInvoiceModal(order) { invoiceModal.value = { order }; invoiceInput.value = order.invoice_id ?? '' }
async function confirmInvoice() {
  const { order } = invoiceModal.value
  if (!invoiceInput.value.trim()) return
  invoiceModal.value = null
  await run(await store.setInvoice(order.id, invoiceInput.value.trim()))
}

// Fiscal
function openFiscalModal(order) {
  fiscalModal.value  = { order }
  fiscalRfc.value    = order.rfc ?? ''
  fiscalRegimen.value = order.tax_regimen ?? ''
  fiscalCfdi.value   = order.cfdi_use ?? ''
}
async function confirmFiscal() {
  const { order } = fiscalModal.value
  fiscalModal.value = null
  await run(await store.updateFiscal(order.id, {
    rfc:         fiscalRfc.value.trim()     || undefined,
    tax_regimen: fiscalRegimen.value.trim() || undefined,
    cfdi_use:    fiscalCfdi.value.trim()    || undefined,
  }))
}

// Pasa tienda
async function handlePasaTienda(order) {
  if (!confirm(`¿Mover pedido ${order.erp_order_id} a tienda?`)) return
  await run(await store.pasaTienda(order.id))
}

// Imprimir (igual que CajasView)
const printViewRef = ref(null)
function fmtFecha(ts) {
  if (!ts) return ''
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(ts))
}
function buildPrintOrders(item, turn) {
  const allDetails = item.all_order_details || []
  const orderedIds = [item.erp_order_id, ...(item.erp_group_list || [])]
  return orderedIds.map(erpId => {
    const snap = allDetails.find(d => d.erp_order_id === erpId) || {}
    return {
      numeroPedido: erpId, remision: item.remision || '',
      cliente: item.customer_name, vendedor: item.sales_person || snap.order_salesperson || '',
      comentarios: item.advisor_comment || snap.order_remarks || '',
      direccion: snap.order_address || '', fecha: fmtFecha(item.created_at),
      status: item.status, subtotal: snap.snapshot_subtotal || '',
      iva: snap.snapshot_iva || '', total: snap.snapshot_total || '',
      invoice: item.invoice_id || '', turn,
      articulos: Array.isArray(snap.order_detail) ? snap.order_detail : [],
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
  <div class="min-h-screen bg-gray-100" style="font-family: sans-serif;">

    <!-- Navbar -->
    <div class="navbar bg-white shadow-sm px-4 sticky top-0 z-30">
      <div class="navbar-start gap-2 flex items-center">
        <button @click="router.push({ name: 'selector' })"
                style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:6px;border:none;cursor:pointer;font-size:0.95rem;font-weight:700;background-color:#1565C0;color:#fff;">
          ← Módulos
        </button>
        <span style="font-weight:700;padding:4px 12px;border-radius:8px;color:#E65100;background:#FFE0B2;font-size:1.2rem;line-height:1.2;">Pedidos Foráneos</span>
        <button
          :disabled="store.loading"
          @click="load(false)"
          style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#FFA000;color:#fff;"
        >
          <span v-if="store.loading" class="loading loading-spinner loading-xs"></span>
          <span v-else>🔄</span>
          Actualizar
        </button>
        <span v-if="store.lastFetch" class="text-xs text-gray-400 hidden md:block">
          Última act. {{ fmtHora(store.lastFetch) }}
        </span>
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

      <!-- Filtro de fechas (solo Gerencia) -->
      <div v-if="isGerente" style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap;">
        <input v-model="dateFrom" type="date" class="input input-bordered input-sm" />
        <input v-model="dateTo"   type="date" class="input input-bordered input-sm" />
        <button class="btn btn-primary btn-sm" @click="load(true)">Filtrar</button>
      </div>

      <!-- Subheader: usuario / zona activa -->
      <div v-if="activeGroup" class="text-center mb-3" style="font-size:18px;font-weight:700;">
        {{ myName }} · {{ ZONE_MAP[activeGroup]?.label }}
      </div>

      <!-- Tabs de zonas -->
      <div style="display:flex;justify-content:space-around;margin-bottom:20px;gap:10px;flex-wrap:wrap;">
        <button
          v-for="zone in ZONES"
          :key="zone.key"
          @click="activeGroup = activeGroup === zone.key ? null : zone.key"
          style="flex:1;min-width:100px;padding:10px;font-weight:bold;color:white;border:none;border-radius:6px;cursor:pointer;transition:opacity 0.2s;"
          :style="{
            backgroundColor: zone.color,
            opacity: activeGroup === null || activeGroup === zone.key ? 1 : 0.5
          }"
        >
          {{ zone.icon }} {{ zone.label }} ({{ groupsMap[zone.key].length }})
        </button>
      </div>

      <!-- Skeleton -->
      <div v-if="store.loading && store.orders.length === 0"
           style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;">
        <div v-for="n in 4" :key="n" class="animate-pulse"
             style="background:#f0f0f0;border-radius:8px;height:200px;"></div>
      </div>

      <!-- Grid de pedidos -->
      <div v-else-if="activeGroup"
           style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;">

        <div
          v-for="order in visibleOrders"
          :key="order.id"
          style="border:1px solid #ddd;border-radius:8px;padding:1rem;background-color:#fafafa;box-shadow:0 2px 4px rgba(0,0,0,0.1);font-size:0.9rem;position:relative;word-wrap:break-word;"
        >
          <!-- TurnoHeader fila superior -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div :class="['turno-badge', isPendiente(order) ? 'pend' : '']" style="background-color:#1976d2;color:#fff;">
              <span v-if="isPendiente(order)" class="pending-badge pending-blink">PENDIENTE</span>
              <span>Turno {{ getTurno(order) }}</span>
            </div>
            <div style="color:#333;font-size:0.9rem;font-weight:bold;">⏱ {{ timeSince(order.created_at) }}</div>
          </div>

          <div>
            <!-- Nombre cliente -->
            <p style="font-weight:bold;font-size:1rem;margin-bottom:0.5rem;">{{ order.customer_name }}</p>

            <!-- ERP ID -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <p style="margin:0;font-weight:bold;">{{ order.erp_order_id }}</p>
            </div>

            <!-- Hora de registro -->
            <div style="margin-top:2px;font-size:12px;color:#6b7280;">
              🕒 <b>Hora de registro:</b> {{ fmtHora(order.created_at) }}
            </div>

            <!-- Pedidos consolidados -->
            <div style="margin-top:6px;">
              <div style="font-size:12px;color:#666;">Pedidos ({{ erpList(order).length }})</div>
              <div v-if="erpList(order).length" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
                <span v-for="erp in erpList(order)" :key="erp" class="erp-badge">{{ erp }}</span>
              </div>
            </div>

            <!-- Vendedor -->
            <p style="margin-top:8px;"><b>Vendedor:</b> {{ order.sales_person || 'No asignado' }}</p>

            <!-- Paquetería + badge Factura -->
            <p style="margin:0;">
              <strong>Paquetería:</strong> {{ carrierLabel(order) }}
              <span v-if="Number(order.invoice_required)"
                    style="margin-left:8px;padding:2px 6px;background:#ffe0b2;color:#bf360c;border-radius:6px;font-size:11px;">
                Factura
              </span>
            </p>

            <!-- Datos fiscales -->
            <div v-if="Number(order.invoice_required) && (order.tax_regimen || order.cfdi_use)"
                 class="tax-info">
              <div v-if="order.tax_regimen"><b>Régimen:</b> {{ order.tax_regimen }}</div>
              <div v-if="order.cfdi_use"><b>Uso CFDI:</b> {{ order.cfdi_use }}</div>
            </div>

            <!-- Comentario asesor -->
            <div v-if="order.advisor_comment?.trim()" class="comment-box">
              <strong>Comentario:</strong>
              <div class="comment-text">{{ order.advisor_comment }}</div>
            </div>

            <!-- Piezas -->
            <div v-if="order.quantity > 0" style="margin-top:8px;font-size:12px;color:#555;">
              📦 <b>Piezas:</b> {{ order.quantity }}
            </div>

            <!-- Badges crédito / contra-entrega + comprobantes -->
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
              <span v-if="Number(order.has_credit_note)"
                    style="display:inline-block;background-color:#455A64;color:#fff;padding:6px 10px;border-radius:5px;font-weight:bold;">
                💳 Cliente con crédito
              </span>
              <span v-if="Number(order.pay_on_delivery)"
                    style="display:inline-block;background-color:#2E7D32;color:#fff;padding:6px 10px;border-radius:5px;font-weight:bold;">
                💵 Pago contra entrega
              </span>
              <template v-if="showVouchers(order)">
                <button v-if="vouchers(order).length === 1"
                        @click="openVoucher(vouchers(order)[0])"
                        style="padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background-color:#1976d2;color:#fff;font-size:0.85rem;">
                  📎 Ver comprobante
                </button>
                <div v-else style="position:relative;" class="dropdown">
                  <button tabindex="0"
                          style="padding:6px 12px;border-radius:4px;border:none;cursor:pointer;background-color:#1976d2;color:#fff;font-size:0.85rem;">
                    📎 Comprobantes ({{ vouchers(order).length }})
                  </button>
                  <ul tabindex="0" class="dropdown-content menu menu-xs bg-base-100 rounded-box shadow border border-base-300 z-10 w-48 p-1" style="top:110%;left:0;">
                    <li v-for="(url, i) in vouchers(order)" :key="i">
                      <a @click="openVoucher(url)">📄 Comprobante {{ i + 1 }}</a>
                    </li>
                  </ul>
                </div>
              </template>
            </div>

            <!-- Botones acción: solo Imprimir -->
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
              <button @click="handlePrint(order)"
                      style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#1976d2;color:#fff;">
                🖨️ Imprimir
              </button>
            </div>

          </div>
        </div>

        <!-- Sin pedidos en esta zona -->
        <div v-if="visibleOrders.length === 0 && !store.loading"
             style="grid-column:1/-1;text-align:center;color:#aaa;padding:40px 0;font-style:italic;">
          Sin pedidos <b>aplicando pago</b> en esta zona
        </div>
      </div>

      <!-- Sin zona seleccionada -->
      <div v-else-if="!store.loading" style="text-align:center;color:#aaa;padding:60px 0;">
        Selecciona una paquetería para ver los pedidos
      </div>

    </div>

    <!-- Toast -->
    <div class="toast toast-end z-50" v-if="toast">
      <div class="alert text-sm" :class="toast.type === 'error' ? 'alert-error' : 'alert-success'">
        <span>{{ toast.message }}</span>
      </div>
    </div>

    <!-- Print -->
    <PrintOrderView ref="printViewRef" />

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
.turno-badge.pend {
  animation: pulse-bg 1.4s ease-in-out infinite;
}
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
.pending-blink {
  animation: blink-pend 1.2s ease-in-out infinite;
}
.erp-badge {
  background: #E3F2FD;
  color: #0D47A1;
  border: 1px solid #90CAF9;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 1.6;
  display: inline-flex;
  align-items: center;
}
.tax-info {
  margin-top: 6px;
  background: #fff;
  border: 1px dashed #ffcc80;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: #5d4037;
}
.comment-box {
  margin-top: 8px;
  background: #fff;
  border: 1px dashed #90caf9;
  border-radius: 8px;
  padding: 8px 10px;
  line-height: 1.3;
  font-size: 0.85rem;
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
  50%       { opacity: 0.3; }
}
@keyframes pulse-bg {
  0%   { filter: brightness(1); }
  50%  { filter: brightness(1.25); }
  100% { filter: brightness(1); }
}
</style>
