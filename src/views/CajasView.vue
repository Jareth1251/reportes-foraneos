<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useForaneosStore } from '@/stores/foraneos'
import PrintOrderView from '@/components/PrintOrderView.vue'

const router  = useRouter()
const auth    = useAuthStore()
const store   = useForaneosStore()

const searchText   = ref('')
const returnModal  = ref(null)
const returnReason = ref('')
const facturarModal = ref(null)
const editErpModal = ref(null)
const editErpValue = ref('')
const editErpError = ref('')
const toast        = ref(null)
const printViewRef = ref(null)

onMounted(async () => {
  await store.fetchCajas()
})

// ── Auth ──────────────────────────────────────────────────────────────────
const cajeraName = computed(() => auth.user?.name ?? auth.user?.username ?? '')

// ── Zonas fijas (igual que React ModalForaneos.js) ────────────────────────
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

// ── Turno global por día (mismo algoritmo que ModalForaneos.js) ───────────
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

// isPendiente: pedido de día anterior (igual que ModalForaneos.js)
function isPendiente(order) {
  if (!order?.created_at) return false
  const day = ymdTZ(order.created_at)
  const st  = String(order?.status || '').toLowerCase()
  return !!day && !!todayYMD.value && day < todayYMD.value && st !== 'entregado' && st !== 'cancelado'
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
  if (mins < 1)  return '0 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function erpList(order) {
  if (Array.isArray(order.erp_group_list) && order.erp_group_list.length) return order.erp_group_list
  return String(order.erp_group_csv ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

function vouchers(order) {
  if (Array.isArray(order.voucher_files) && order.voucher_files.length) return order.voucher_files
  return String(order.voucher_file_url ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

function showVouchers(order) {
  return !Number(order.has_credit_note) && !Number(order.pay_on_delivery) && vouchers(order).length > 0
}

function isPickup(order) {
  return String(order.delivery_mode || '').toLowerCase() === 'pickup' ||
         String(order.carrier || '').toUpperCase() === 'CLIENTE'
}

function carrierLabel(order) {
  return isPickup(order) ? 'Cliente pasa' : (order.carrier || '—')
}

// ── Filtros y agrupación ──────────────────────────────────────────────────
const filtered = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  return store.orders.filter(o => {
    if (!q) return true
    return (
      (o.customer_name ?? '').toLowerCase().includes(q) ||
      (o.erp_order_id  ?? '').toLowerCase().includes(q) ||
      (o.carrier       ?? '').toLowerCase().includes(q)
    )
  })
})

// Solo agrupa 'aplicando pago' — igual que React filtra statusToFetch=['aplicando pago'] antes de agrupar
const groupsMap = computed(() => {
  const map = { VNAH: [], VDEP: [], VIDD: [], VYIS: [] }
  for (const o of filtered.value) {
    if ((o.status ?? '').toLowerCase().trim() !== 'aplicando pago') continue
    map[zoneByCarrier(o)].push(o)
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => {
      const pa = isPendiente(a) ? 0 : 1, pb = isPendiente(b) ? 0 : 1
      if (pa !== pb) return pa - pb
      return new Date(a.created_at) - new Date(b.created_at)
    })
  }
  return map
})

const activeGroup = ref('VNAH')

// Ya están pre-filtrados a 'aplicando pago', no hace falta filtrar de nuevo
const visibleOrders = computed(() => {
  if (!activeGroup.value) return []
  return groupsMap.value[activeGroup.value] ?? []
})

// ── Acciones ──────────────────────────────────────────────────────────────
function showToast(type, message) {
  toast.value = { type, message }
  setTimeout(() => (toast.value = null), 3500)
}

function openFacturarModal(order) {
  facturarModal.value = { order }
}
async function confirmFacturar() {
  const { order } = facturarModal.value
  facturarModal.value = null
  const esClientePasa = zoneByCarrier(order) === 'VYIS'
  const res = esClientePasa
    ? await store.pickupAndSend(order.id, {
        checkin_status: 'agendado',
        usr_agendado:   auth.user?.username ?? 'VWEB',
        site:           order.pickup_branch || auth.user?.site || '3000',
      })
    : await store.facturar(order.id, {
        facturado_por:      auth.user?.username ?? '',
        facturado_por_name: auth.user?.name     ?? '',
      })
  if (res.ok) {
    showToast('success', esClientePasa
      ? `Pedido ${order.erp_order_id} enviado a checkin`
      : `Pedido ${order.erp_order_id} facturado`)
    await store.fetchCajas()
  } else showToast('error', res.message)
}

function openReturnModal(order) {
  returnModal.value  = { order }
  returnReason.value = ''
}
async function confirmReturn() {
  const { order } = returnModal.value
  const res = await store.returnToAdvisor(order.id, returnReason.value || 'Sin motivo')
  returnModal.value = null
  if (res.ok) { showToast('success', 'Turno regresado al asesor'); await store.fetchCajas() }
  else showToast('error', res.message)
}

function openVoucher(url) { window.open(url, '_blank') }

function openEditErpModal(order) {
  editErpModal.value = { order }
  editErpValue.value = ''
  editErpError.value = ''
}
async function confirmEditErp() {
  const { order } = editErpModal.value
  const newErp = editErpValue.value.trim().toUpperCase()
  if (!newErp) { editErpError.value = 'El número de pedido no puede estar vacío'; return }
  if (newErp === String(order.erp_order_id || '').trim().toUpperCase()) {
    editErpError.value = 'El nuevo pedido es igual al actual'; return
  }
  const res = await store.mergeErp(order.id, newErp)
  editErpModal.value = null
  if (res.ok) { showToast('success', `${order.erp_order_id} → ${newErp}`); await store.fetchCajas() }
  else showToast('error', res.message)
}

function fmtFecha(ts) {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(ts))
}

