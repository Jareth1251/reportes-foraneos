import { api } from '@/config/axios'
import { setBusinessHoursExceptions } from '@/utils/businessHours'

// Excepciones al horario laboral de los reportes de tiempos (API-Base
// BusinessHoursExceptionController). Las captura cajas (002) en el módulo
// "Días no laborables"; las leen todos los reportes antes de calcular tiempos.

let inFlight = null

// Recarga el calendario (cada carga de reporte / botón "Actualizar" lo pide de
// nuevo para que un paro recién capturado aplique). Llamadas simultáneas
// comparten la misma petición. Si falla se queda con lo último cargado.
export function loadBusinessHoursExceptions() {
  if (!inFlight) {
    inFlight = api.get('/business-hours-exceptions')
      .then(({ data }) => {
        setBusinessHoursExceptions(data)
        return data
      })
      .catch((err) => {
        console.error('[businessHours] no se pudo cargar el calendario', err)
        return null
      })
      .finally(() => { inFlight = null })
  }
  return inFlight
}

export async function createBusinessHoursException(payload) {
  const { data } = await api.post('/business-hours-exceptions', payload)
  return data
}

export async function deleteBusinessHoursException(id) {
  await api.delete(`/business-hours-exceptions/${id}`)
}
