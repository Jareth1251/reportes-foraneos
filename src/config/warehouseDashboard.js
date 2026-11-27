// Listas que en el Excel del encargado de almacén se capturaban a mano en los
// filtros de las tablas dinámicas. Por ahora viven aquí; si cambian seguido,
// pasarlas a un catálogo editable.

// Paqueterías que no cuentan como envío foráneo ni de página (el cliente
// recoge o es entrega local). Se comparan normalizadas: minúsculas, sin
// espacios ni guiones.
export const EXCLUDED_CARRIERS = ['cliente', 'clientepasa', 'domicilio', 'spatmailzona1', 'inbox1']

// Choferes que no cuentan en "Domicilio sin externos" (Uriel Veloz hace rutas
// que no son de Monterrey). Se compara cambiando Y por I.
export const EXCLUDED_DRIVERS = [['URIEL', 'VELOZ']]

// Estados que no cuentan como pedido trabajado.
export const EXCLUDED_STATUSES = ['cancelado', 'por surtir']
