import axios from 'axios'

const client = axios.create({
  baseURL: '/node-api/inventory',
  headers: { 'Content-Type': 'application/json' },
})

const noCache = { 'Cache-Control': 'no-cache' }
const userHeader = (user) => ({ 'X-Inventory-User': JSON.stringify(user || {}) })

export function getBrands(site) {
  return client.get('/brands', { params: { site }, headers: noCache, timeout: 30000 })
}

export function getBrandSummary({ site, brand_name, include_stock = '0', pending_only = '1' }) {
  return client.get('/brand-summary', {
    params: { site, brand_name, include_stock, pending_only },
    headers: noCache,
    timeout: 30000,
  })
}

export function getSystemStock({ site, product_id }) {
  return client.get('/system-stock', { params: { site, product_id }, headers: noCache, timeout: 30000 })
}

export function getArticleBreakdown({ site, id, color_label, size_label }) {
  return client.get('/article-breakdown', {
    params: {
      site, id, like: '0', product_id_exact: id,
      color_label, size_label, include_stock: '1',
    },
    headers: noCache,
    timeout: 30000,
  })
}

export function getCommittedQty() {
  return client.get('/committed-qty', { headers: noCache, timeout: 15000 })
}

export function getDoneValidations(site) {
  return client.get('/count-validations/done', { params: { site }, headers: noCache, timeout: 10000 })
}

export function getPendingRecounts(site, user) {
  return client.get('/count-validations/pending', {
    params: { site },
    headers: { ...noCache, ...userHeader(user) },
    timeout: 15000,
  })
}

export function deleteCountsProduct({ site, product_id, color_label, size_label }, user) {
  return client.delete('/counts/product', {
    params: { site, product_id, color_label, size_label },
    headers: userHeader(user),
  })
}

export function postCountValidation(body, user) {
  return client.post('/count-validations', body, { headers: userHeader(user) })
}

export function putCountValidationDone(id, user) {
  return client.put(`/count-validations/${id}/done`, {}, { headers: userHeader(user) })
}

export function putLocationCount(body, user) {
  return client.put('/location-count', body, { headers: userHeader(user) })
}

export function getSessionToday({ site, date }) {
  return client.get('/sessions/today', { params: { site, date }, headers: noCache, timeout: 10000 })
}

export function postValidateSessionToday(body) {
  return client.post('/sessions/validate-today', body, { timeout: 10000 })
}

export function postCycleCount(body, timeout = 30000) {
  return client.post('/cycle-count', body, { timeout })
}

export function getCycleCountReport({ site, date }) {
  return client.get('/cycle-count/report', { params: { site, date }, headers: noCache, timeout: 30000 })
}
