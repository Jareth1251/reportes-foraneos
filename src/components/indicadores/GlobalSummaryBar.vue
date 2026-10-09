<script setup>
import { computed } from 'vue'
import { filterSellersForUser } from '@/utils/indicadoresHelpers'

const props = defineProps({
  user: { type: Object, default: null },
  dataSalesByCustomerType: { type: Array, default: () => [] },
  salesFilterType: { type: String, default: 'salesAmount' },
  userGoal: { type: Number, default: 0 },
  userProgress: { type: Number, default: 0 },
  potentialFactor: { type: Number, default: 1 },
  dateSelect: { type: Date, default: null },
  dateEndSelect: { type: Date, default: null },
})

const canalLabel = computed(() => props.user?.name || '')

const totals = computed(() => {
  const visibleSellers = filterSellersForUser(props.dataSalesByCustomerType, props.user)

  const today = new Date()
  const startOfMonthUTC = Date.UTC(today.getFullYear(), today.getMonth(), 1)
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const startUTC = props.dateSelect instanceof Date
    ? Date.UTC(props.dateSelect.getFullYear(), props.dateSelect.getMonth(), props.dateSelect.getDate())
    : startOfMonthUTC
  const endUTC = props.dateEndSelect instanceof Date
    ? Date.UTC(props.dateEndSelect.getFullYear(), props.dateEndSelect.getMonth(), props.dateEndSelect.getDate())
    : todayUTC

  let clientes = 0
  let conVenta = 0
  let potencial = 0
  let visitados = 0

  visibleSellers.forEach((seller) => {
    ;(seller.custType || []).forEach((cust) => {
      clientes += 1
      const value = props.salesFilterType === 'salesAmount' ? cust.salesAmount || 0 : cust.salesQuantity || 0
      if (value > 0) conVenta += 1
      potencial += (cust.potential || 0) * props.potentialFactor
      const vd = cust.lastVisitDate ? new Date(cust.lastVisitDate) : null
      if (vd && !Number.isNaN(vd.getTime())) {
        const visitUTC = Date.UTC(vd.getFullYear(), vd.getMonth(), vd.getDate())
        if (visitUTC >= startUTC && visitUTC <= endUTC) visitados += 1
      }
    })
  })

  return { clientes, conVenta, potencial, visitados }
})
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-lg font-bold bg-base-100 rounded-lg shadow">
    <div>CANAL: {{ canalLabel }}</div>
    <div>
      {{ salesFilterType === 'salesAmount' ? 'Pesos' : 'Piezas' }}:
      {{ salesFilterType === 'salesAmount'
        ? `$${Math.round(userProgress || 0).toLocaleString('en-US')}`
        : (userProgress || 0).toLocaleString('en-US') }}
    </div>
    <div>Presupuesto: ${{ Math.round(userGoal || 0).toLocaleString('en-US') }}</div>
    <div>Potencial: ${{ Math.round(totals.potencial).toLocaleString('en-US') }}</div>
    <div>Clientes: {{ totals.clientes }}</div>
    <div>Clientes con venta: {{ totals.conVenta }}</div>
    <div>Visitados: {{ totals.visitados }}</div>
  </div>
</template>
