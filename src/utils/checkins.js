// Fecha que representa "cuándo se facturó" un checkin. order_received_at solo se
// popula si el turno pasó por ese status intermedio de caja; muchos flujos (pago
// directo, agendados) lo saltan y solo tienen agendado_at o payed_at. Sin el
// fallback a payed_at, esos turnos se descartaban del reporte aunque sí tuvieran
// fecha de pago real. Ver investigación 2026-08-07.
export function checkinInvoicedAt(r) {
  return r.order_received_at || r.agendado_at || r.payed_at || null
}