function buildPrintOrders(item, turn) {
  const allDetails = item.all_order_details || []
  const orderedIds = [item.erp_order_id, ...(item.erp_group_list || [])]
  return orderedIds.map(erpId => {
    const snap = allDetails.find(d => d.erp_order_id === erpId) || {}
    return {
      numeroPedido : erpId,
      remision     : item.remision || '',
      cliente      : item.customer_name,
      vendedor     : item.sales_person || snap.order_salesperson || '',
      comentarios  : item.advisor_comment || snap.order_remarks || '',
      direccion    : snap.order_address || '',
      fecha        : fmtFecha(item.created_at),
      status       : item.status,
      subtotal     : snap.snapshot_subtotal || '',
      iva          : snap.snapshot_iva      || '',
      total        : snap.snapshot_total    || '',
      invoice      : item.invoice_id        || '',
      turn,
      articulos    : Array.isArray(snap.order_detail) ? snap.order_detail : [],
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
      <!-- Izquierda: título + Actualizar -->
      <div class="navbar-start gap-2 flex items-center">
        <button @click="router.push({ name: 'selector' })"
                style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:6px;border:none;cursor:pointer;font-size:0.95rem;font-weight:700;background-color:#1565C0;color:#fff;">
          ← Módulos
        </button>
        <span style="font-weight:700;padding:4px 12px;border-radius:8px;color:#E65100;background:#FFE0B2;font-size:1.2rem;line-height:1.2;">Pedidos Foráneos</span>
        <button
          :disabled="store.loading"
          @click="store.fetchCajas()"
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
      <!-- Centro: buscador -->
      <div class="navbar-center">
        <input v-model="searchText" type="search" placeholder="Buscar cliente, pedido o paquetería..."
               class="input input-bordered input-sm w-72" />
      </div>
      <!-- Derecha: avatar -->
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

      <!-- Cajera / zona activa (igual que React) -->
      <div v-if="activeGroup" class="text-center mb-3" style="font-size:18px;font-weight:700;">
        Cajera: {{ cajeraName }} · {{ ZONE_MAP[activeGroup]?.label }}
      </div>

      <!-- Tabs de zonas - estilo .filter-group / .filter-btn del original -->
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

      <!-- Grid de pedidos (.modal-grid en React) -->
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

            <!-- Nombre cliente (bold) -->
            <p style="font-weight:bold;font-size:1rem;margin-bottom:0.5rem;">{{ order.customer_name }}</p>

            <!-- ERP ID -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <p style="margin:0;font-weight:bold;">{{ order.erp_order_id }}</p>
              <button
                v-if="erpList(order).length > 0"
                @click="openEditErpModal(order)"
                title="Cambiar número de pedido al consolidar PC"
                style="padding:3px 10px;font-size:11px;font-weight:700;border-radius:4px;border:1px solid #1565C0;background-color:#E3F2FD;color:#1565C0;cursor:pointer;white-space:nowrap;"
              >
                ✏️ PC
              </button>
            </div>

            <!-- Hora de registro -->
            <div style="margin-top:2px;font-size:12px;color:#6b7280;">
              🕒 <b>Hora de registro:</b> {{ fmtHora(order.created_at) }}
            </div>

            <!-- Pedidos consolidados -->
            <div style="margin-top:6px;">
              <div style="font-size:12px;color:#666;">Pedidos ({{ erpList(order).length }})</div>
              <div v-if="erpList(order).length" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
                <span v-for="erp in erpList(order)" :key="erp" class="erp-badge">
                  {{ erp }}
                </span>
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

            <!-- Datos fiscales (.tax-info de shared.css) -->
            <div v-if="Number(order.invoice_required) && (order.tax_regimen || order.cfdi_use)"
                 class="tax-info">
              <div v-if="order.tax_regimen"><b>Régimen:</b> {{ order.tax_regimen }}</div>
              <div v-if="order.cfdi_use"><b>Uso CFDI:</b> {{ order.cfdi_use }}</div>
            </div>

            <!-- Comentario asesor (.comment-box de shared.css) -->
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

            <!-- Botones acción (.flex-wrap de CajasCard.js) -->
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
              <button @click="handlePrint(order)"
                      style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#1976d2;color:#fff;">
                🖨️ Imprimir
              </button>
              <button
                :disabled="store.actionLoading === order.id"
                @click="openFacturarModal(order)"
                style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#00796B;color:#fff;"
              >
                <span v-if="store.actionLoading === order.id" class="loading loading-spinner loading-xs"></span>
                📦 Facturar
              </button>
              <button @click="openReturnModal(order)"
                      :disabled="store.actionLoading === order.id"
                      style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:0.85rem;background-color:#ff9800;color:#fff;">
                ↩️ Regresar
              </button>
            </div>

          </div>
        </div>

        <!-- Sin pedidos aplicando pago en esta zona -->
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

    <!-- Modal: Confirmar Facturar -->
    <dialog :open="!!facturarModal" class="modal modal-bottom sm:modal-middle">
      <div v-if="facturarModal" class="modal-box p-0 overflow-hidden" style="max-width:420px;border-radius:16px;">
        <!-- Header verde -->
        <div style="background:linear-gradient(135deg,#00796B,#004D40);padding:24px 24px 20px;text-align:center;">
          <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:26px;">
            📦
          </div>
          <h3 style="color:#fff;font-size:1.1rem;font-weight:700;margin:0;">¿Marcar como facturado?</h3>
          <p style="color:rgba(255,255,255,0.75);font-size:0.8rem;margin:4px 0 0;">Esta acción moverá el pedido a Almacén</p>
        </div>

        <!-- Cuerpo -->
        <div style="padding:20px 24px;">
          <div style="background:#F1F8F7;border:1px solid #B2DFDB;border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.78rem;color:#555;">Pedido</span>
              <span style="font-weight:700;color:#00796B;font-size:0.95rem;">{{ facturarModal.order.erp_order_id }}</span>
            </div>
            <div style="border-top:1px solid #C8E6C9;margin:2px 0;"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.78rem;color:#555;">Cliente</span>
              <span style="font-weight:600;color:#222;font-size:0.88rem;text-align:right;max-width:220px;">{{ facturarModal.order.customer_name }}</span>
            </div>
            <div v-if="facturarModal.order.carrier" style="border-top:1px solid #C8E6C9;margin:2px 0;"></div>
            <div v-if="facturarModal.order.carrier" style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.78rem;color:#555;">Paquetería</span>
              <span style="font-size:0.85rem;color:#333;">{{ facturarModal.order.carrier }}</span>
            </div>
          </div>
        </div>

        <!-- Botones -->
        <div style="padding:0 24px 20px;display:flex;gap:10px;">
          <button
            @click="facturarModal = null"
            style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:0.88rem;color:#555;font-weight:600;"
          >Cancelar</button>
          <button
            :disabled="store.actionLoading !== null"
            @click="confirmFacturar"
            style="flex:1;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,#00796B,#004D40);color:#fff;cursor:pointer;font-size:0.88rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;"
          >
            <span v-if="store.actionLoading" class="loading loading-spinner loading-xs"></span>
            <span v-else>✓</span>
            Confirmar
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button @click="facturarModal = null">cerrar</button></form>
    </dialog>

    <!-- Modal: Regresar al asesor -->
    <dialog :open="!!returnModal" class="modal modal-bottom sm:modal-middle">
      <div class="modal-box" v-if="returnModal">
        <h3 class="font-bold text-base mb-3">Regresar turno al asesor</h3>
        <p class="text-sm text-base-content/60 mb-3">
          Pedido: <b>{{ returnModal.order.erp_order_id }}</b> — {{ returnModal.order.customer_name }}
        </p>
        <label class="form-control w-full">
          <div class="label"><span class="label-text text-sm">Motivo (opcional)</span></div>
          <input v-model="returnReason" type="text" placeholder="Ej: Falta información fiscal"
                 class="input input-bordered input-sm w-full" />
        </label>
        <div class="modal-action">
          <button class="btn btn-ghost btn-sm" @click="returnModal = null">Cancelar</button>
          <button class="btn btn-warning btn-sm" :disabled="store.actionLoading !== null" @click="confirmReturn">
            <span v-if="store.actionLoading" class="loading loading-spinner loading-xs"></span>
            Confirmar
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button @click="returnModal = null">cerrar</button></form>
    </dialog>

    <!-- Modal: Editar PC (pedido consolidado) -->
    <dialog :open="!!editErpModal" class="modal modal-bottom sm:modal-middle">
      <div class="modal-box" v-if="editErpModal">
        <h3 class="font-bold text-base mb-3">Cambiar pedido ERP</h3>
        <p class="text-sm text-base-content/60 mb-1">
          <b>Cliente:</b> {{ editErpModal.order.customer_name || '—' }}
        </p>
        <p class="text-sm text-base-content/60 mb-3">
          <b>Pedido actual:</b> {{ editErpModal.order.erp_order_id || '—' }}
        </p>
        <label class="form-control w-full">
          <div class="label"><span class="label-text text-sm">Nuevo número de pedido consolidado (PC)</span></div>
          <input v-model="editErpValue" type="text" placeholder="Ej: P421500"
                 style="text-transform:uppercase;"
                 class="input input-bordered input-sm w-full" />
        </label>
        <p v-if="editErpError" class="text-error text-xs mt-1">{{ editErpError }}</p>
        <div class="modal-action">
          <button class="btn btn-ghost btn-sm" @click="editErpModal = null">Cancelar</button>
          <button class="btn btn-primary btn-sm" :disabled="store.actionLoading !== null" @click="confirmEditErp">
            <span v-if="store.actionLoading" class="loading loading-spinner loading-xs"></span>
            Guardar
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button @click="editErpModal = null">cerrar</button></form>
    </dialog>

  </div>
</template>

<style scoped>
/* ── TurnoHeader (shared.css de React) ──────────────────────────────────── */
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

/* Chip PENDIENTE dentro del turno-badge */
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

/* ── ERP badge (pill, shared.css) ───────────────────────────────────────── */
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

/* ── Tax info box (.tax-info de shared.css) ─────────────────────────────── */
.tax-info {
  margin-top: 6px;
  background: #fff;
  border: 1px dashed #ffcc80;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: #5d4037;
}

/* ── Comment box (.comment-box de shared.css) ───────────────────────────── */
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

/* ── Animaciones ─────────────────────────────────────────────────────────── */
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
