export const TYPE_NAME_MAP = {
  TC0001: 'BORDADOR',
  TC0002: 'IMPRESOR',
  TC0004: 'COMERCIALIZADOR',
  TC0003: 'PROMOCIONAL',
  TC0005: 'TEXTILES (UNIFORMES)',
  TC0006: 'USO PERSONAL',
}

export const TYPE_CODE_MAP = Object.fromEntries(
  Object.entries(TYPE_NAME_MAP).map(([code, name]) => [name, code])
)

export const CUST_TYPES = [
  'BORDADOR',
  'IMPRESOR',
  'TEXTILES (UNIFORMES)',
  'COMERCIALIZADOR',
  'PROMOCIONAL',
  'USO PERSONAL',
  'Sin clasificar',
]

export const DEFAULT_LINE_PRODUCTS = [
  { Id: '01', Name: 'PLAYERAS', order: 9999 },
  { Id: '02', Name: 'CAMISAS', order: 9999 },
  { Id: '03', Name: 'GORRAS', order: 9999 },
  { Id: '04', Name: 'ROPA DE INVIERNO', order: 9999 },
  { Id: '05', Name: 'SERIGRAFIA', order: 9999 },
  { Id: '06', Name: 'BORDADO', order: 9999 },
  { Id: '07', Name: 'POLOS', order: 9999 },
  { Id: '08', Name: 'BOLSAS', order: 9999 },
  { Id: '09', Name: 'TOALLA', order: 9999 },
]

export function norm(v) {
  return (v || '').toString().trim().toUpperCase()
}

export function safeJsonParse(s, fallback) {
  try { return JSON.parse(s) } catch { return fallback }
}

