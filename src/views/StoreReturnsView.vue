<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import ExcelJS from 'exceljs'
import { useAuthStore } from '@/stores/auth'
import { styleHeaderRow, downloadWorkbook } from '@/utils/excelExport'
import {
  RETURN_REASONS,
  lookupOrder,
  listStoreReturns,
  createStoreReturn,
  deleteStoreReturn,
  apiErrorMessage,
} from '@/services/storeReturns'

// Devoluciones de tienda (solo almacén, depto 007). Reemplaza la hoja
// "DEVOLUCIONES TIENDA": se captura el número de pedido, QAD trae vendedor,
// cliente, factura y productos, y aquí solo se anotan piezas y motivo.

const router = useRouter()
if (!sessionStorage.getItem('foraneos_module_chosen')) {
  router.replace({ name: 'selector' })
}

const auth = useAuthStore()

function toIsoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function weekRange(offsetWeeks = 0) {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + offsetWeeks * 7)
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  return { from: toIsoDate(monday), to: toIsoDate(sunday) }
}

function formatDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function formatQty(qty) {
  return Number.isInteger(Number(qty)) ? Number(qty) : Number(qty).toFixed(2)
}

function productLabel(item) {
  return [item.product_code, item.color].filter(Boolean).join(' ')
}

// "CRDRYCAB-S" → modelo "CRDRYCAB", talla "S". Si el código no trae talla
// después del último guion, se usa el campo size de QAD.
function splitCode(item) {
  const code = String(item.product_code || item.product_name || '')
  const dash = code.lastIndexOf('-')
  if (dash > 0) return { model: code.slice(0, dash), size: code.slice(dash + 1) }
  return { model: code, size: item.size || '' }
}

// Agrupa partidas por modelo + color para que un pedido largo quepa en pocas
// líneas: "CRDRYCAB VINO · S 18 · M 30 · L 18".
function groupItems(items) {
  const groups = new Map()
  for (const item of items) {
    const { model, size } = splitCode(item)
    const key = `${model}|${item.color || ''}`
    if (!groups.has(key)) groups.set(key, { key, label: [model, item.color].filter(Boolean).join(' '), sizes: [], total: 0 })
    const group = groups.get(key)
    group.sizes.push({ size, quantity: Number(item.quantity) })
    group.total += Number(item.quantity)
  }
  return [...groups.values()]
}

function recordPieces(record) {
  return record.items.reduce((sum, item) => sum + Number(item.quantity), 0)
}

const COLLAPSED_GROUPS = 2
const expandedIds = ref(new Set())

function toggleExpanded(id) {
  const next = new Set(expandedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expandedIds.value = next
}

function visibleGroups(record) {
  const groups = groupItems(record.items)
  return expandedIds.value.has(record.id) ? groups : groups.slice(0, COLLAPSED_GROUPS)
}

// ─── Captura ─────────────────────────────────────────────────────────────
const orderInput = ref('')
const searching  = ref(false)
const order      = ref(null)
const saving     = ref(false)

const form = reactive({
  arrivalDate: toIsoDate(new Date()),
  reason: '',
  notes: '',
  quantities: {},
})

const today = toIsoDate(new Date())

function availableQty(line) {
  return Math.max(0, Number(line.qty_ordered) - Number(line.qty_returned))
}

const selectedItems = computed(() => {
  if (!order.value) return []
  return order.value.lines
    .map(line => ({ line: line.line, quantity: Number(form.quantities[line.line] || 0) }))
    .filter(item => item.quantity > 0)
})

const totalPieces = computed(() => selectedItems.value.reduce((sum, item) => sum + item.quantity, 0))

const quantityError = computed(() => {
  if (!order.value) return null
  const over = order.value.lines.find(line => Number(form.quantities[line.line] || 0) > availableQty(line))
  return over ? `${over.product_code}: máximo ${formatQty(availableQty(over))} piezas.` : null
})

const canSave = computed(() =>
  order.value
  && selectedItems.value.length > 0
  && !quantityError.value
  && form.reason
  && (form.reason !== 'otro' || form.notes.trim())
  && form.arrivalDate
  && !saving.value,
)

function resetForm() {
  order.value = null
  form.arrivalDate = toIsoDate(new Date())
  form.reason = ''
  form.notes = ''
  form.quantities = {}
}

async function searchOrder() {
  const id = orderInput.value.trim().toUpperCase()
  if (!id || searching.value) return
  searching.value = true
  resetForm()
  try {
    order.value = await lookupOrder(id)
    orderInput.value = order.value.sales_order_id
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Pedido no encontrado', text: apiErrorMessage(e, 'No se pudo consultar el pedido en QAD.') })
  } finally {
    searching.value = false
  }
}

function returnAll() {
  for (const line of order.value.lines) form.quantities[line.line] = availableQty(line)
}

async function saveReturn() {
  if (!canSave.value) return
  saving.value = true
  try {
    await createStoreReturn({
      sales_order_id: order.value.sales_order_id,
      arrival_date: form.arrivalDate,
      reason: form.reason,
      notes: form.notes.trim() || null,
      items: selectedItems.value,
    })
    Swal.fire({ icon: 'success', title: 'Devolución registrada', timer: 1600, showConfirmButton: false })
    resetForm()
    orderInput.value = ''
    loadReturns()
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'No se pudo registrar', text: apiErrorMessage(e, 'Error al guardar la devolución.') })
  } finally {
    saving.value = false
  }
}

