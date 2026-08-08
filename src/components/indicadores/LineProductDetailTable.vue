<script setup>
import { ref, computed } from 'vue'
import { salesByCategory } from '@/services/qadKpi'
import { useSyncScroll } from '@/composables/useSyncScroll'
import { buildLineProductResume, formatDateMDY, TYPE_CODE_MAP } from '@/utils/indicadoresHelpers'
import CategoryDetailPanel from './CategoryDetailPanel.vue'

const props = defineProps({
  custRows: { type: Array, required: true },
  seller: { type: Object, required: true },
  typeName: { type: String, required: true },
  filterType: { type: String, default: 'salesAmount' },
  groupKey: { type: String, required: true },
  dateSelect: { type: Date, default: null },
  dateEndSelect: { type: Date, default: null },
})

const { onScroll } = useSyncScroll()

const activeLineName = ref(null)
const categoryDetail = ref({})

const resume = computed(() => buildLineProductResume(props.custRows, props.filterType))
const resumeByName = computed(() => new Map(resume.value.map((r) => [r.lineName, r])))

const lineIdMap = computed(() => {
  const orderMap = new Map()
  const idMap = new Map()
  props.custRows.forEach((cust) => {
    ;(cust.LineProduct || []).forEach((lp) => {
      const name = (lp.Name || '').toString().trim()
      if (!name) return
      const ord = Number.isFinite(lp.order) ? lp.order : 9999
      if (!orderMap.has(name) || ord < orderMap.get(name)) orderMap.set(name, ord)
      if (!idMap.has(name) && lp.Id) idMap.set(name, lp.Id)
    })
  })
  return { orderMap, idMap }
})

const allLineNamesGlobal = computed(() => {
  const { orderMap } = lineIdMap.value
  return [...orderMap.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)
})

const sortedCustRows = computed(() =>
  [...props.custRows].sort((a, b) => (b.potential || 0) - (a.potential || 0))
)

async function handleLineClick(lineName) {
  if (activeLineName.value === lineName) { activeLineName.value = null; return }
  activeLineName.value = lineName
  if (categoryDetail.value[lineName]) return

  const typeCode = TYPE_CODE_MAP[props.typeName]
  if (!typeCode) return
  const lineId = lineIdMap.value.idMap.get(lineName) || ''
  if (!lineId) return

  const today = new Date()
  const startDate = props.dateSelect instanceof Date
    ? formatDateMDY(props.dateSelect)
    : formatDateMDY(new Date(today.getFullYear(), today.getMonth(), 1))
  const endDate = props.dateEndSelect instanceof Date ? formatDateMDY(props.dateEndSelect) : formatDateMDY(today)

  categoryDetail.value = { ...categoryDetail.value, [lineName]: { loading: true, data: null, error: null } }
  try {
    const cats = (await salesByCategory(props.seller.salesPersonId, typeCode, parseInt(lineId, 10), startDate, endDate))
      .filter((c) => (c.salesAmount || 0) > 0 || (c.salesQty || 0) > 0)
    categoryDetail.value = { ...categoryDetail.value, [lineName]: { loading: false, data: cats, error: null } }
  } catch {
    categoryDetail.value = { ...categoryDetail.value, [lineName]: { loading: false, data: null, error: 'Error al cargar categorías' } }
  }
}

function lineMapFor(cust) {
  const map = {}
  ;(cust.LineProduct || []).forEach((lp) => {
    const key = (lp.Name || '').toString().trim()
    if (!key) return
    map[key] = { amount: lp.salesAmount || 0, quantity: lp.salesQuantity || 0 }
  })
  return map
}

function visitInfo(cust) {
  const LIMIT_DAYS = 40
  const visitDate = cust.lastVisitDate ? new Date(cust.lastVisitDate) : null
  const validVisit = visitDate && !Number.isNaN(visitDate.getTime())
  const today = new Date()
  const diffDays = validVisit
    ? Math.floor(
        (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
          Date.UTC(visitDate.getFullYear(), visitDate.getMonth(), visitDate.getDate())) / 86400000
      )
    : null
  const isOldVisit = !validVisit || diffDays >= LIMIT_DAYS
  const lastVisitLabel = validVisit
    ? visitDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Sin registro'
  return { isOldVisit, lastVisitLabel, diffDays, validVisit }
}
</script>

