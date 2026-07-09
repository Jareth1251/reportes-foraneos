export const DETALLE_FIELDS = {
  turn: 'Turno', name: 'Cliente', erp_order_grouped: 'Pedido', erp_order_count: 'Conteo de pedidos',
  quantity: 'Cantidad', status_label: 'Estado Final',
  time_arrive_at: 'Llegó', usr_arrive_name: 'Registró Turno',
  time_creating_order_at: 'Lo atendió piso', time_order_created_at: 'Se creó el pedido',
  time_paying_at: 'Lo atendió cajas', time_transferencia_at: 'Se envió a Transferencia',
  time_order_received_at: 'Finalizó el Pago', time_at_stock_at: 'Se Empezó a surtir',
  time_stocked_at: 'Se Surtió', time_at_deliver_at: 'Se Empezó a Entregar',
  time_delivered_at: 'Se Entregó', time_canceled_at: 'Se Canceló',
  diff_creating_order_at: 'Tiempo para atención de piso', diff_order_created_at: 'Tiempo de creación del pedido',
  diff_paying_at: 'Tiempo para atención en cajas', diff_transferencia_at: 'Tiempo en Transferencia',
  diff_payment_time: 'Tiempo de Pago', diff_order_received_delay: 'Tiempo en Recibir pedido',
  diff_at_stock_at: 'Tiempo para atención por Almacén', diff_stocked_at: 'Tiempo para surtir',
  diff_at_deliver_at: 'Tiempo para Entregar', diff_delivered_at: 'Tiempo de entrega',
  diff_sale_at: 'Tiempo en Piso', diff_payed_at: 'Tiempo en Cajas', diff_warehouse_at: 'Tiempo en Almacén',
  diff_total_at: 'Tiempo en Tienda', paused_comment: 'Motivo Pausa', diffpaused_at: 'Tiempo Pausado',
  usr_name_paused: 'Lo pausó', usr_name_creating_order: 'Lo atendió', usr_name_order_created: 'Le creó el pedido',
  usr_name_paying: 'Le atendió en cajas', usr_name_transferencia: 'Lo mandó a Transferencia',
  usr_name_stocked: 'Lo atendió en Almacén', usr_name_at_stock: 'Lo surtió',
  usr_name_at_deliver: 'Asignó la Entrega', usr_name_delivered: 'Lo Entregó',
  cancel_comment: 'Razón de Cancelación', arrive_at: 'Fecha',
}

export const ALMACEN_FIELDS = {
  turn: 'Turno', name: 'Cliente', erp_order_grouped: 'Pedido', erp_order_count: 'Conteo de pedidos',
  quantity: 'Cantidad', status_label: 'Estado Final', diff_total_at: 'Tiempo Total',
  diff_at_stock_at: 'Recibe / Asignar Surtidor', diff_stocked_at: 'Surtiendo / Surtido',
  diff_surtido_entregado: 'Surtido / Entregado', usr_name_stocked: 'Lo atendió en Almacén',
  usr_name_at_stock: 'Lo surtió', usr_name_delivered: 'Lo entregó', arrive_at: 'Fecha',
}

export const PISO_FIELDS = {
  turn: 'Turno', name: 'Cliente', erp_order_grouped: 'Pedido', quantity: 'Cantidad',
  status_label: 'Estado Final', usr_arrive_name: 'Registró Turno', cancel_comment: 'Razón de Cancelación',
  usr_name_canceled: 'Lo canceló', diff_created_order: 'Tiempo de Creación del Pedido',
  created_by_name: 'Le creó el Pedido', arrive_at: 'Fecha',
}
