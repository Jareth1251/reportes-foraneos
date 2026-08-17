<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useInventoryLookup } from '@/composables/useInventoryLookup'
import { fmtDate } from '@/utils/inventoryLookupHelpers'
import PendingRecountsPanel from '@/components/inventoryLookup/PendingRecountsPanel.vue'
import ConteoTable from '@/components/inventoryLookup/ConteoTable.vue'
import BreakdownPanel from '@/components/inventoryLookup/BreakdownPanel.vue'
import HistorialTab from '@/components/inventoryLookup/HistorialTab.vue'

const router = useRouter()
const auth = useAuthStore()
const user = computed(() => auth.user)

const {
  isValidator, isAdminUser,
  site, brands, brand, loading, rows, error, sessionDate,
  selectedKey, breakdownLoading, breakdown, breakdownError,
  stockByPid, committedByPid, shippedByPid, qadError,
  sendingErp, sendingAll, selected, loadingAllQad, loadAllQadProgress,
  view, histDate, histRows, histLoading, histError,
  sessionInfo, validating, qadSnapshotAt,
  pendingRecounts, pendingLoading, expandedValId, deletingRow, requestingRow, doneValidations,
  visibleRows, totals, allVisibleSelected, sessionValidated, canSeeResults, canSendQad, eligibleCount, panelOpen,
  initLoad, handleSearch, openBreakdown, handleSendToErp, toggleSelect, toggleSelectAll,
  handleSendSelected, handleSendAll, handleLoadAllQad, handleValidateSession,
  handleDeleteCount, handleRequestRecount, handleMarkDone, loadPendingRecounts,
  exportHistoryCsv, loadHistory,
} = useInventoryLookup(user)

function goHistorial() {
  view.value = 'historial'
  loadHistory(histDate.value, site.value)
}

function onHistSiteChange(v) {
  site.value = v
  loadHistory(histDate.value, v)
}

function onHistDateChange(v) {
  histDate.value = v
  loadHistory(v, site.value)
}

