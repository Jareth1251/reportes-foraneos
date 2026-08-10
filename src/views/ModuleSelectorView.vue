<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { SESSION_KEY } from '@/router'

const router = useRouter()
const auth   = useAuthStore()

const deptId = computed(() =>
  String(auth.user?.departmentId ?? auth.user?.department_id ?? '').trim()
)

const MODULES = computed(() => {
  const reporte = { key: 'foraneos-reporte', icon: '📊', label: 'Reporte Foráneos', desc: 'Consultar el estado de pedidos, entregas y estadísticas por paquetería.', color: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' }
  const checkinRep = { key: 'checkin-reporte', icon: '🎫', label: 'Reporte de Turnos', desc: 'Consultar turnos en espera, tiempos de atención y detalle por estatus.', color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' }
  const pedidosPaginaRep = { key: 'pedidos-pagina-reporte', icon: '🧾', label: 'Reporte Pedidos de Página', desc: 'Trazabilidad completa: tiempos por etapa, responsables y comprobante de pago.', color: '#7C3AED', bg: '#EDE9FE', border: '#C4B5FD' }
  const indicadoresRep = { key: 'indicadores-reporte', icon: '📈', label: 'Indicadores', desc: 'Ventas por vendedor: clientes, presupuesto, potencial y desglose por línea de producto.', color: '#0F766E', bg: '#CCFBF1', border: '#5EEAD4' }
  const cajerasSucursal = { key: 'cajeras-sucursal', icon: '🧑‍💼', label: 'Cajeras y Sucursal', desc: 'Asignar cajeras a sucursales y paqueterías, y administrar cuáles aparecen en el selector.', color: '#9D174D', bg: '#FCE7F3', border: '#F9A8D4' }

  if (deptId.value === '004') {
    return [
      { key: 'cajas', icon: '📦', label: 'Foráneos', desc: 'Gestionar llegadas, surtido, empaque y entrega de pedidos foráneos.', color: '#1565C0', bg: '#E3F2FD', border: '#90CAF9' },
      reporte,
      checkinRep,
      pedidosPaginaRep,
      indicadoresRep,
    ]
  }

  const checkins = deptId.value === '007'
    ? { key: 'almacen',  icon: '📦', label: 'Pedidos Foráneos',  desc: 'Gestionar llegadas, surtido, empaque y entrega de pedidos foráneos.', color: '#1565C0', bg: '#E3F2FD', border: '#90CAF9' }
    : { key: 'foraneos', icon: '📦', label: 'Checkins Foráneos', desc: 'Registrar llegadas, crear órdenes y gestionar el flujo de clientes foráneos.', color: '#1565C0', bg: '#E3F2FD', border: '#90CAF9' }

  const esAdminCajeras = ['001', '002'].includes(deptId.value)

  return [
    checkins,
    reporte,
    checkinRep,
    pedidosPaginaRep,
    indicadoresRep,
    ...(esAdminCajeras ? [cajerasSucursal] : []),
  ]
})

function goTo(key) {
  sessionStorage.setItem(SESSION_KEY, key)
  router.push({ name: key })
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-base-200 p-6">

    <div class="mb-8 text-center">
      <div class="text-5xl mb-3">🏷️</div>
      <p class="text-sm text-base-content/60">
        Bienvenido, <strong class="text-base-content">{{ auth.user?.name || auth.user?.username || 'Usuario' }}</strong>
      </p>
    </div>

    <h2 class="text-xl font-bold text-base-content mb-1 text-center">¿A qué módulo deseas acceder?</h2>
    <p class="text-sm text-base-content/50 mb-8 text-center">Selecciona una opción para continuar</p>

    <div class="flex flex-wrap gap-5 justify-center w-full max-w-2xl">
      <button
        v-for="mod in MODULES"
        :key="mod.key"
        class="card bg-base-100 shadow-md hover:shadow-xl transition-all duration-150 hover:-translate-y-1 cursor-pointer border-2 flex-1 min-w-56 max-w-72"
        :style="`border-color:${mod.border};`"
        @click="goTo(mod.key)"
      >
        <div class="card-body items-center text-center gap-3 py-7">
          <div
            class="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            :style="`background:${mod.bg};`"
          >
            {{ mod.icon }}
          </div>
          <h3 class="card-title text-base" :style="`color:${mod.color};`">{{ mod.label }}</h3>
          <p class="text-xs text-base-content/60 leading-relaxed">{{ mod.desc }}</p>
        </div>
      </button>
    </div>

<button 
  class="btn btn-sm mt-10" 
  :style="{ backgroundColor: buttonColor, color: '#3b82f6', textColor }" 
  @click="auth.logout().then(() => router.push('/login'))"
>
  Cerrar sesión
</button>

  </div>
</template>
