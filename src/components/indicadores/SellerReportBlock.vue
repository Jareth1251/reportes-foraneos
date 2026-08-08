<script setup>
import { ref, computed } from 'vue'
import { CUST_TYPES, filterByType, isAdminLikeDepartment, getUserDeptId } from '@/utils/indicadoresHelpers'
import LineProductDetailTable from './LineProductDetailTable.vue'

const props = defineProps({
  seller: { type: Object, required: true },
  sellerIndex: { type: Number, required: true },
  user: { type: Object, required: true },
  filterType: { type: String, default: 'salesAmount' },
  potentialFactor: { type: Number, default: 1 },
  dateSelect: { type: Date, default: null },
  dateEndSelect: { type: Date, default: null },
})

const expandedType = ref(null)

function toggleExpand(typeName) {
  expandedType.value = expandedType.value === typeName ? null : typeName
}

const showAdminSummary = computed(() => isAdminLikeDepartment(getUserDeptId(props.user)))

const adminSummary = computed(() => {
  const custType = props.seller.custType || []
  const totalClientesVendedor = custType.length
  const totalVentasVendedor = custType.reduce((sum, c) => sum + (c.salesAmount || 0), 0)
  const totalConVenta = custType.filter((c) => (c.salesAmount || 0) > 0).length
  const totalPotencialBase = custType.reduce((sum, c) => sum + (c.potential || 0), 0)
  const totalPotencial = totalPotencialBase * (props.potentialFactor ?? 1)
  const objetivoDelVendedor = props.seller.salesObjetive || 0

  const todaySummary = new Date()
  const totalVisitados = custType.filter((c) => {
    const vd = c.lastVisitDate ? new Date(c.lastVisitDate) : null
    if (!vd || Number.isNaN(vd.getTime())) return false
    const visitUTC = Date.UTC(vd.getFullYear(), vd.getMonth(), vd.getDate())
    if (props.dateSelect instanceof Date && props.dateEndSelect instanceof Date) {
      const startUTC = Date.UTC(props.dateSelect.getFullYear(), props.dateSelect.getMonth(), props.dateSelect.getDate())
      const endUTC = Date.UTC(props.dateEndSelect.getFullYear(), props.dateEndSelect.getMonth(), props.dateEndSelect.getDate())
      return visitUTC >= startUTC && visitUTC <= endUTC
    }
    const startOfMonthUTC = Date.UTC(todaySummary.getFullYear(), todaySummary.getMonth(), 1)
    const todayUTC = Date.UTC(todaySummary.getFullYear(), todaySummary.getMonth(), todaySummary.getDate())
    return visitUTC >= startOfMonthUTC && visitUTC <= todayUTC
  }).length

  return {
    name: props.seller.name || (props.seller.salesPersonId === 'VDAR,VPAR' ? 'CAVE' : ''),
    totalClientesVendedor,
    totalVentasVendedor,
    totalConVenta,
    totalPotencial,
    objetivoDelVendedor,
    totalVisitados,
  }
})

function typeCardStats(typeName) {
  const filteredCusts = filterByType(props.seller.custType, typeName)
  const totalClients = filteredCusts.length
  const totalSalesAmount = filteredCusts.reduce((sum, cust) => sum + (cust.salesAmount || 0), 0)
  const totalSalesQty = filteredCusts.reduce((sum, cust) => sum + (cust.salesQuantity || 0), 0)
  const clientsWithSales = filteredCusts.filter((cust) => (cust.salesAmount || 0) > 0).length

  const objetivoVendedor = Number(props.seller.salesObjetive) || 0
  const totalClientesVendedor = props.seller.custType?.length || 0
  const objetivoTipo = totalClientesVendedor
    ? objetivoVendedor * (totalClients / totalClientesVendedor)
    : 0

  const totalPotential = filteredCusts.reduce((sum, cust) => sum + (cust.potential || 0), 0)
  const totalPotentialAdj = totalPotential * (props.potentialFactor ?? 1)

  return { totalClients, totalSalesAmount, totalSalesQty, clientsWithSales, objetivoTipo, totalPotentialAdj }
}
</script>

<template>
  <div class="mb-10">
    <div v-if="showAdminSummary" class="mb-2.5 flex flex-wrap items-center justify-between gap-2.5 px-5">
      <div class="overflow-x-auto whitespace-nowrap text-left">
        <div class="mb-1 text-xl font-bold">
          {{ adminSummary.name }}
          &nbsp;&nbsp;- Pesos: ${{ Math.round(adminSummary.totalVentasVendedor).toLocaleString('en-US') }}
          - Presupuesto: ${{ Math.round(adminSummary.objetivoDelVendedor).toLocaleString('en-US') }}
          &nbsp;&nbsp;- Clientes: {{ adminSummary.totalClientesVendedor }}
          &nbsp;&nbsp;- Clientes con venta: {{ adminSummary.totalConVenta }}
          &nbsp;&nbsp;- Visitados: {{ adminSummary.totalVisitados }}
          &nbsp;&nbsp;- Potencial {{ Math.round(adminSummary.totalPotencial).toLocaleString('en-US') }}
        </div>
      </div>
    </div>

    <div class="flex flex-nowrap gap-5 overflow-x-auto pb-2.5">
      <div
        v-for="typeName in CUST_TYPES"
        :key="typeName"
        class="flex min-w-[300px] min-h-[240px] flex-col justify-between gap-2 rounded-lg border border-base-300 bg-base-100 p-4 shadow"
      >
        <div class="flex justify-between"><strong>Total Clientes:</strong><span>{{ typeCardStats(typeName).totalClients }}</span></div>
        <div class="flex justify-between"><strong>Con venta:</strong><span>{{ typeCardStats(typeName).clientsWithSales }}</span></div>
        <div class="flex justify-between font-bold">
          <span>{{ filterType === 'salesAmount' ? 'Pesos:' : 'Piezas:' }}</span>
          <span>
            {{ filterType === 'salesAmount'
              ? `$${Math.round(typeCardStats(typeName).totalSalesAmount).toLocaleString('en-US')}`
              : typeCardStats(typeName).totalSalesQty.toLocaleString('en-US') }}
          </span>
        </div>
        <div v-if="filterType === 'salesAmount'" class="flex justify-between">
          <span class="font-bold">Presupuesto:</span>
          <span class="font-bold">${{ Math.round(typeCardStats(typeName).objetivoTipo).toLocaleString('en-US') }}</span>
        </div>
        <div v-if="filterType === 'salesAmount'" class="flex justify-between">
          <span class="font-bold">Potencial:</span>
          <span class="font-bold">${{ Math.round(typeCardStats(typeName).totalPotentialAdj).toLocaleString('en-US') }}</span>
        </div>

        <button
          class="btn btn-sm mt-auto font-bold"
          :class="expandedType === typeName ? 'btn-success' : 'btn-primary'"
          @click="toggleExpand(typeName)"
        >{{ typeName }}</button>
      </div>
    </div>

    <Transition name="expand-fade" mode="out-in">
      <LineProductDetailTable
        v-if="expandedType"
        :key="expandedType"
        :cust-rows="filterByType(seller.custType, expandedType)"
        :seller="seller"
        :type-name="expandedType"
        :filter-type="filterType"
        :group-key="`${sellerIndex}-${expandedType}`"
        :date-select="dateSelect"
        :date-end-select="dateEndSelect"
      />
    </Transition>
  </div>
</template>

<style scoped>
.expand-fade-enter-active,
.expand-fade-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}

.expand-fade-enter-from,
.expand-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