export function formatDateMDY(date) {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${month}/${day}/${year}`
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function getPotentialFactorFromState({ selectedWeek, dateSelect, dateEndSelect }) {
  if (selectedWeek) return 1
  if (dateSelect instanceof Date && dateEndSelect instanceof Date) {
    const start = dateSelect
    const end = dateEndSelect
    const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()
    if (sameMonth) {
      const y = start.getFullYear()
      const m = start.getMonth()
      const dim = daysInMonth(y, m)
      const daysSelected = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1
      return Math.min(daysSelected / dim, 1)
    }
  }
  return 1
}

export function getSellerDepartmentId(seller) {
  return String(
    seller?.departmentId ?? seller?.department_id ?? seller?.deptId ?? seller?.dept_id ?? ''
  ).trim()
}

export function isAdminLikeDepartment(dep) {
  const d = String(dep || '').trim()
  return d === '001' || d === '002' || d === '008' || d === '011'
}

// PosUser (API-Base) se serializa con los nombres de columna crudos de la BD
// (snake_case: sales_person_id, department_id), no camelCase.
export function getUserDeptId(user) {
  return String(user?.departmentId ?? user?.department_id ?? '').trim()
}

export function getUserSalesPersonId(user) {
  return String(user?.salesPersonId || user?.salespersonId || user?.sales_person_id || '').trim().toUpperCase()
}

export function filterSellersForUser(data = [], user) {
  const dep = getUserDeptId(user)

  if (dep === '001' || dep === '002' || dep === '011') return Array.isArray(data) ? data : []

  if (dep === '008') {
    return Array.isArray(data)
      ? data.filter((s) => getSellerDepartmentId(s) === '005')
      : []
  }
  const sp = getUserSalesPersonId(user)
  return Array.isArray(data) ? data.filter((s) => s.salesPersonId === sp) : []
}

export function filterByType(custType, typeName) {
  return (custType || []).filter((cust) =>
    typeName === 'Sin clasificar'
      ? !cust.typeName && !cust.typeId
      : cust.typeName === typeName
  )
}

export function prorateSalesObjetive(data, realDays) {
  return data.map((seller) => ({
    ...seller,
    salesObjetive: (seller.salesObjetive || 0) * realDays / 30,
  }))
}

export function computeProgress(data, filterType) {
  return data.reduce(
    (sum, seller) =>
      sum + (seller.custType || []).reduce(
        (s, c) => s + (filterType === 'salesAmount' ? c.salesAmount || 0 : c.salesQuantity || 0),
        0
      ),
    0
  )
}

export function computeGoal(data) {
  return data.reduce((sum, seller) => sum + (seller.salesObjetive || 0), 0)
}

export function makeZeroLineProducts() {
  return DEFAULT_LINE_PRODUCTS.map((lp) => ({
    ...lp,
    salesAmount: 0,
    salesQuantity: 0,
  }))
}

export function normalizeLineProducts(lineProducts) {
  const base = makeZeroLineProducts()
  const idx = new Map(base.map((lp, i) => [norm(lp.Name), i]))

  const extra = []
  const arr = Array.isArray(lineProducts) ? lineProducts : []

  arr.forEach((lp) => {
    const name = (lp?.Name || lp?.name || '').toString().trim()
    if (!name) return

    const key = norm(name)
    const amount = Number(lp?.salesAmount || 0)
    const qty = Number(lp?.salesQuantity || 0)
    const ord = Number.isFinite(lp?.order) ? lp.order : 9999

    if (idx.has(key)) {
      const i = idx.get(key)
      base[i] = {
        ...base[i],
        salesAmount: amount,
        salesQuantity: qty,
        order: Number.isFinite(ord) ? ord : base[i].order,
      }
    } else {
      extra.push({
        Id: lp?.Id || lp?.id || '',
        Name: name,
        order: ord,
        salesAmount: amount,
        salesQuantity: qty,
      })
    }
  })

  const merged = [...base, ...extra]

  merged.sort(
    (a, b) =>
      (Number(a.order ?? 9999) - Number(b.order ?? 9999)) ||
      String(a.Name || '').localeCompare(String(b.Name || ''), 'es')
  )

  return merged
}

export function slimCustomer(c) {
  return {
    id: c?.id || '',
    name: c?.name || '',
    distributionChannel: c?.distributionChannel || '',
    territory: (c?.territory || c?.territoryId || '').toString().trim(),
    customerType: c?.customerType || null,
    lastVisitDate: c?.lastVisitDate || null,
    potential: Number(c?.potential || 0),
    percentaje: Number(c?.percentaje || 0),
  }
}

export function buildTerritoryIndex(rows = []) {
  const sellerToTerritory = {}
  const territoryToSellers = {}
  const territories = []
  const seen = new Set()

  rows.forEach((r) => {
    const sp = norm(r.salesPersonId || r.sales_person_id || r.slspsn || r.sellerId)
    const terrId = norm(r.id || r.territoryId || r.territory || r.terrId)
    const terrName = (r.name || r.territoryName || r.territory || terrId || '').toString().trim()
    if (terrId && !seen.has(terrId)) {
      territories.push({ value: terrId, label: terrName })
      seen.add(terrId)
    }

    if (!sp || !terrId) return

    sellerToTerritory[sp] = terrId

    if (!territoryToSellers[terrId]) territoryToSellers[terrId] = []
    if (!territoryToSellers[terrId].includes(sp)) territoryToSellers[terrId].push(sp)
  })

  territories.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return { sellerToTerritory, territoryToSellers, territories }
}

export function extractTerritoriesArray(json) {
  if (!json) return []
  const raw =
    json?.read?.[0]?.data ??
    json?.data ??
    json?.territories ??
    json

  return Array.isArray(raw) ? raw : []
}

export function extractCustomersArray(json) {
  if (json?.read?.[0]?.data && Array.isArray(json.read[0].data)) return json.read[0].data
  if (Array.isArray(json?.data)) return json.data
  if (Array.isArray(json)) return json
  return []
}

export function buildCustomersBySellerWithTerritory(customers = [], territoryToSellers = {}) {
  const map = {}
  const seen = {}

  const add = (sellerId, c) => {
    const s = norm(sellerId)
    const customerId = norm(c.id)
    if (!s || !customerId) return

    if (!map[s]) map[s] = []
    if (!seen[s]) seen[s] = new Set()
    if (seen[s].has(customerId)) return

    seen[s].add(customerId)

    const typeId = c.customerType || null

    map[s].push({
      customerId,
      customerName: (c.name || '').toString().trim(),
      territory: c.territory || '',
      typeId,
      typeName: typeId ? (TYPE_NAME_MAP[typeId] || null) : null,
      lastVisitDate: c.lastVisitDate || null,
      potential: Number(c.potential || 0),
      percentaje: Number(c.percentaje || 0),
    })
  }

  customers.forEach((c) => {
    const terr = norm(c.territory)
    const sellers = terr ? territoryToSellers[terr] : null
    if (Array.isArray(sellers) && sellers.length) {
      sellers.forEach((sid) => add(sid, c))
      return
    }
    const sellerKey = norm(c.distributionChannel)
    if (sellerKey) add(sellerKey, c)
  })

  return map
}

export function mergeKpiIntoBase(kpiSellers = [], customersBySeller = {}) {
  if (!Array.isArray(kpiSellers)) return []

  return kpiSellers.map((seller) => {
    const sellerId = norm(seller.salesPersonId)
    const base = (customersBySeller[sellerId] || []).map((c) => ({
      ...c,
      salesAmount: Number(c.salesAmount || 0),
      salesQuantity: Number(c.salesQuantity || 0),
      LineProduct: normalizeLineProducts(c.LineProduct),
    }))

    const map = new Map(base.map((c) => [norm(c.customerId), { ...c }]))
    ;(seller.custType || []).forEach((sc) => {
      const cid = norm(sc.customerId)
      if (!cid) return

      const prev =
        map.get(cid) ||
        ({
          customerId: cid,
          customerName: sc.customerName || '',
          typeId: sc.typeId || null,
          typeName: sc.typeName || null,
          potential: Number(sc.potential || 0),
          percentaje: Number(sc.percentaje || 0),
          lastVisitDate: sc.lastVisitDate || null,
          salesAmount: 0,
          salesQuantity: 0,
          LineProduct: normalizeLineProducts([]),
        })

      const incomingLP =
        Array.isArray(sc.LineProduct) && sc.LineProduct.length
          ? normalizeLineProducts(sc.LineProduct)
          : prev.LineProduct

      map.set(cid, {
        ...prev,
        ...sc,
        salesAmount: Number(sc.salesAmount ?? prev.salesAmount ?? 0),
        salesQuantity: Number(sc.salesQuantity ?? prev.salesQuantity ?? 0),
        LineProduct: incomingLP,
      })
    })
    const custType = [...map.values()].map((c) => ({
      ...c,
      salesAmount: Number(c.salesAmount || 0),
      salesQuantity: Number(c.salesQuantity || 0),
      LineProduct: normalizeLineProducts(c.LineProduct),
    }))

    return {
      ...seller,
      custType,
    }
  })
}

export function buildLineProductResume(customers = [], filterType = 'salesAmount') {
  const totalClients = customers.length
  const map = new Map()

  const getClientKey = (c) =>
    (c.customerId || c.customer_id || c.customerName || c.name || '').toString().trim()

  customers.forEach((cust) => {
    const clientKey = getClientKey(cust) || JSON.stringify(cust)

    ;(cust.LineProduct || []).forEach((lp) => {
      const name = (lp.Name || '').toString().trim()
      if (!name) return

      const key = name.toUpperCase()
      const value =
        filterType === 'salesQuantity'
          ? Number(lp.salesQuantity || 0)
          : Number(lp.salesAmount || 0)

      if (!map.has(key)) {
        map.set(key, {
          name,
          total: 0,
          clients: new Set(),
          order: Number.isFinite(lp.order) ? lp.order : 9999,
        })
      }

      const acc = map.get(key)
      acc.total += value
      acc.order = Math.min(acc.order, Number.isFinite(lp.order) ? lp.order : 9999)
      if (value > 0) acc.clients.add(clientKey)
    })
  })

  return [...map.values()]
    .sort((a, b) => (a.order - b.order) || (b.clients.size - a.clients.size) || (b.total - a.total))
    .map((x) => ({
      lineName: x.name,
      total: x.total,
      clientsWithSales: x.clients.size,
      totalClients,
    }))
}

export function parseCategoryBrand(name) {
  const match = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (match) return { displayName: match[1].trim() || name, brand: match[2].trim() }
  return { displayName: name, brand: 'SIN MARCA' }
}

export function getSalesPersonId(user) {
  const dep = getUserDeptId(user)
  const sp = getUserSalesPersonId(user)
  if (dep === '001' || dep === '002' || dep === '008') return 'VANG'
  return sp || ''
}

export function getWeek(date = new Date()) {
  const now = date
  let day = now.getDay()
  day = day >= 0 ? day : day + 7
  const onejan = new Date(now.getFullYear(), 0, 1)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfYear = Math.floor((today - onejan) / 86400000) + 1

  let weeknum
  if (day < 4) {
    weeknum = Math.floor((dayOfYear + day - 1) / 7) + 1
    if (weeknum > 52) {
      const nYear = new Date(now.getFullYear() + 1, 0, 1)
      let nday = nYear.getDay()
      nday = nday >= 0 ? nday : nday + 7
      weeknum = nday < 4 ? 1 : 53
    }
  } else {
    weeknum = Math.floor((dayOfYear + day - 1) / 7)
  }

  return weeknum
}

export function getWeekNumber(dateString) {
  const date = new Date(dateString)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const firstThursday = new Date(date.getFullYear(), 0, 4)
  const weekNumber = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
  return weekNumber
}

export function getWeekDateRange(weekNumber) {
  const year = new Date().getFullYear()
  const firstDayOfYear = new Date(year, 0, 1)
  const firstDayOfWeek = firstDayOfYear.getDay()
  const offsetToMonday = (firstDayOfWeek === 0 ? 1 : 8 - firstDayOfWeek)
  const startDate = new Date(year, 0, 1 + offsetToMonday + (weekNumber - 2) * 7)
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 5)
  return { startDate, endDate }
}

export const MONTHS = [
  { label: 'Enero', value: '01' },
  { label: 'Febrero', value: '02' },
  { label: 'Marzo', value: '03' },
  { label: 'Abril', value: '04' },
  { label: 'Mayo', value: '05' },
  { label: 'Junio', value: '06' },
  { label: 'Julio', value: '07' },
  { label: 'Agosto', value: '08' },
  { label: 'Septiembre', value: '09' },
  { label: 'Octubre', value: '10' },
  { label: 'Noviembre', value: '11' },
  { label: 'Diciembre', value: '12' },
]
