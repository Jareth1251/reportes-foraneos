import { ref } from 'vue'
import Swal from 'sweetalert2'
import carrierCajerasService from '@/services/carrierCajeras'
import {
  FORANEOS_CARRIER_IDS,
  CARRIER_ID_MAP,
  SUCURSALES_FILTRO,
  buildKey,
  normalizar,
  getAgentSite,
  getSucursalesDeCajera,
  dedupeCajeras,
  pickCanonicalSitio,
} from '@/utils/cajerasSucursalHelpers'

export function useCajerasSucursal(user) {
  const loading = ref(false)
  const todasLasCajeras = ref([])
  const cajerasPorSucursal = ref({
    domicilio: [],
    cliente_pasa: [],
    saltillo: [],
    foraneos: [],
    cdmx: [],
  })

  async function cargarCajeras() {
    loading.value = true

    try {
      const [dbCajerasRaw, agentes] = await Promise.all([
        carrierCajerasService.getAsignaciones(),
        carrierCajerasService.getAgentesCatalogo(),
      ])

      const dbCajeras = Array.isArray(dbCajerasRaw?.[0]) ? dbCajerasRaw[0] : dbCajerasRaw

      const bdMap = new Map()

      ;(dbCajeras || []).forEach((asig) => {
        const sitio = String(asig.site || '').trim()
        const key = buildKey(asig.cajera_code || asig.cajera_name, sitio)
        if (!bdMap.has(key)) {
          bdMap.set(key, {
            id: `${asig.cajera_code || asig.id}__${sitio}`,
            row_ids: [],
            nombre: asig.cajera_name,
            cajera_code: asig.cajera_code,
            sitio,
            carrier_ids: [],
            activa: asig.activa === 1,
            from_bd: true,
            from_catalog: false,
          })
        }

        const item = bdMap.get(key)
        item.row_ids.push(asig.id)

        const carrierId = asig.carrier_id != null ? Number(asig.carrier_id) : null
        if (carrierId && !item.carrier_ids.includes(carrierId)) {
          item.carrier_ids.push(carrierId)
        }

        if (asig.activa === 1) item.activa = true
      })

      ;(agentes || [])
        .filter((agent) => String(agent.department_id || '').trim() === '004')
        .forEach((agent) => {
          const agentSite = getAgentSite({ site: agent.site }, user?.value)
          const key = buildKey(agent.id || agent.name, agentSite)
          if (!bdMap.has(key)) {
            bdMap.set(key, {
              id: `${agent.id}__${agentSite}`,
              row_ids: [],
              nombre: agent.name,
              cajera_code: agent.id,
              sitio: agentSite,
              carrier_ids: [],
              activa: true,
              from_bd: false,
              from_catalog: true,
            })
          }
        })

      const results = dedupeCajeras(Array.from(bdMap.values())).sort((a, b) =>
        String(a.nombre || '').localeCompare(String(b.nombre || ''))
      )

      const porSucursal = {
        domicilio: [],
        cliente_pasa: [],
        saltillo: [],
        foraneos: [],
        cdmx: [],
      }

      results.forEach((cajera) => {
        getSucursalesDeCajera(cajera.carrier_ids || [], cajera.sitio).forEach((sucursalKey) => {
          if (!porSucursal[sucursalKey].some((c) => String(c.id) === String(cajera.id))) {
            porSucursal[sucursalKey].push({ ...cajera, activa: cajera.activa !== false })
          }
        })
      })

      todasLasCajeras.value = results
      cajerasPorSucursal.value = porSucursal
    } catch (error) {
      console.error('Error al cargar cajeras:', error)
      Swal.fire('Error', 'No se pudieron cargar las cajeras', 'error')
    } finally {
      loading.value = false
    }
  }

  async function handleAsignar({ cajera, sucursal, sitio }) {
    if (!cajera) {
      Swal.fire('Atención', 'Selecciona una cajera', 'warning')
      return
    }
    if (!sucursal) {
      Swal.fire('Atención', 'Selecciona una sucursal', 'warning')
      return
    }
    if (!sitio) {
      Swal.fire('Atención', 'Selecciona un sitio', 'warning')
      return
    }

    try {
      const result = await Swal.fire({
        title: 'Confirmar asignación',
        text: `¿Asignar a ${cajera.label || cajera.nombre} a ${sucursal.label} (${sitio.label})?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Asignar',
        cancelButtonText: 'Cancelar',
      })

      if (!result.isConfirmed) return

      Swal.fire({
        title: 'Asignando...',
        text: 'Por favor espera',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      })

      const nombrePersona = cajera.nombre || cajera.label?.split('(')[0].trim()
      const codigoPersona = cajera.code || cajera.cajera_code
      const sitioObjetivo = String(sitio.id)

      const persona = todasLasCajeras.value.find((c) => {
        const mismoSitio = String(c.sitio || '') === sitioObjetivo
        const mismoCodigo = codigoPersona && String(c.cajera_code || c.code || '') === String(codigoPersona)
        const mismoNombre = normalizar(c.nombre) === normalizar(nombrePersona)
        return mismoSitio && (mismoCodigo || mismoNombre)
      })

      if (!persona) {
        Swal.fire('Error', `No se encontró la persona "${nombrePersona}" en el sitio ${sitioObjetivo}`, 'error')
        return
      }

      if (sucursal.id === 'foraneos') {
        const yaTieneForaneos = (persona.carrier_ids || []).some((id) =>
          FORANEOS_CARRIER_IDS.includes(Number(id))
        )

        if (yaTieneForaneos) {
          Swal.fire('Atención', `${persona.nombre} ya tiene asignaciones de Foráneos`, 'info')
          return
        }

        await carrierCajerasService.asignarForaneos({
          nombre: persona.nombre,
          sitio: sitioObjetivo,
          carrier_ids: FORANEOS_CARRIER_IDS,
          accion: 'asignar',
          cajera_code: persona.cajera_code || codigoPersona,
        })

        Swal.fire('Éxito', 'Foráneos asignados correctamente', 'success')
      } else {
        const carrierId = CARRIER_ID_MAP[sucursal.id]

        if (!carrierId) {
          Swal.fire('Error', 'No se pudo identificar la paquetería a asignar', 'error')
          return
        }

        if ((persona.carrier_ids || []).includes(Number(carrierId))) {
          Swal.fire('Atención', `${persona.nombre} ya está asignada a ${sucursal.label}`, 'info')
          return
        }

        await carrierCajerasService.asignarCajera({
          nombre: persona.nombre,
          sitio: sitioObjetivo,
          carrier_id: carrierId,
          accion: 'asignar',
          cajera_code: persona.cajera_code || codigoPersona,
        })

        Swal.fire('Éxito', `${persona.nombre} asignada a ${sucursal.label}`, 'success')
      }

      await cargarCajeras()
    } catch (error) {
      console.error('Error detallado al asignar:', error)
      Swal.fire('Error', `No se pudo asignar la cajera: ${error.message}`, 'error')
    }
  }

  async function removerAsignacion(cajeraId, sucursalId) {
    try {
      const cajera = todasLasCajeras.value.find((c) => String(c.id) === String(cajeraId))

      if (!cajera) {
        Swal.fire('Error', 'No se encontró la cajera', 'error')
        return
      }

      let carrierIdsAEliminar = []

      if (sucursalId === 'foraneos') {
        carrierIdsAEliminar = (cajera.carrier_ids || []).filter((id) =>
          FORANEOS_CARRIER_IDS.includes(Number(id))
        )
      } else if (sucursalId === 'cdmx') {
        carrierIdsAEliminar = [...(cajera.carrier_ids || [])]
      } else {
        const carrierId = CARRIER_ID_MAP[sucursalId]
        if (carrierId) {
          carrierIdsAEliminar = (cajera.carrier_ids || []).filter((id) => Number(id) === Number(carrierId))
        }
      }

      carrierIdsAEliminar = [...new Set(carrierIdsAEliminar.map(Number))].filter(Boolean)

      if (carrierIdsAEliminar.length === 0) {
        Swal.fire('Error', 'No se encontraron asignaciones para remover en esa sucursal', 'error')
        return
      }

      const nombreSucursal = SUCURSALES_FILTRO.find((s) => s.id === sucursalId)?.label || sucursalId

      const result = await Swal.fire({
        title: 'Remover asignación',
        text: `¿Quitar a ${cajera.nombre} de ${nombreSucursal}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Remover',
        confirmButtonColor: '#d33',
      })

      if (!result.isConfirmed) return

      Swal.fire({
        title: 'Removiendo...',
        text: 'Espera',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      })

      if (sucursalId === 'foraneos') {
        await carrierCajerasService.asignarForaneos({
          nombre: cajera.nombre,
          sitio: cajera.sitio,
          carrier_ids: carrierIdsAEliminar,
          accion: 'remover',
          cajera_code: cajera.cajera_code,
        })
      } else {
        await Promise.all(
          carrierIdsAEliminar.map((carrierId) =>
            carrierCajerasService.asignarCajera({
              nombre: cajera.nombre,
              sitio: cajera.sitio,
              carrier_id: carrierId,
              accion: 'remover',
              cajera_code: cajera.cajera_code,
            })
          )
        )
      }

      Swal.fire('Removida', 'Asignación removida correctamente', 'success')
      await cargarCajeras()
    } catch (error) {
      console.error('Error al remover asignación:', error)
      Swal.fire('Error', error.message || 'No se pudo remover la asignación', 'error')
    }
  }

  async function toggleActiva(cajeraId, activaActual, cajeraNombre) {
    try {
      const cajera = todasLasCajeras.value.find((c) => String(c.id) === String(cajeraId))

      if (!cajera) {
        Swal.fire('Error', 'No se encontró la cajera', 'error')
        return
      }

      const rowIds = [...new Set((cajera.row_ids || []).map(Number).filter(Boolean))]

      if (rowIds.length === 0) {
        Swal.fire('Atención', 'Esta cajera no tiene asignaciones guardadas en base de datos para cambiar su estado.', 'info')
        return
      }

      const nuevaActiva = !activaActual
      const accion = nuevaActiva ? 'activar' : 'desactivar'

      const result = await Swal.fire({
        title: `¿${accion === 'activar' ? 'Activar' : 'Desactivar'} cajera?`,
        text: `¿Estás seguro de ${accion} a ${cajera.nombre || cajeraNombre}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: `Sí, ${accion}`,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: nuevaActiva ? '#2e7d32' : '#d32f2f',
      })

      if (!result.isConfirmed) return

      Swal.fire({
        title: 'Procesando...',
        text: 'Por favor espera',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      })

      await Promise.all(rowIds.map((rowId) => carrierCajerasService.toggleActiva(rowId, nuevaActiva)))

      Swal.fire('Éxito', `Cajera ${accion === 'activar' ? 'activada' : 'desactivada'} correctamente`, 'success')

      await cargarCajeras()
    } catch (error) {
      console.error('Error al cambiar estado:', error)
      Swal.fire('Error', error.message || 'No se pudo cambiar el estado de la cajera', 'error')
    }
  }

  function getCajerasAdminPorSitio(sitio) {
    const porCodigo = new Map()
    todasLasCajeras.value.forEach((c) => {
      const codigo = normalizar(c.cajera_code || c.nombre)
      if (!porCodigo.has(codigo)) porCodigo.set(codigo, [])
      porCodigo.get(codigo).push(c)
    })

    return [...todasLasCajeras.value]
      .filter((c) => {
        const codigo = normalizar(c.cajera_code || c.nombre)
        const entries = porCodigo.get(codigo) || [c]
        const canonico = pickCanonicalSitio(entries)
        // canonico === null: conflicto sin resolver (activa en ambos sitios, o
        // inactiva en ambos sin carrier que lo desempate) -- se muestra en cada
        // sitio donde tiene fila para que el admin lo resuelva a mano.
        if (canonico === null) return String(c.sitio || '') === String(sitio)
        return String(canonico) === String(sitio)
      })
      .sort((a, b) => {
        if ((a.activa !== false) !== (b.activa !== false)) {
          return a.activa !== false ? -1 : 1
        }
        return String(a.nombre || '').localeCompare(String(b.nombre || ''))
      })
  }

  return {
    loading,
    todasLasCajeras,
    cajerasPorSucursal,
    cargarCajeras,
    handleAsignar,
    removerAsignacion,
    toggleActiva,
    getCajerasAdminPorSitio,
  }
}