onMounted(() => {
  initLoad()
})
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">
    <div class="flex-none bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-slate-900 hover:bg-slate-50 border-0 font-bold" @click="router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">📦 Consulta de Inventario — Conteo vs QAD</span>
        <div class="flex gap-1">
          <button
            class="btn btn-xs"
            :class="view === 'conteo' ? 'btn-primary' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'"
            @click="view = 'conteo'"
          >Conteo</button>
          <button
            class="btn btn-xs"
            :class="view === 'historial' ? 'btn-primary' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'"
            @click="goHistorial"
          >Historial QAD</button>
        </div>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => router.push('/login'))">Salir</button>
    </div>

    <template v-if="view === 'conteo'">
      <div class="flex-none grid gap-3 items-end px-4 py-2.5 bg-base-100 border-b border-base-300" style="grid-template-columns: 180px 1fr auto auto auto;">
        <div>
          <label class="block text-xs font-black text-base-content/60 mb-1.5">Sucursal</label>
          <select class="select select-sm w-full" v-model="site">
            <option value="3000">MTY (3000)</option>
            <option value="3100">CDMX (3100)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-black text-base-content/60 mb-1.5">Marca (contada)</label>
          <select class="select select-sm w-full" v-model="brand">
            <option value="">Selecciona marca…</option>
            <option v-for="b in brands" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>
        <button class="btn btn-sm btn-primary" :disabled="loading" @click="handleSearch">
          {{ loading ? 'BUSCANDO…' : 'BUSCAR' }}
        </button>
        <div v-if="sessionDate" class="badge badge-info badge-outline self-end h-9">📅 Sesión: {{ sessionDate }}</div>
        <span></span>
      </div>

      <div class="flex-none flex flex-wrap items-center gap-6 px-4 py-2.5 bg-base-200 border-b border-base-300 text-[15px]">
        <span><span class="text-base-content/50 font-bold">Filas: </span><b>{{ rows.length }}</b>
          <span v-if="rows.length > visibleRows.length" class="text-base-content/50 text-xs ml-1">(mostrando {{ visibleRows.length }})</span>
        </span>
        <span><span class="text-base-content/50 font-bold">Total contado: </span><b>{{ totals.totalCounted }}</b></span>
        <span><span class="text-base-content/50 font-bold">Total QAD: </span><b>{{ totals.hasAllStock ? totals.totalQad : '—' }}</b></span>
        <span>
          <span class="text-base-content/50 font-bold">Diferencia: </span>
          <b v-if="!totals.hasAllStock">—</b>
          <span v-else class="badge" :class="totals.diff > 0 ? 'badge-success' : totals.diff < 0 ? 'badge-error' : 'badge-ghost'">{{ totals.diff }}</span>
        </span>

        <div v-if="qadSnapshotAt" class="badge badge-info badge-outline" :title="`QAD congelado el ${fmtDate(qadSnapshotAt)}`">
          QAD al {{ fmtDate(qadSnapshotAt) }}
        </div>

        <button
          v-if="isAdminUser && rows.length > 0"
          type="button"
          class="btn btn-xs"
          :disabled="loadingAllQad"
          title="Cargar stock QAD de todos los artículos de la tabla"
          @click="handleLoadAllQad"
        >
          {{ loadingAllQad && loadAllQadProgress ? `Cargando QAD… ${loadAllQadProgress.done}/${loadAllQadProgress.total}` : '⬇ Cargar QAD todos' }}
        </button>

        <div class="ml-auto flex gap-2 items-center">
          <button v-if="rows.length > visibleRows.length" class="btn btn-xs" :disabled="loading" @click="page += 1">
            MOSTRAR MÁS
          </button>
          <button v-if="isValidator && rows.length > 0 && !sessionValidated" class="btn btn-xs btn-success" :disabled="validating" @click="handleValidateSession">
            {{ validating ? 'Validando…' : '✅ Validar sesión del día' }}
          </button>
          <div v-if="sessionValidated" class="badge badge-success badge-outline">
            ✅ Validado por {{ sessionInfo?.validated_by_name || sessionInfo?.validated_by }} · {{ fmtDate(sessionInfo?.validated_at) }}
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-3">
        <PendingRecountsPanel
          v-if="isValidator"
          :pending-recounts="pendingRecounts"
          :pending-loading="pendingLoading"
          :expanded-val-id="expandedValId"
          @refresh="loadPendingRecounts()"
          @toggle-expand="(id) => (expandedValId = expandedValId === id ? null : id)"
          @mark-done="handleMarkDone"
        />

        <div v-if="error" class="px-4 py-2 mb-2 bg-red-500/10 border border-red-500/25 rounded text-red-800 font-bold text-sm">{{ error }}</div>
        <div v-if="qadError" class="px-4 py-2 mb-2 bg-red-500/10 border border-red-500/25 rounded text-red-800 font-bold text-sm">{{ qadError }}</div>
        <div v-if="!isValidator && (isAdminUser) && rows.length > 0 && !sessionValidated" class="px-4 py-2 mb-2 bg-amber-50 border border-amber-300 rounded text-amber-800 font-bold text-sm">
          Pendiente de validación por el administrador de almacén.
        </div>

        <div v-if="selected.size > 0" class="flex items-center gap-2.5 px-4 py-1.5 mb-2 bg-blue-800 text-white text-sm rounded">
          <span><b>{{ selected.size }}</b> artículo{{ selected.size !== 1 ? 's' : '' }} seleccionado{{ selected.size !== 1 ? 's' : '' }}</span>
          <button class="btn btn-xs bg-white text-blue-800 border-0" :disabled="!!sendingErp || !canSendQad" :title="!canSendQad ? 'Pendiente de validación por administrador de almacén' : ''" @click="handleSendSelected">
            {{ sendingErp === '__bulk__' ? 'Enviando…' : `→ QAD (${selected.size})` }}
          </button>
          <button class="btn btn-xs btn-outline text-blue-100" @click="selected = new Map()">Limpiar</button>
        </div>

        <div class="flex bg-base-100 rounded-lg border border-base-300 overflow-hidden" style="height: calc(100% - 1px);">
          <ConteoTable
            :visible-rows="visibleRows"
            :loading="loading"
            :is-admin-user="isAdminUser"
            :can-send-qad="canSendQad"
            :can-see-results="canSeeResults"
            :selected="selected"
            :selected-key="selectedKey"
            :stock-by-pid="stockByPid"
            :committed-by-pid="committedByPid"
            :shipped-by-pid="shippedByPid"
            :done-validations="doneValidations"
            :sending-erp="sendingErp"
            :deleting-row="deletingRow"
            :requesting-row="requestingRow"
            :eligible-count="eligibleCount"
            :sending-all="sendingAll"
            :all-visible-selected="allVisibleSelected"
            @toggle-select="toggleSelect"
            @toggle-select-all="toggleSelectAll"
            @row-click="openBreakdown"
            @send-erp="handleSendToErp"
            @delete-row="handleDeleteCount"
            @request-recount="handleRequestRecount"
            @send-all="handleSendAll"
          />

          <BreakdownPanel
            :open="panelOpen"
            :loading="breakdownLoading"
            :error="breakdownError"
            :breakdown="breakdown"
            @close="() => { breakdown = null; selectedKey = ''; breakdownError = '' }"
          />
        </div>
      </div>
    </template>

    <HistorialTab
      v-else
      :site="site"
      :hist-date="histDate"
      :hist-rows="histRows"
      :hist-loading="histLoading"
      :hist-error="histError"
      @update:site="onHistSiteChange"
      @update:hist-date="onHistDateChange"
      @refresh="() => loadHistory(histDate, site)"
      @export="exportHistoryCsv"
    />
  </div>
</template>
