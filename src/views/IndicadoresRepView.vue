<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useIndicadoresReport } from '@/composables/useIndicadoresReport'
import { filterSellersForUser } from '@/utils/indicadoresHelpers'
import IndicadoresToolbar from '@/components/indicadores/IndicadoresToolbar.vue'
import GlobalSummaryBar from '@/components/indicadores/GlobalSummaryBar.vue'
import SellerReportBlock from '@/components/indicadores/SellerReportBlock.vue'

const router = useRouter()
const auth = useAuthStore()
const user = computed(() => auth.user)

const {
  loading,
  dateSelect,
  dateEndSelect,
  dateSelectDraft,
  dateEndSelectDraft,
  selectedWeek,
  selectedMonth,
  salesFilterType,
  dataSalesByCustomerType,
  userGoal,
  userProgress,
  weekOptions,
  monthOptions,
  potentialFactor,
  loadCurrentMonth,
  handleWeekChangeSales,
  handleMonthChange,
  handleSearchDateRange,
  handleDateInputChange,
} = useIndicadoresReport(user)

const visibleSellers = computed(() => filterSellersForUser(dataSalesByCustomerType.value, user.value))

function onFilterTypeChange(value) {
  salesFilterType.value = value
}

function onDateStartChange(value) {
  handleDateInputChange('dateSelectDraft', value)
}

function onDateEndChange(value) {
  handleDateInputChange('dateEndSelectDraft', value)
}

onMounted(() => {
  loadCurrentMonth()
})
</script>

<template>
  <div class="flex flex-col h-screen bg-base-200 overflow-hidden">

    <div class="flex-none bg-gradient-to-r from-blue-800 to-blue-900 px-4 py-2 flex items-center justify-between shadow-md">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm bg-white text-blue-900 hover:bg-blue-50 border-0 font-bold" @click="router.push({ name: 'selector' })">← Módulos</button>
        <span class="text-white font-bold text-sm">📈 Indicadores</span>
      </div>
      <button class="btn btn-xs bg-white/10 border-white/20 text-white/70 hover:bg-white/20" @click="auth.logout().then(() => router.push('/login'))">Salir</button>
    </div>

    <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-4">
      <GlobalSummaryBar
        :user="user"
        :data-sales-by-customer-type="dataSalesByCustomerType"
        :sales-filter-type="salesFilterType"
        :user-goal="userGoal"
        :user-progress="userProgress"
        :potential-factor="potentialFactor"
        :date-select="dateSelect"
        :date-end-select="dateEndSelect"
      />

      <IndicadoresToolbar
        :selected-week="selectedWeek"
        :selected-month="selectedMonth"
        :date-select-draft="dateSelectDraft"
        :date-end-select-draft="dateEndSelectDraft"
        :sales-filter-type="salesFilterType"
        :week-options="weekOptions"
        :month-options="monthOptions"
        :loading="loading"
        @week-change="handleWeekChangeSales"
        @month-change="handleMonthChange"
        @date-start-change="onDateStartChange"
        @date-end-change="onDateEndChange"
        @search="handleSearchDateRange"
        @filter-type-change="onFilterTypeChange"
      />

      <div v-if="loading" class="flex justify-center py-16">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>

      <p v-else-if="!visibleSellers.length" class="text-center text-base-content/40 py-16">
        No hay datos disponibles para el rango seleccionado.
      </p>

      <template v-else>
        <SellerReportBlock
          v-for="(seller, idx) in visibleSellers"
          :key="seller.salesPersonId || idx"
          :seller="seller"
          :seller-index="idx"
          :user="user"
          :filter-type="salesFilterType"
          :potential-factor="potentialFactor"
          :date-select="dateSelect"
          :date-end-select="dateEndSelect"
        />
      </template>
    </div>
  </div>
</template>
