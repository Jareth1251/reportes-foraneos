<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCheckinReports } from '@/composables/useCheckinReports'
import GeneralReportPanel from '@/components/checkin/GeneralReportPanel.vue'
import DetalleReportTable from '@/components/checkin/DetalleReportTable.vue'
import AgendadosReportTable from '@/components/checkin/AgendadosReportTable.vue'
import AlmacenReportTable from '@/components/checkin/AlmacenReportTable.vue'
import PisoReportTable from '@/components/checkin/PisoReportTable.vue'
import PicosClientesReportTable from '@/components/checkin/PicosClientesReportTable.vue'
import CajerasReportTable from '@/components/checkin/CajerasReportTable.vue'

const router = useRouter()
const auth = useAuthStore()

const deptId = computed(() => String(auth.user?.departmentId ?? auth.user?.department_id ?? '').trim())
const spid = computed(() => String(auth.user?.salesPersonId || auth.user?.salespersonId || '').trim().toUpperCase())

const site = computed(() => null)

const canSeePisoReport = computed(() => deptId.value === '006' || spid.value === 'VYAM' || spid.value === 'VRAT')
const canSeeCajerasReport = computed(() => ['001', '002'].includes(deptId.value) || ['VYAM', 'VRAT'].includes(spid.value))

const activeTab = ref('general')

const {
  loading,
  totalsLoading,
  totals,
  detail,
  dateStart,
  dateEnd,
  fetchTotals,
  fetchDetail,
  changeDateRange,
  shiftDay,
} = useCheckinReports(site)

// 'cajeras' no depende de este fetch compartido -- ver changeTab().
function onDateStartChange(value) {
  dateStart.value = value
  if (activeTab.value !== 'cajeras') changeDateRange()
}

function onDateEndChange(value) {
  dateEnd.value = value
  if (activeTab.value !== 'cajeras') changeDateRange()
}

function onSetRange({ start, end }) {
  dateStart.value = start
  dateEnd.value = end
  if (activeTab.value !== 'cajeras') fetchDetail({ force: true })
}

function changeTab(key) {
  activeTab.value = key
  // 'cajeras' ya no depende de este fetch compartido -- tiene su propio fetch
  // liviano (useCajerasReport). Ver investigación 2026-08-07.
  // El resto de tabs comparten `detail`: fetchDetail() no repite la descarga
  // si el rango de fechas no cambió desde la última vez (ver useCheckinReports.js).
  if (key !== 'general' && key !== 'cajeras') fetchDetail()
}

// El botón "Actualizar" de cada tab debe refrescar siempre, aunque el rango
// de fechas sea el mismo (no hay polling automático -- ver feedback_no_polling).
function refreshDetail() {
  fetchDetail({ force: true })
}

onMounted(() => {
  fetchTotals()
  fetchDetail()
})

const TABS = computed(() => {
  const tabs = [
    { key: 'general', label: 'Reporte General' },
    { key: 'detalle', label: 'Reporte Detalle' },
    { key: 'agendados', label: 'Agendados' },
    { key: 'almacen', label: 'Reporte Almacén' },
  ]
  if (canSeePisoReport.value) tabs.push({ key: 'piso', label: 'Reporte Piso' })
  if (canSeePisoReport.value) tabs.push({ key: 'picos', label: 'Picos de Clientes' })
  if (canSeeCajerasReport.value) tabs.push({ key: 'cajeras', label: 'Cajeras' })
  return tabs
})
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">

    <!-- Barra superior fija -->
    <div class="flex-none bg-gradient-to-r from-blue-800 to-blue-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-blue-900 hover:bg-blue-50 border-0 font-bold" @click="router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">🎫 Reporte de Turnos</span>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => router.push('/login'))">Salir</button>
    </div>

    <!-- Tabs fijos -->
    <div class="flex-none bg-base-100 border-b border-base-300 px-4 flex gap-1 pt-1">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="px-4 py-1.5 text-sm font-medium border-b-2 transition-colors"
        :class="activeTab === tab.key ? 'border-blue-700 text-blue-800' : 'border-transparent text-base-content/50 hover:text-base-content'"
        @click="changeTab(tab.key)"
      >{{ tab.label }}</button>
    </div>

    <!-- Área scrollable principal -->
    <div class="flex-1 overflow-y-auto overflow-x-hidden p-4">

      <GeneralReportPanel
        v-if="activeTab === 'general'"
        :totals="totals"
        :totals-loading="totalsLoading"
        @refresh="fetchTotals"
      />

      <DetalleReportTable
        v-else-if="activeTab === 'detalle'"
        :rows="detail"
        :date-start="dateStart"
        :date-end="dateEnd"
        :loading="loading"
        @update:date-start="onDateStartChange"
        @update:date-end="onDateEndChange"
        @shift="shiftDay"
        @refresh="refreshDetail"
      />

      <AgendadosReportTable
        v-else-if="activeTab === 'agendados'"
        :rows="detail"
        :date-start="dateStart"
        :date-end="dateEnd"
        :loading="loading"
        @update:date-start="onDateStartChange"
        @update:date-end="onDateEndChange"
        @shift="shiftDay"
        @refresh="refreshDetail"
      />

      <AlmacenReportTable
        v-else-if="activeTab === 'almacen'"
        :rows="detail"
        :date-start="dateStart"
        :date-end="dateEnd"
        :loading="loading"
        @update:date-start="onDateStartChange"
        @update:date-end="onDateEndChange"
        @shift="shiftDay"
        @refresh="refreshDetail"
      />

      <PisoReportTable
        v-else-if="activeTab === 'piso' && canSeePisoReport"
        :rows="detail"
        :date-start="dateStart"
        :date-end="dateEnd"
        :loading="loading"
        :spid="spid"
        @update:date-start="onDateStartChange"
        @update:date-end="onDateEndChange"
        @shift="shiftDay"
        @refresh="refreshDetail"
      />

      <PicosClientesReportTable
        v-else-if="activeTab === 'picos' && canSeePisoReport"
        :rows="detail"
        :date-start="dateStart"
        :date-end="dateEnd"
        :loading="loading"
        @update:date-start="onDateStartChange"
        @update:date-end="onDateEndChange"
        @shift="shiftDay"
        @refresh="refreshDetail"
      />

      <CajerasReportTable
        v-else-if="activeTab === 'cajeras' && canSeeCajerasReport"
        :date-start="dateStart"
        :date-end="dateEnd"
        @update:date-start="onDateStartChange"
        @update:date-end="onDateEndChange"
        @shift="shiftDay"
        @set-range="onSetRange"
      />

    </div>
  </div>
</template>
