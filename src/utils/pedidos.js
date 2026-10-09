// Si un turno trae un pedido PC (consolidado en QAD), los pedidos crudos que
// se fusionaron en él ya no cuentan aparte: el PC representa la unidad real.
export function collapseConsolidatedPedidos(list) {
  const unique = [...new Set(
    (list || []).map((s) => String(s || '').trim().toUpperCase()).filter(Boolean)
  )]
  const consolidated = unique.filter((s) => s.startsWith('PC'))
  return consolidated.length > 0 ? consolidated : unique
}

// Un turno de checkin puede traer varios pedidos ERP fusionados, listados en el
// comentario ("Pedidos: X, Y"). Se arma la lista consolidada (colapsando a PC
// cuando aplica) para que el conteo cuadre con el reporte.
export function buildGroupedOrderString(row) {
  const primary = String(row.erp_order_id || '').toUpperCase()
  const comment = String(row.comment || row.paused_comment || '').trim()
  if (!comment && !primary) return ''
  const cleaned = comment.replace(/^pedidos[^:]*:/i, '')
  let orders = [...new Set(
    cleaned
      .split(/[^A-Z0-9]+/i)
      .map((p) => p.trim().toUpperCase())
      .filter((p) => p.length > 0 && /\d/.test(p))
  )]
  if (primary && !orders.includes(primary)) orders.unshift(primary)

  const consolidated = orders.filter((o) => o.startsWith('PC'))
  if (consolidated.length > 0) orders = consolidated

  if (!orders.length && primary) return primary
  return orders.join(', ')
}
