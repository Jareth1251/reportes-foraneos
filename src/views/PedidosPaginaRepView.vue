<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/config/axios'
import { SESSION_KEY } from '@/router'
import { fmtTime, timeDiff } from '@/utils/reportTime'
import { exportToExcel } from '@/utils/excelExport'
import { PEDIDOS_PAGINA_FIELDS } from '@/components/pedidosPagina/reportFields'

const router = useRouter()
if (!sessionStorage.getItem(SESSION_KEY)) {
  router.replace({ name: 'selector' })
}

const auth = useAuthStore()

function ymdLocal(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

const dateStart = ref(ymdLocal())
const dateEnd = ref(ymdLocal())
const loading = ref(false)
const rows = ref([])

function setQuickRange(type) {
  const today = new Date()
  if (type === 'hoy') {
    dateStart.value = ymdLocal(today)
    dateEnd.value = ymdLocal(today)
  } else if (type === 'ayer') {
    const ayer = new Date(today)
    ayer.setDate(ayer.getDate() - 1)
    dateStart.value = ymdLocal(ayer)
    dateEnd.value = ymdLocal(ayer)
  } else if (type === '7') {
    const hace7 = new Date(today)
    hace7.setDate(hace7.getDate() - 6)
    dateStart.value = ymdLocal(hace7)
    dateEnd.value = ymdLocal(today)
  } else if (type === 'mes') {
    dateStart.value = ymdLocal(new Date(today.getFullYear(), today.getMonth(), 1))
    dateEnd.value = ymdLocal(today)
  }
  fetchOrders()
}

function parsePaidAt(value) {
  if (!value) return null
  const [datePart, timePart] = String(value).split(' ')
  const [day, month, year] = (datePart || '').split('/').map(Number)
  if (!day || !month || !year) return null
  const [hours, minutes] = (timePart || '').split(':').map(Number)
  return new Date(year, month - 1, day, hours || 0, minutes || 0)
}

function formatDateDMY(d) {
  if (!d) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}

function transformRow(order) {
  const paidDate = parsePaidAt(order.paid_at)
  const isDelivery = String(order.shipping_type || '').toUpperCase() === 'DELIVERY'
  const finalTs = isDelivery ? order.entregado_at : order.facturado_at

  return {
    ...order,
    fecha: formatDateDMY(paidDate),
    time_paid_at: paidDate ? fmtTime(paidDate) : '',
    time_surtido_start: fmtTime(order.surtido_start),
    time_surtido_end: fmtTime(order.surtido_end),
    time_despachado_at: fmtTime(order.despachado_at),
    time_empacado_at: fmtTime(order.empacado_at),
    time_facturado_at: fmtTime(order.facturado_at),
    time_entregado_at: fmtTime(order.entregado_at),
    diff_surtiendo: timeDiff(order.surtido_start, order.surtido_end),
    diff_despacho: timeDiff(order.surtido_end, order.despachado_at),
    diff_empaque: timeDiff(order.despachado_at, order.empacado_at),
    diff_caja: timeDiff(order.empacado_at, order.facturado_at),
    diff_entrega: timeDiff(order.facturado_at, order.entregado_at),
    diff_total: paidDate ? timeDiff(paidDate.toISOString(), finalTs) : '',
    comprobante_estado: order.comprobante_pago_path ? 'Sí' : 'Sin comprobante',
    guia_numbers: Array.isArray(order.tracking_codes) ? order.tracking_codes.join(', ') : '',
  }
}

async function fetchOrders() {
  loading.value = true
  try {
    const allRows = []
    let page = 1
    const perPage = 100

    while (true) {
      const { data } = await api.get('/admin/orders/paid', {
        params: { date_from: dateStart.value, date_to: dateEnd.value, per_page: perPage, page, strict_date: 1 },
      })
      const pageRows = data?.data || []
      allRows.push(...pageRows)
      if (pageRows.length < perPage) break
      page += 1
    }

    rows.value = allRows.map(transformRow)
  } catch (err) {
    console.error('Error al cargar el reporte de Pedidos de página:', err)
  } finally {
    loading.value = false
  }
}

const fieldCount = Object.keys(PEDIDOS_PAGINA_FIELDS).length

const searchText = ref('')

const displayRows = computed(() => {
  const term = searchText.value.trim().toLowerCase()
  if (!term) return rows.value
  return rows.value.filter((r) => {
    const pedido = String(r.erp_order_id || '').toLowerCase()
    const pedidoWeb = String(r.id || '').toLowerCase()
    const cliente = String(r.customer || '').toLowerCase()
    return pedido.includes(term) || pedidoWeb.includes(term) || cliente.includes(term)
  })
})

function exportReport() {
  exportToExcel(displayRows.value, PEDIDOS_PAGINA_FIELDS, `ReportePedidosPagina_${dateStart.value}_a_${dateEnd.value}.xlsx`)
}

onMounted(fetchOrders)
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">

    <!-- Barra superior fija -->
    <div class="flex-none bg-gradient-to-r from-violet-800 to-violet-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-violet-900 hover:bg-violet-50 border-0 font-bold" @click="$router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">🧾 Reporte Pedidos de Página</span>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => $router.push('/login'))">Salir</button>
    </div>

    <!-- Filtros fijos -->
    <div class="flex-none bg-base-100 border-b border-base-300 px-4 py-2 flex flex-wrap gap-3 items-center shadow-sm">
      <div class="flex gap-2 items-center">
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] text-base-content/50 leading-none">Desde</label>
          <input type="date" v-model="dateStart" class="input input-bordered input-xs w-36" @change="fetchOrders" />
        </div>
        <div class="flex flex-col gap-0.5">
          <label class="text-[10px] text-base-content/50 leading-none">Hasta</label>
          <input type="date" v-model="dateEnd" class="input input-bordered input-xs w-36" @change="fetchOrders" />
        </div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-xs" @click="setQuickRange('hoy')">Hoy</button>
        <button class="btn btn-xs" @click="setQuickRange('ayer')">Ayer</button>
        <button class="btn btn-xs" @click="setQuickRange('7')">Últ. 7 días</button>
        <button class="btn btn-xs" @click="setQuickRange('mes')">Este mes</button>
      </div>

      <div class="flex items-center gap-1">
        <input
          v-model="searchText"
          type="text"
          placeholder="Buscar cliente o pedido..."
          class="input input-bordered input-xs w-56"
        />
        <button v-if="searchText" class="btn btn-xs btn-ghost" @click="searchText = ''">✕</button>
      </div>

      <div class="ml-auto flex items-center gap-3">
        <span class="text-xs text-base-content/70">
          <b class="text-base-content">{{ displayRows.length }}</b> {{ displayRows.length === 1 ? 'pedido' : 'pedidos' }}
        </span>
        <button class="btn btn-xs btn-primary" :class="{ loading }" @click="fetchOrders">
          <span v-if="!loading">↻ Actualizar</span>
          <span v-else>Cargando...</span>
        </button>
        <button class="btn btn-xs btn-success" @click="exportReport">⬇ Exportar Excel</button>
      </div>
    </div>

    <!-- Tabla -->
    <div class="flex-1 overflow-auto p-4">
      <div v-if="loading" class="flex justify-center py-16">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>
      <div v-else class="overflow-x-auto bg-base-100 rounded-lg shadow-sm">
        <table class="table table-sm">
          <thead>
            <tr class="text-sm">
              <th v-for="(label, field) in PEDIDOS_PAGINA_FIELDS" :key="field">{{ label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="displayRows.length === 0">
              <td :colspan="fieldCount" class="text-center text-base-content/40 py-8">Sin pedidos que coincidan.</td>
            </tr>
            <tr v-for="(r, i) in displayRows" :key="r.id ?? i" class="text-sm">
              <td v-for="(label, field) in PEDIDOS_PAGINA_FIELDS" :key="field">{{ r[field] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
