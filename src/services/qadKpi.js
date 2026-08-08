import axios from 'axios'

const qad = axios.create({
  baseURL: import.meta.env.VITE_QAD_API_URL || 'https://qad.vlank.com.mx/',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

// El envoltorio de QAD es { "<claveVariable>": [ { status, data: [...] } ] } — la
// clave cambia según el endpoint, así que se toma el primer valor del objeto en
// vez de asumir un nombre fijo (mismo criterio que getResultResponse/formatResponse
// en point-of-sale/src/services/erpconnect/helpers/index.js).
function unwrap(response) {
  const data = response?.data
  if (!data || typeof data !== 'object') return []
  const [result] = Object.values(data)
  const first = Array.isArray(result) ? result[0] : result
  return first?.data ?? []
}

export async function salesByTypeCust({ week = '', salesPersonId = '', month = '', dateStart = '', dateEnd = '' } = {}) {
  const response = await qad.get('kpi/v1/salesByTypeCust', {
    params: { week, salesPersonId, month, dateStart, dateEnd },
  })
  return unwrap(response)
}

export async function salesByCategory(salespsnId = '', typeCustomer = '', category = '', startDate = '', endDate = '') {
  const response = await qad.get('kpi/salesByCategory', {
    params: { salespsnId, typeCustomer, category, startDate, endDate },
  })
  return response?.data?.result?.[0]?.ttdetailCate || []
}

export default { salesByTypeCust, salesByCategory }