// ─── Listado ─────────────────────────────────────────────────────────────
const filters = reactive({ ...weekRange(0), search: '' })
const returns = ref([])
const loading = ref(false)
const listError = ref(null)

const totals = computed(() => ({
  records: returns.value.length,
  pieces: returns.value.reduce((sum, r) => sum + recordPieces(r), 0),
}))

function setWeek(offset) {
  Object.assign(filters, weekRange(offset))
  loadReturns()
}

async function loadReturns() {
  if (!filters.from || !filters.to) return
  loading.value = true
  listError.value = null
  try {
    returns.value = await listStoreReturns(filters)
  } catch (e) {
    listError.value = apiErrorMessage(e, 'No se pudieron cargar las devoluciones.')
  } finally {
    loading.value = false
  }
}

async function removeReturn(record) {
  const { isConfirmed } = await Swal.fire({
    icon: 'warning',
    title: '¿Eliminar devolución?',
    text: `Pedido ${record.sales_order_id} · ${record.customer_name || ''}`,
    showCancelButton: true,
    confirmButtonText: 'Eliminar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#DC2626',
  })
  if (!isConfirmed) return
  try {
    await deleteStoreReturn(record.id)
    returns.value = returns.value.filter(r => r.id !== record.id)
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'No se pudo eliminar', text: apiErrorMessage(e, 'Error al eliminar.') })
  }
}

async function exportExcel() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Devoluciones')
  ws.columns = [
    { header: 'FECHA LLEGADA', key: 'arrival', width: 14 },
    { header: 'VENDEDOR', key: 'seller', width: 30 },
    { header: 'PRODUCTO', key: 'product', width: 28 },
    { header: 'DESCRIPCIÓN', key: 'description', width: 38 },
    { header: 'PIEZAS', key: 'pieces', width: 9 },
    { header: 'PEDIDO', key: 'order', width: 12 },
    { header: 'FACTURA', key: 'invoice', width: 12 },
    { header: 'CLIENTE', key: 'customer', width: 34 },
    { header: 'MOTIVO DE DEVOLUCIÓN', key: 'reason', width: 24 },
    { header: 'NOTAS', key: 'notes', width: 30 },
    { header: 'REGISTRÓ', key: 'createdBy', width: 22 },
  ]
  for (const record of returns.value) {
    for (const item of record.items) {
      ws.addRow({
        arrival: formatDate(record.arrival_date),
        seller: record.sales_person_name,
        product: productLabel(item),
        description: item.product_name,
        pieces: Number(item.quantity),
        order: record.sales_order_id,
        invoice: record.invoice_id,
        customer: record.customer_name,
        reason: record.reason_label?.toUpperCase(),
        notes: record.notes,
        createdBy: record.created_by_name,
      })
    }
  }
  styleHeaderRow(ws)
  await downloadWorkbook(wb, `Devoluciones_${filters.from}_${filters.to}.xlsx`)
}

