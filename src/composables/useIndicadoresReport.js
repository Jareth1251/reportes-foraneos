import { ref, computed } from 'vue'
import Swal from 'sweetalert2'
import { salesByTypeCust } from '@/services/qadKpi'
import {
  MONTHS,
  buildTerritoryIndex,
  extractTerritoriesArray,
  extractCustomersArray,
  slimCustomer,
  buildCustomersBySellerWithTerritory,
  mergeKpiIntoBase,
  prorateSalesObjetive,
  computeProgress,
  computeGoal,
  formatDateMDY,
  getSalesPersonId,
  getWeek,
  getWeekNumber,
  getWeekDateRange,
  getPotentialFactorFromState,
  norm,
  safeJsonParse,
} from '@/utils/indicadoresHelpers'

const CUSTOMERS_CACHE_KEY = 'kpi_customers_cache_v1'
const CUSTOMERS_CACHE_TTL_MS = 1000 * 60 * 60 * 12

const TERR_CACHE_KEY = 'kpi_territories_cache_v1'
const TERR_CACHE_TTL_MS = 1000 * 60 * 60 * 12

export function useIndicadoresReport(user) {
  const loading = ref(false)

  const dateSelect = ref(null)
  const dateEndSelect = ref(null)
  const dateSelectDraft = ref(null)
  const dateEndSelectDraft = ref(null)
  const selectedWeek = ref(null)
  const selectedMonth = ref(null)
  const selectedTerritory = ref(null)
  const salesFilterType = ref('salesAmount')

  const dataSalesByCustomerType = ref([])
  const userGoal = ref(0)
  const realDays = ref(0)
  const userProgress = computed(() => computeProgress(dataSalesByCustomerType.value, salesFilterType.value))

  const territoriesLoaded = ref(false)
  const territoriesLoading = ref(false)
  const territories = ref([])
  const territoryToSellers = ref({})

  const customersLoaded = ref(false)
  const customersLoading = ref(false)
  const customersBySeller = ref({})

  let terrPromise = null

  async function fetchAllTerritories() {
    const res = await fetch('/node-api/territories')
    const json = await res.json()
    return extractTerritoriesArray(json)
  }

  async function fetchAllCustomers() {
    const res = await fetch('/node-api/clients?active=true')
    const json = await res.json()
    return extractCustomersArray(json)
  }

  async function ensureTerritoriesLoaded() {
    if (terrPromise) return terrPromise

    terrPromise = (async () => {
      if (territoriesLoaded.value || territoriesLoading.value) return

      territoriesLoading.value = true

      try {
        const cached = safeJsonParse(localStorage.getItem(TERR_CACHE_KEY), null)

        if (
          cached?.ts &&
          Array.isArray(cached.data) &&
          cached.data.length > 0 &&
          (Date.now() - cached.ts) < TERR_CACHE_TTL_MS
        ) {
          const { territoryToSellers: t2s } = buildTerritoryIndex(cached.data)
          territories.value = cached.data
            .map((t) => ({ value: String(t.id).trim(), label: String(t.name || '').trim() }))
            .filter((t) => t.value && t.label)
          territoryToSellers.value = t2s
          territoriesLoaded.value = true
          territoriesLoading.value = false
          return
        }

        const list = await fetchAllTerritories()
        if (!list.length) {
          console.warn('territories API vacía; sin fallback (índices vacíos)')
          territories.value = []
          territoryToSellers.value = {}
          territoriesLoaded.value = true
          territoriesLoading.value = false
          return
        }

        const { territoryToSellers: t2s } = buildTerritoryIndex(list)
        territories.value = list
          .map((t) => ({ value: String(t.id).trim(), label: String(t.name || '').trim() }))
          .filter((t) => t.value && t.label)
        territoryToSellers.value = t2s
        territoriesLoaded.value = true
        territoriesLoading.value = false

        try {
          localStorage.setItem(TERR_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: list }))
        } catch (e) {
          console.warn('No se pudo cachear territorios:', e)
          try { localStorage.removeItem(TERR_CACHE_KEY) } catch {}
        }
      } catch (e) {
        console.error('Error cargando territorios:', e)
        territories.value = []
        territoryToSellers.value = {}
        territoriesLoaded.value = false
        territoriesLoading.value = false
      }
    })()

    try {
      await terrPromise
    } finally {
      terrPromise = null
    }
  }

  async function ensureCustomersLoaded() {
    if (customersLoaded.value || customersLoading.value) return

    customersLoading.value = true

    try {
      await ensureTerritoriesLoaded()

      const cached = safeJsonParse(localStorage.getItem(CUSTOMERS_CACHE_KEY), null)

      if (
        cached?.ts &&
        Array.isArray(cached.data) &&
        (Date.now() - cached.ts) < CUSTOMERS_CACHE_TTL_MS
      ) {
        customersBySeller.value = buildCustomersBySellerWithTerritory(cached.data, territoryToSellers.value)
        customersLoaded.value = true
        customersLoading.value = false
        return
      }

      const customers = await fetchAllCustomers()
      const customersSlim = Array.isArray(customers) ? customers.map(slimCustomer) : []

      customersBySeller.value = buildCustomersBySellerWithTerritory(customersSlim, territoryToSellers.value)
      customersLoaded.value = true
      customersLoading.value = false

      try {
        localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: customersSlim }))
      } catch (e) {
        console.warn('No se pudo cachear clientes:', e)
        try { localStorage.removeItem(CUSTOMERS_CACHE_KEY) } catch {}
      }
    } catch (e) {
      console.error('Error cargando clientes base:', e)
      customersLoading.value = false
      customersLoaded.value = false
      customersBySeller.value = {}
    }
  }

  function getCustomersBySellerFiltered() {
    const base = customersBySeller.value || {}
    const terrId = norm(selectedTerritory.value?.value)
    const terrName = norm(selectedTerritory.value?.label)

    if (!terrId && !terrName) return base

    const out = {}
    Object.keys(base).forEach((sellerId) => {
      const arr = base[sellerId] || []
      out[sellerId] = arr.filter((c) => {
        const cTerr = norm(c.territory || c.territoryId || c.territoryCode)
        return (terrId && cTerr === terrId) || (terrName && cTerr === terrName)
      })
    })

    return out
  }

  function applyCustomersBaseToKpi(finalData) {
    const customersMap = getCustomersBySellerFiltered()
    return mergeKpiIntoBase(finalData, customersMap)
  }

  async function loadCurrentMonth() {
    loading.value = true

    const today = new Date()
    const currentMonth = today.getMonth()
    const startOfMonth = new Date(today.getFullYear(), currentMonth, 1)
    const endOfMonth = today

    const days = Math.floor((endOfMonth - startOfMonth) / (1000 * 60 * 60 * 24)) + 1

    selectedWeek.value = null
    selectedMonth.value = {
      label: startOfMonth.toLocaleString('es-MX', { month: 'long' }),
      value: (currentMonth + 1).toString().padStart(2, '0'),
    }
    dateSelect.value = startOfMonth
    dateEndSelect.value = endOfMonth
    dateSelectDraft.value = startOfMonth
    dateEndSelectDraft.value = endOfMonth
    realDays.value = days

    try {
      const formattedStartDate = formatDateMDY(startOfMonth)
      const formattedEndDate = formatDateMDY(endOfMonth)
      const salesPersonId = getSalesPersonId(user.value)

      await ensureCustomersLoaded()

      const response = await salesByTypeCust({
        salesPersonId,
        dateStart: formattedStartDate,
        dateEnd: formattedEndDate,
      })

      let finalData = Array.isArray(response) ? response : []
      finalData = prorateSalesObjetive(finalData, days)

      if (customersLoaded.value) finalData = applyCustomersBaseToKpi(finalData)

      dataSalesByCustomerType.value = finalData
      userGoal.value = computeGoal(finalData)
    } catch (error) {
      console.error('Error al cargar datos del mes actual:', error)
      dataSalesByCustomerType.value = []
      userGoal.value = 0
    } finally {
      loading.value = false
    }
  }

  async function fetchDataByWeekRange(week, salesPersonId) {
    const allData = []
    const { startDate, endDate } = getWeekDateRange(week)
    const formattedStartDate = formatDateMDY(startDate)
    const formattedEndDate = formatDateMDY(endDate)

    try {
      const weeklyData = await salesByTypeCust({
        week: week.toString(),
        salesPersonId,
        dateStart: formattedStartDate,
        dateEnd: formattedEndDate,
      })

      if (Array.isArray(weeklyData)) allData.push(...weeklyData)
    } catch (error) {
      console.error('Error al obtener datos:', error)
    }

    const groupedData = {}
    allData.forEach((item) => {
      if (!groupedData[item.salesPersonId]) {
        groupedData[item.salesPersonId] = { ...item }
      } else {
        ;(item.custType || []).forEach((cust, i) => {
          const existing = groupedData[item.salesPersonId].custType[i]
          existing.salesAmount += cust.salesAmount || 0
          existing.salesQuantity += cust.salesQuantity || 0
        })
      }
    })

    const finalData = Object.values(groupedData)

    const goal = finalData.reduce((sum, seller) => {
      const days = seller.days || 1
      return sum + (seller.salesObjetive * days / 30)
    }, 0)

    const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1

    return { finalData, userGoal: goal, days }
  }

  async function handleWeekChangeSales(week) {
    if (!week) return

    const today = new Date()
    const currentWeek = getWeekNumber(today.toISOString().split('T')[0])

    if (week.value > currentWeek) {
      Swal.fire({
        icon: 'warning',
        title: 'Semana inválida',
        text: `No puedes seleccionar la semana ${week.value} porque aún no ha ocurrido.`,
      })
      selectedWeek.value = null
      return
    }

    loading.value = true
    selectedWeek.value = week
    selectedMonth.value = null
    dateSelect.value = null
    dateEndSelect.value = null
    dateSelectDraft.value = null
    dateEndSelectDraft.value = null

    try {
      const salesPersonId = getSalesPersonId(user.value)
      const { finalData: rawData, userGoal: goal, days } =
        await fetchDataByWeekRange(week.value, salesPersonId)

      await ensureCustomersLoaded()
      const finalData = customersLoaded.value ? applyCustomersBaseToKpi(rawData) : rawData

      dataSalesByCustomerType.value = finalData
      userGoal.value = goal
      realDays.value = days
    } catch (error) {
      console.error('Error al cargar datos por semana:', error)
      dataSalesByCustomerType.value = []
      userGoal.value = 0
    } finally {
      loading.value = false
    }
  }

  async function changedDate(start, end) {
    if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end)) {
      dateSelect.value = null
      dateEndSelect.value = null
      dataSalesByCustomerType.value = []
      userGoal.value = 0
      return
    }

    const today = new Date()
    if (start > today || end > today) {
      Swal.fire({ icon: 'warning', title: 'Rango no válido', text: 'No puedes seleccionar fechas futuras.' })
      return
    }

    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1

    dateSelect.value = start
    dateEndSelect.value = end
    dateSelectDraft.value = start
    dateEndSelectDraft.value = end
    selectedMonth.value = null
    selectedWeek.value = null
    realDays.value = days
    loading.value = true

    try {
      const salesPersonId = getSalesPersonId(user.value)
      await ensureCustomersLoaded()

      const response = await salesByTypeCust({
        salesPersonId,
        dateStart: formatDateMDY(start),
        dateEnd: formatDateMDY(end),
      })

      let finalData = Array.isArray(response) ? response : []
      finalData = prorateSalesObjetive(finalData, days)

      if (customersLoaded.value) finalData = applyCustomersBaseToKpi(finalData)

      dataSalesByCustomerType.value = finalData
      userGoal.value = computeGoal(finalData)
    } catch (error) {
      console.error('Error en changedDate:', error)
      dataSalesByCustomerType.value = []
      userGoal.value = 0
    } finally {
      loading.value = false
    }
  }

  async function handleSearchDateRange() {
    if (!dateSelectDraft.value && !dateEndSelectDraft.value) {
      await changedDate(null, null)
      return
    }
    if (
      !(dateSelectDraft.value instanceof Date) || isNaN(dateSelectDraft.value) ||
      !(dateEndSelectDraft.value instanceof Date) || isNaN(dateEndSelectDraft.value)
    ) {
      Swal.fire({ icon: 'warning', title: 'Rango incompleto', text: 'Selecciona Fecha Inicio y Fecha Fin.' })
      return
    }
    if (dateSelectDraft.value > dateEndSelectDraft.value) {
      Swal.fire({ icon: 'warning', title: 'Rango no válido', text: 'La Fecha Inicio no puede ser mayor a la Fecha Fin.' })
      return
    }
    await changedDate(dateSelectDraft.value, dateEndSelectDraft.value)
  }

  async function handleMonthChange(selectedOption) {
    const today = new Date()
    const currentYear = today.getFullYear()

    if (!selectedOption) {
      selectedMonth.value = null
      return
    }

    const month = parseInt(selectedOption.value)
    const startDate = new Date(currentYear, month - 1, 1)
    const isCurrentMonth = month === today.getMonth() + 1 && currentYear === today.getFullYear()
    const endDate = isCurrentMonth ? today : new Date(currentYear, month, 0)

    if (startDate > today) {
      Swal.fire({ icon: 'warning', title: 'Mes no válido', text: 'No puedes consultar un mes futuro.' })
      selectedMonth.value = null
      return
    }

    const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1

    selectedMonth.value = selectedOption
    selectedWeek.value = null
    dateSelect.value = startDate
    dateEndSelect.value = endDate
    dateSelectDraft.value = startDate
    dateEndSelectDraft.value = endDate
    realDays.value = days
    loading.value = true

    try {
      const salesPersonId = getSalesPersonId(user.value)
      await ensureCustomersLoaded()

      const response = await salesByTypeCust({
        month: String(month).padStart(2, '0'),
        salesPersonId,
        dateStart: formatDateMDY(startDate),
        dateEnd: formatDateMDY(endDate),
      })

      let finalData = Array.isArray(response) ? response : []
      finalData = prorateSalesObjetive(finalData, days)

      if (customersLoaded.value) finalData = applyCustomersBaseToKpi(finalData)

      dataSalesByCustomerType.value = finalData
      userGoal.value = computeGoal(finalData)
    } catch (error) {
      console.error('Error al cargar datos mensuales:', error)
    } finally {
      loading.value = false
    }
  }

  async function handleTerritoryChange(territory) {
    selectedTerritory.value = territory || null

    if (selectedWeek.value) {
      await handleWeekChangeSales(selectedWeek.value)
      return
    }
    if (selectedMonth.value && dateSelect.value && dateEndSelect.value) {
      await handleMonthChange(selectedMonth.value)
      return
    }
    if (dateSelect.value && dateEndSelect.value) {
      await changedDate(dateSelect.value, dateEndSelect.value)
    }
  }

  function handleDateInputChange(key, value) {
    const target = key === 'dateSelectDraft' ? dateSelectDraft : dateEndSelectDraft
    if (!value) { target.value = null; return }
    const [year, month, day] = value.split('-')
    target.value = new Date(Number(year), Number(month) - 1, Number(day))
  }

  const weekOptions = computed(() => {
    const current = getWeek()
    return Array.from({ length: current }, (_, i) => {
      const weekNumber = i + 1
      return { label: `Semana ${weekNumber}`, value: weekNumber }
    })
  })

  const monthOptions = computed(() => MONTHS)

  const territoryOptions = computed(() => territories.value)

  const potentialFactor = computed(() => getPotentialFactorFromState({
    selectedWeek: selectedWeek.value,
    dateSelect: dateSelect.value,
    dateEndSelect: dateEndSelect.value,
  }))

  return {
    loading,
    dateSelect,
    dateEndSelect,
    dateSelectDraft,
    dateEndSelectDraft,
    selectedWeek,
    selectedMonth,
    selectedTerritory,
    salesFilterType,
    dataSalesByCustomerType,
    userGoal,
    userProgress,
    realDays,
    weekOptions,
    monthOptions,
    territoryOptions,
    potentialFactor,
    loadCurrentMonth,
    handleWeekChangeSales,
    handleMonthChange,
    handleSearchDateRange,
    handleTerritoryChange,
    handleDateInputChange,
  }
}
