// Si un turno trae un pedido PC (consolidado en QAD), los pedidos crudos que
// se fusionaron en él ya no cuentan aparte: el PC representa la unidad real.
export function collapseConsolidatedPedidos(list) {
  const unique = [...new Set(
    (list || []).map((s) => String(s || '').trim().toUpperCase()).filter(Boolean)
  )]
  const consolidated = unique.filter((s) => s.startsWith('PC'))
  return consolidated.length > 0 ? consolidated : unique
}