onMounted(loadReturns)
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
        <span style="font-weight:700;padding:4px 12px;border-radius:8px;color:#B91C1C;background:#FEE2E2;font-size:1.2rem;line-height:1.2;">
          ↩️ Devoluciones Tienda
        </span>
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

    <div class="p-4" style="max-width:1200px;margin:0 auto;">

      <!-- Captura -->
      <div class="bg-white p-4 mb-4" style="border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h2 class="font-bold text-lg mb-3">Registrar devolución</h2>

        <form class="flex flex-wrap gap-2 items-end" @submit.prevent="searchOrder">
          <label class="form-control">
            <span class="label-text text-xs font-semibold mb-1">Número de pedido</span>
            <input v-model="orderInput" type="text" placeholder="P589697"
                   class="input input-bordered input-sm w-48 uppercase" autofocus />
          </label>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="searching || !orderInput.trim()">
            <span v-if="searching" class="loading loading-spinner loading-xs"></span>
            {{ searching ? 'Buscando en QAD…' : 'Buscar' }}
          </button>
          <button v-if="order" type="button" class="btn btn-sm btn-ghost" @click="resetForm(); orderInput = ''">Limpiar</button>
        </form>

        <template v-if="order">
          <!-- Cabecera del pedido -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
            <div><div class="text-xs text-gray-500">Pedido</div><div class="font-semibold">{{ order.sales_order_id }}</div></div>
            <div><div class="text-xs text-gray-500">Factura</div><div class="font-semibold">{{ order.invoice_id || 'Sin factura' }}</div></div>
            <div><div class="text-xs text-gray-500">Fecha del pedido</div><div class="font-semibold">{{ formatDate(order.order_date) }}</div></div>
            <div><div class="text-xs text-gray-500">Estatus QAD</div><div class="font-semibold">{{ order.status || '—' }}</div></div>
            <div class="md:col-span-2"><div class="text-xs text-gray-500">Vendedor</div><div class="font-semibold">{{ order.sales_person_name || '—' }} <span class="text-gray-400 font-normal">{{ order.sales_person_id }}</span></div></div>
            <div class="md:col-span-2"><div class="text-xs text-gray-500">Cliente</div><div class="font-semibold">{{ order.customer_name || '—' }} <span class="text-gray-400 font-normal">{{ order.customer_id }}</span></div></div>
          </div>

          <div v-if="!order.invoice_id" class="alert alert-warning text-sm mt-3 py-2">
            Este pedido aún no tiene factura en QAD.
          </div>
          <div v-if="order.previous_returns?.length" class="alert alert-info text-sm mt-3 py-2 block">
            Este pedido ya tiene {{ order.previous_returns.length }} devolución(es) registrada(s):
            <span v-for="prev in order.previous_returns" :key="prev.id" class="block">
              {{ formatDate(prev.arrival_date) }} · {{ prev.reason_label }} ·
              {{ formatQty(recordPieces(prev)) }} pzs ·
              {{ groupItems(prev.items).map(g => `${g.label} (${formatQty(g.total)})`).join(', ') }}
            </span>
          </div>

          <!-- Líneas -->
          <div class="overflow-auto mt-4" style="max-height:420px;">
            <table class="table table-sm table-pin-rows">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Descripción</th>
                  <th>Color</th>
                  <th>Talla</th>
                  <th class="text-right">Vendidas</th>
                  <th class="text-right">Ya devueltas</th>
                  <th class="text-right">Piezas devueltas</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in order.lines" :key="line.line">
                  <td class="font-semibold whitespace-nowrap">{{ line.product_code }}</td>
                  <td>{{ line.product_name }}</td>
                  <td>{{ line.color }}</td>
                  <td>{{ line.size }}</td>
                  <td class="text-right">{{ formatQty(line.qty_ordered) }}</td>
                  <td class="text-right" :class="{ 'text-gray-400': !line.qty_returned }">{{ formatQty(line.qty_returned) }}</td>
                  <td class="text-right">
                    <input v-model.number="form.quantities[line.line]" type="number" min="0" :max="availableQty(line)" step="1"
                           :disabled="availableQty(line) <= 0"
                           class="input input-bordered input-xs w-20 text-right"
                           :class="{ 'input-error': Number(form.quantities[line.line] || 0) > availableQty(line) }" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex justify-between items-center mt-1 text-sm">
            <button type="button" class="btn btn-xs btn-ghost" @click="returnAll">Devolver todo lo disponible</button>
            <span>Total: <b>{{ formatQty(totalPieces) }}</b> piezas</span>
          </div>
          <p v-if="quantityError" class="text-error text-sm mt-1">{{ quantityError }}</p>

          <!-- Datos de la devolución -->
          <div class="flex flex-wrap gap-3 mt-4 items-end">
            <label class="form-control">
              <span class="label-text text-xs font-semibold mb-1">Fecha de llegada</span>
              <input v-model="form.arrivalDate" type="date" :max="today" class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs font-semibold mb-1">Motivo de devolución</span>
              <select v-model="form.reason" class="select select-bordered select-sm w-56">
                <option value="" disabled>Selecciona…</option>
                <option v-for="r in RETURN_REASONS" :key="r.key" :value="r.key">{{ r.label }}</option>
              </select>
            </label>
            <label class="form-control flex-1 min-w-[220px]">
              <span class="label-text text-xs font-semibold mb-1">Notas {{ form.reason === 'otro' ? '(obligatorio)' : '(opcional)' }}</span>
              <input v-model="form.notes" type="text" maxlength="500" class="input input-bordered input-sm" />
            </label>
            <button type="button" class="btn btn-sm btn-success text-white" :disabled="!canSave" @click="saveReturn">
              <span v-if="saving" class="loading loading-spinner loading-xs"></span>
              Registrar devolución
            </button>
          </div>
        </template>
      </div>

      <!-- Listado -->
      <div class="bg-white p-4" style="border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div class="flex flex-wrap gap-2 items-end mb-3">
          <h2 class="font-bold text-lg mr-auto">Devoluciones registradas</h2>
          <button class="btn btn-xs" @click="setWeek(0)">Esta semana</button>
          <button class="btn btn-xs" @click="setWeek(-1)">Semana pasada</button>
          <input v-model="filters.from" type="date" class="input input-bordered input-xs" />
          <input v-model="filters.to" type="date" class="input input-bordered input-xs" />
          <input v-model="filters.search" type="text" placeholder="Pedido, factura, cliente, vendedor"
                 class="input input-bordered input-xs w-56" @keyup.enter="loadReturns" />
          <button class="btn btn-xs btn-primary" :disabled="loading" @click="loadReturns">
            <span v-if="loading" class="loading loading-spinner loading-xs"></span>
            Actualizar
          </button>
          <button class="btn btn-xs btn-success text-white" :disabled="!returns.length" @click="exportExcel">Excel</button>
        </div>

        <p v-if="listError" class="text-error text-sm">{{ listError }}</p>
        <p class="text-xs text-gray-500 mb-2">{{ totals.records }} devoluciones · {{ formatQty(totals.pieces) }} piezas</p>

        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Fecha llegada</th>
                <th>Vendedor</th>
                <th>Producto</th>
                <th class="text-right">Piezas</th>
                <th>Pedido</th>
                <th>Factura</th>
                <th>Cliente</th>
                <th>Motivo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && !returns.length">
                <td colspan="9" class="text-center text-gray-400 py-6">Sin devoluciones en este periodo</td>
              </tr>
              <tr v-for="record in returns" :key="record.id" class="align-top">
                <td class="whitespace-nowrap">{{ formatDate(record.arrival_date) }}</td>
                <td>{{ record.sales_person_name || '—' }}</td>
                <td style="min-width:260px;">
                  <div v-for="group in visibleGroups(record)" :key="group.key" class="leading-snug mb-1">
                    <span class="font-semibold">{{ group.label }}</span>
                    <span class="text-xs text-gray-500">
                      <template v-for="s in group.sizes" :key="s.size"> · {{ s.size || '—' }} <b class="text-gray-700">{{ formatQty(s.quantity) }}</b></template>
                    </span>
                  </div>
                  <button v-if="groupItems(record.items).length > COLLAPSED_GROUPS"
                          class="text-xs text-primary font-semibold" @click="toggleExpanded(record.id)">
                    {{ expandedIds.has(record.id) ? 'Ver menos' : `+${groupItems(record.items).length - COLLAPSED_GROUPS} más` }}
                  </button>
                </td>
                <td class="text-right font-semibold">{{ formatQty(recordPieces(record)) }}</td>
                <td class="whitespace-nowrap">{{ record.sales_order_id }}</td>
                <td class="whitespace-nowrap">{{ record.invoice_id || '—' }}</td>
                <td>{{ record.customer_name || '—' }}</td>
                <td>
                  {{ record.reason_label }}
                  <div v-if="record.notes" class="text-xs text-gray-500">{{ record.notes }}</div>
                  <div class="text-xs text-gray-400">Registró: {{ record.created_by_name || '—' }}</div>
                </td>
                <td>
                  <button class="btn btn-xs btn-ghost text-error" title="Eliminar" @click="removeReturn(record)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