<template>
  <div v-if="!custRows.length" class="py-3 text-base-content/50">No hay clientes para este tipo.</div>

  <table v-else class="lineTable mt-2 w-full border border-base-300 text-sm">
    <thead>
      <tr>
        <th class="border border-base-300 px-2 py-1">Cliente</th>
        <th class="border border-base-300 px-2 py-1">Pot</th>
        <th class="border border-base-300 px-2 py-1">{{ filterType === 'salesAmount' ? 'Pesos' : 'Piezas' }}</th>
        <th class="border border-base-300 px-2 py-1">Detalle por línea</th>
      </tr>
      <tr>
        <th colspan="3" class="border border-base-300"></th>
        <th class="lineHeadCell border border-base-300">
          <div class="lineScrollRow lineHeadScroll" :data-sync-scroll="groupKey" @scroll="onScroll($event, groupKey)">
            <div
              v-for="lineName in allLineNamesGlobal"
              :key="lineName"
              class="lineResumeCard"
              :class="[
                (resumeByName.get(lineName)?.clientsWithSales || 0) === 0 ? 'zero' : 'has',
                activeLineName === lineName ? 'active-detail' : '',
                TYPE_CODE_MAP[typeName] ? 'cursor-pointer' : '',
              ]"
              :style="lineName === 'ROPA DE INVIERNO' ? { flex: '0 0 165px', width: '165px', minWidth: '165px', maxWidth: '165px' } : {}"
              :title="TYPE_CODE_MAP[typeName] ? `Ver detalle: ${lineName}` : lineName"
              @click="TYPE_CODE_MAP[typeName] && handleLineClick(lineName)"
            >
              <div class="lineResumeName">{{ lineName }}</div>
              <div class="lineResumeMeta">
                {{ resumeByName.get(lineName)?.clientsWithSales || 0 }}/{{ resumeByName.get(lineName)?.totalClients ?? custRows.length }} clientes
              </div>
              <div class="lineResumeTotal">
                {{ filterType === 'salesAmount'
                  ? `$${Math.round(Number(resumeByName.get(lineName)?.total || 0)).toLocaleString('en-US')}`
                  : Number(resumeByName.get(lineName)?.total || 0).toLocaleString('en-US') }}
              </div>
            </div>
          </div>
        </th>
      </tr>
    </thead>
    <tbody>
      <Transition name="fade">
        <tr v-if="activeLineName && categoryDetail[activeLineName]" :key="activeLineName">
          <td colspan="4" class="p-0 border border-base-300">
            <CategoryDetailPanel
              :title="activeLineName"
              :detail="categoryDetail[activeLineName]"
              @close="activeLineName = null"
            />
          </td>
        </tr>
      </Transition>

      <tr v-for="(cust, i) in sortedCustRows" :key="i" class="text-center">
        <td class="border border-base-300 p-3 text-left">
          <div
            class="flex flex-col"
            :title="`Última visita: ${visitInfo(cust).lastVisitLabel}${visitInfo(cust).validVisit ? ` (${visitInfo(cust).diffDays} días)` : ''}`"
          >
            <span
              v-for="(part, idx) in (cust.customerName || '').toString().split(' ').filter(Boolean)"
              :key="idx"
              :class="visitInfo(cust).isOldVisit ? 'text-error' : 'text-base-content/80'"
            >{{ part }}</span>
          </div>
        </td>

        <td class="border border-base-300">${{ Math.round(cust.potential || 0).toLocaleString('en-US') }}</td>

        <td class="border border-base-300">
          {{ filterType === 'salesAmount'
            ? `$${Math.round(cust.salesAmount || 0).toLocaleString('en-US')}`
            : (cust.salesQuantity || 0).toLocaleString('en-US') }}
        </td>

        <td class="lineBodyCell border border-base-300">
          <div class="lineScrollRow lineBodyScroll" :data-sync-scroll="groupKey" @scroll="onScroll($event, groupKey)">
            <div
              v-for="lineName in allLineNamesGlobal"
              :key="lineName"
              class="lineChip"
              :style="lineName === 'ROPA DE INVIERNO' ? { flex: '0 0 165px', width: '165px', minWidth: '165px', maxWidth: '165px' } : {}"
            >
              <div class="font-bold">{{ lineName }}</div>
              <div
                class="font-bold"
                :class="(filterType === 'salesAmount' ? Number(lineMapFor(cust)[lineName]?.amount || 0) === 0 : Number(lineMapFor(cust)[lineName]?.quantity || 0) === 0) ? 'text-error' : ''"
              >
                {{ filterType === 'salesAmount'
                  ? `$${Math.round(Number(lineMapFor(cust)[lineName]?.amount || 0)).toLocaleString('en-US')}`
                  : Number(lineMapFor(cust)[lineName]?.quantity || 0).toLocaleString('en-US') }}
              </div>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.fade-enter-active {
  transition: opacity .18s ease, transform .18s cubic-bezier(.34, 1.56, .64, 1);
}

.fade-leave-active {
  transition: opacity .12s ease, transform .12s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(.97) translateY(-4px);
}

.lineHeadCell,
.lineBodyCell {
  padding: 0;
}

.lineScrollRow {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 10px;
  justify-content: flex-start;
  align-items: center;
  padding: 10px;
  scrollbar-width: thin;
}

.lineScrollRow::-webkit-scrollbar {
  height: 10px;
}

.lineScrollRow::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, .18);
  border-radius: 999px;
}

.lineScrollRow::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, .06);
  border-radius: 999px;
}

.lineChip {
  flex: 0 0 140px;
  width: 140px;
  min-width: 140px;
  max-width: 140px;
  white-space: nowrap;
  font-size: 16px;
  text-align: center;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background-color: #f1f1f1;
  box-sizing: border-box;
}

.lineResumeCard {
  flex: 0 0 140px;
  width: 140px;
  min-width: 140px;
  max-width: 140px;
  padding: 8px 6px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, .12);
  background: linear-gradient(180deg, #ffffff 0%, #fbfbfd 100%);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .10);
  line-height: 1.1;
  text-align: center;
  box-sizing: border-box;
  transition: transform .12s ease, box-shadow .12s ease;
}

.lineResumeCard:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, .14);
}

.lineResumeCard.zero {
  opacity: .5;
  filter: grayscale(.15);
}

.lineResumeName {
  font-weight: 900;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #111;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lineResumeMeta {
  margin-top: 4px;
  font-size: 14px;
  color: #4b5563;
}

.lineResumeTotal {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 900;
  color: #0f172a;
}

@keyframes pulseGreen {
  0%, 100% {
    box-shadow: 0 4px 12px rgba(0, 0, 0, .10), 0 0 0 2px #28a745;
  }
  50% {
    box-shadow: 0 6px 18px rgba(0, 0, 0, .15), 0 0 0 4px #28a745, 0 0 12px rgba(40, 167, 69, 0.5);
  }
}

.lineResumeCard.active-detail {
  outline: none !important;
  animation: pulseGreen 1.4s ease-in-out infinite;
}
</style>
