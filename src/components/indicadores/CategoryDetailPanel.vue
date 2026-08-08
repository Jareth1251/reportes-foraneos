<script setup>
import { computed } from 'vue'
import { parseCategoryBrand } from '@/utils/indicadoresHelpers'

const props = defineProps({
  title: { type: String, required: true },
  detail: { type: Object, required: true },
})

const emit = defineEmits(['close'])

const rows = computed(() => props.detail?.data || [])

const groups = computed(() => {
  const list = []
  const brandIndex = new Map()
  rows.value.forEach((cat) => {
    const { displayName, brand } = parseCategoryBrand(cat.categoryName)
    if (!brandIndex.has(brand)) {
      brandIndex.set(brand, list.length)
      list.push({ brand, items: [] })
    }
    list[brandIndex.get(brand)].items.push({ ...cat, displayName })
  })
  return list
})

const totalPesos = computed(() => rows.value.reduce((s, c) => s + (c.salesAmount || 0), 0))
const totalPiezas = computed(() => rows.value.reduce((s, c) => s + (c.salesQty || 0), 0))

function subtotal(items, key) {
  return items.reduce((s, c) => s + (c[key] || 0), 0)
}
</script>

<template>
  <div class="mx-auto my-3 max-w-3xl">
    <div class="flex items-center justify-between rounded-xl bg-blue-600 px-4 py-2 font-extrabold text-white text-sm min-h-11">
      <span>Detalle — {{ title }}</span>
      <span class="cursor-pointer rounded-lg bg-black/20 px-3 py-1 text-xs font-bold" @click="emit('close')">Cerrar ✕</span>
    </div>

    <div class="mt-1.5 overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div class="grid grid-cols-[1fr_180px_130px] gap-1.5 border-b border-base-300 bg-base-200 px-3.5 py-2 font-extrabold sticky top-0 z-10">
        <div></div>
        <div class="text-right">Pesos</div>
        <div class="text-right">Piezas</div>
      </div>

      <div v-if="detail.loading" class="px-3 py-2.5 text-base-content/60">Cargando...</div>
      <div v-else-if="detail.error" class="px-3 py-2.5 text-error">{{ detail.error }}</div>
      <div v-else-if="!rows.length" class="px-3 py-2.5 text-base-content/40">Sin ventas en este período.</div>

      <template v-for="group in groups" :key="group.brand">
        <div class="grid grid-cols-[1fr_180px_130px] gap-1.5 bg-blue-500 px-3.5 py-2 font-extrabold uppercase tracking-wide text-white text-base">
          <div>{{ group.brand }}</div><div /><div />
        </div>

        <div
          v-for="cat in group.items"
          :key="cat.categoryId || cat.displayName"
          class="grid grid-cols-[1fr_180px_130px] gap-1.5 border-b border-dashed border-base-300 py-2 pl-6 pr-3.5 text-base-content/80"
        >
          <div>{{ cat.displayName }}</div>
          <div class="text-right">${{ Math.round(cat.salesAmount || 0).toLocaleString('en-US') }}</div>
          <div class="text-right">{{ Math.round(cat.salesQty || 0).toLocaleString('en-US') }}</div>
        </div>

        <div
          v-if="groups.length > 1 && group.items.length > 1"
          class="grid grid-cols-[1fr_180px_130px] gap-1.5 bg-base-300/60 py-2 pl-6 pr-3.5 italic font-semibold text-base-content/70"
        >
          <div>Subtotal {{ group.brand }}</div>
          <div class="text-right">${{ Math.round(subtotal(group.items, 'salesAmount')).toLocaleString('en-US') }}</div>
          <div class="text-right">{{ Math.round(subtotal(group.items, 'salesQty')).toLocaleString('en-US') }}</div>
        </div>
      </template>

      <div v-if="rows.length > 0" class="grid grid-cols-[1fr_180px_130px] gap-1.5 border-t-2 border-blue-600 px-3.5 py-2 font-extrabold">
        <div>Total</div>
        <div class="text-right">${{ Math.round(totalPesos).toLocaleString('en-US') }}</div>
        <div class="text-right">{{ Math.round(totalPiezas).toLocaleString('en-US') }}</div>
      </div>
    </div>
  </div>
</template>
