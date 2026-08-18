// Catálogo de módulos del selector y qué departamento ve cuál. Compartido entre
// ModuleSelectorView.vue (qué tarjetas mostrar) y router/index.js (qué rutas
// operativas — cajas/foraneos/almacen — puede entrar cada departamento).

export const MODULE_DEFS = {
  'cajas':                  { key: 'cajas',                  icon: '📦', label: 'Foráneos',                   desc: 'Gestionar llegadas, surtido, empaque y entrega de pedidos foráneos.',                     color: '#1565C0', bg: '#E3F2FD', border: '#90CAF9' },
  'foraneos':               { key: 'foraneos',               icon: '📦', label: 'Foráneos Cajas',             desc: 'Registrar llegadas, crear órdenes y gestionar el flujo de clientes foráneos.',            color: '#1565C0', bg: '#E3F2FD', border: '#90CAF9' },
  'almacen':                { key: 'almacen',                icon: '📦', label: 'Foráneos Almacén',           desc: 'Gestionar llegadas, surtido, empaque y entrega de pedidos foráneos.',                     color: '#1565C0', bg: '#E3F2FD', border: '#90CAF9' },
  'foraneos-reporte':       { key: 'foraneos-reporte',       icon: '📊', label: 'Reporte Foráneos',           desc: 'Consultar el estado de pedidos, entregas y estadísticas por paquetería.',                 color: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' },
  'checkin-reporte':        { key: 'checkin-reporte',        icon: '🎫', label: 'Reporte de Turnos',          desc: 'Consultar turnos en espera, tiempos de atención y detalle por estatus.',                  color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' },
  'pedidos-pagina-reporte': { key: 'pedidos-pagina-reporte', icon: '🧾', label: 'Reporte Pedidos de Página',  desc: 'Trazabilidad completa: tiempos por etapa, responsables y comprobante de pago.',           color: '#7C3AED', bg: '#EDE9FE', border: '#C4B5FD' },
  'indicadores-reporte':    { key: 'indicadores-reporte',    icon: '📈', label: 'Indicadores',                desc: 'Ventas por vendedor: clientes, presupuesto, potencial y desglose por línea de producto.', color: '#0F766E', bg: '#CCFBF1', border: '#5EEAD4' },
  'cajeras-sucursal':       { key: 'cajeras-sucursal',       icon: '🧑‍💼', label: 'Cajeras y Sucursal',      desc: 'Asignar cajeras a sucursales y paqueterías, y administrar cuáles aparecen en el selector.', color: '#9D174D', bg: '#FCE7F3', border: '#F9A8D4' },
  'inventario-conteo':      { key: 'inventario-conteo',      icon: '📦', label: 'Inventario (Conteo vs QAD)', desc: 'Consultar conteos por marca contra el stock de QAD, validar sesiones y enviar conteos cíclicos.', color: '#1E3A8A', bg: '#DBEAFE', border: '#93C5FD' },
  'agentes-almacen':        { key: 'agentes-almacen',        icon: '👤', label: 'Agentes de Almacén',         desc: 'Alta, edición y baja de agentes que surten y despachan pedidos foráneos.',                color: '#455A64', bg: '#ECEFF1', border: '#B0BEC5' },
}

const ALL_REPORTS = ['foraneos-reporte', 'checkin-reporte', 'pedidos-pagina-reporte', 'indicadores-reporte']

// agentes-almacen queda fuera de esta tabla a propósito: se rige por
// warehouseManagerScope (login), no por departamento — así lo autoriza el
// backend (WarehouseAgentController::MANAGER_SCOPES).
const DEPT_MODULE_KEYS = {
  '001': ['foraneos', 'almacen', ...ALL_REPORTS, 'cajeras-sucursal', 'inventario-conteo'],
  '002': ['foraneos', 'almacen', ...ALL_REPORTS, 'cajeras-sucursal', 'inventario-conteo'],
  '003': [...ALL_REPORTS, 'inventario-conteo'],
  '004': ['cajas', ...ALL_REPORTS, 'inventario-conteo'],
  '005': [...ALL_REPORTS, 'inventario-conteo'],
  '006': [...ALL_REPORTS, 'inventario-conteo'],
  '007': ['almacen', ...ALL_REPORTS, 'inventario-conteo'],
}

const DEFAULT_MODULE_KEYS = ['foraneos', ...ALL_REPORTS]

export function getModuleKeysForDept(deptId) {
  return DEPT_MODULE_KEYS[String(deptId ?? '').trim()] ?? DEFAULT_MODULE_KEYS
}

export function isModuleAllowedForDept(deptId, key) {
  return getModuleKeysForDept(deptId).includes(key)
}
