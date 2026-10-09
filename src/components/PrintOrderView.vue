<script setup>
import { ref, nextTick } from 'vue'

const printData = ref(null)

function parseLocation(loc) {
  if (!loc) return { piso: -1, rack: -1, seccion: -1, nivel: -1 }
  const m = String(loc).trim().toUpperCase().match(/P(\d+)\s*[-\s]*R(\d+)\s*[-\s]*([A-Z]+)\s*[-\s]*(\d+)/i)
  if (!m) return { piso: -1, rack: -1, seccion: -1, nivel: -1 }
  const piso = parseInt(m[1], 10)
  const rack = parseInt(m[2], 10)
  let seccion = 0
  for (let i = 0; i < m[3].length; i++) seccion = seccion * 26 + (m[3].charCodeAt(i) - 64)
  return { piso, rack, seccion, nivel: parseInt(m[4], 10) }
}

function sortedForAlmacen(articulos) {
  return [...articulos]
    .map((p, idx) => ({ ...p, __idx: idx }))
    .sort((a, b) => {
      const aL = parseLocation(a.location), bL = parseLocation(b.location)
      if (aL.piso    !== bL.piso)    return bL.piso    - aL.piso
      if (aL.rack    !== bL.rack)    return bL.rack    - aL.rack
      if (aL.seccion !== bL.seccion) return bL.seccion - aL.seccion
      if (aL.nivel   !== bL.nivel)   return bL.nivel   - aL.nivel
      return a.__idx - b.__idx
    })
    .map(({ __idx, ...p }) => p)
}

function totalPiezas(articulos) {
  return articulos.reduce((sum, p) => {
    const qty = parseFloat(p.qtyOrd)
    return p.um === 'PZ' ? sum + (isNaN(qty) ? 0 : qty) : sum
  }, 0)
}

async function print(data) {
  // data.orders = [{ numeroPedido, remision, cliente, vendedor, comentarios,
  //                  direccion, fecha, status, subtotal, iva, total,
  //                  invoice, turn, articulos }]
  printData.value = data
  await nextTick()
  document.body.classList.add('fp-printing')
  window.print()
  document.body.classList.remove('fp-printing')
  printData.value = null
}

defineExpose({ print })
</script>

<template>
  <Teleport to="body">
    <div v-if="printData" id="fp-print-root">

      <template v-for="(ord, idx) in printData.orders" :key="idx">

        <!-- ── Sección CAJA ──────────────────────────────────────────── -->
        <div class="fp-section fp-page-break-after">
          <div v-if="ord.turn" class="fp-turno-wrap">
            <span class="fp-turno">Turno: {{ ord.turn }}</span>
          </div>
          <h2 class="fp-empresa">GRUPO MI PLAYERA DE MEXICO SA DE CV</h2>

          <table class="fp-header-table">
            <tbody>
              <tr>
                <td>
                  <b>Folio:</b> {{ ord.numeroPedido }}<br>
                  <b>Remisión:</b> {{ ord.remision }}<br>
                  <b>Vendido a:</b> {{ ord.cliente }}<br>
                  <b>Vendedor:</b> {{ ord.vendedor }}<br>
                  <b>Comentarios:</b> {{ ord.comentarios }}<br>
                  <b>Dirección:</b> {{ ord.direccion }}<br>
                </td>
                <td>
                  <b>Fecha:</b> {{ ord.fecha }}<br>
                  <b>Status:</b> {{ ord.status }}<br>
                  <b>Sub Total:</b> ${{ ord.subtotal }}<br>
                  <b>IVA:</b> ${{ ord.iva }}<br>
                  <b>Total:</b> ${{ ord.total }}<br>
                </td>
              </tr>
            </tbody>
          </table>

          <table class="fp-items-table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Articulo</th>
                <th class="fp-center">Talla</th>
                <th>Color</th>
                <th class="fp-center">Cantidad</th>
                <th>Precio</th>
                <th>IVA</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!ord.articulos.length">
                <td colspan="8" style="text-align:center;color:#aaa;font-style:italic;">Sin artículos</td>
              </tr>
              <tr v-for="(p, i) in ord.articulos" :key="i">
                <td>{{ p.productCode }}</td>
                <td>{{ p.product }}</td>
                <td class="fp-center">{{ p.size }}</td>
                <td>{{ p.color }}</td>
                <td class="fp-center">{{ p.qtyOrd }}</td>
                <td>{{ p.price }}</td>
                <td>{{ p.IVA }}</td>
                <td>{{ p.subTotal }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ── Sección ALMACÉN ──────────────────────────────────────── -->
        <div class="fp-section" :class="idx < printData.orders.length - 1 ? 'fp-page-break-after' : ''">
          <div class="fp-almacen-header">
            <h1>ALMACEN</h1>
            <span v-if="ord.turn" class="fp-turno">Turno: {{ ord.turn }}</span>
          </div>

          <table class="fp-header-table">
            <tbody>
              <tr>
                <td>
                  <b>Folio:</b> {{ ord.numeroPedido }}<br>
                  <b>Remisión:</b> {{ ord.remision }}<br>
                  <b>Vendido a:</b> {{ ord.cliente }}<br>
                  <b>Comentarios:</b> {{ ord.comentarios }}<br>
                </td>
                <td>
                  <b>Fecha:</b> {{ ord.fecha }}<br>
                  <b>Vendedor:</b> {{ ord.vendedor }}<br>
                  <b>Factura:</b> {{ ord.invoice || 'No requiere' }}<br>
                </td>
              </tr>
            </tbody>
          </table>

          <table class="fp-items-table fp-almacen-items">
            <thead>
              <tr>
                <th>Ubicación</th>
                <th>Codigo</th>
                <th>Articulo</th>
                <th class="fp-center">Talla</th>
                <th>Color</th>
                <th class="fp-center">Cantidad</th>
                <th class="fp-center">Surtidor</th>
                <th class="fp-center">Despacho</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!ord.articulos.length">
                <td colspan="8" style="text-align:center;color:#aaa;font-style:italic;">Sin artículos</td>
              </tr>
              <tr v-for="(p, i) in sortedForAlmacen(ord.articulos)" :key="i">
                <td>{{ p.location }}</td>
                <td>{{ p.productCode }}</td>
                <td>{{ p.product }}</td>
                <td class="fp-center">{{ p.size }}</td>
                <td>{{ p.color }}</td>
                <td class="fp-center">{{ p.qtyOrd }}</td>
                <td class="fp-center"><div class="fp-rect"></div></td>
                <td class="fp-center"><div class="fp-rect"></div></td>
              </tr>
              <tr class="fp-total-row">
                <td colspan="4"></td>
                <td colspan="4"><b>Total Piezas {{ totalPiezas(ord.articulos) }}</b></td>
              </tr>
            </tbody>
          </table>
        </div>

      </template>
    </div>
  </Teleport>
</template>

<style>
body.fp-printing > *:not(#fp-print-root) { display: none !important; }
body.fp-printing #fp-print-root {
  display: block;
  position: fixed;
  inset: 0;
  background: #fff;
  z-index: 99999;
  overflow-y: auto;
  padding: 20px;
}
#fp-print-root { display: none; }

@media print {
  body > *:not(#fp-print-root) { display: none !important; }
  #fp-print-root { display: block !important; position: static !important; padding: 0 !important; }
}
</style>

<style scoped>
.fp-section { font-family: Arial, sans-serif; font-size: 12px; padding: 10px; }
.fp-page-break-after { page-break-after: always; break-after: page; }
.fp-empresa { font-size: 14px; font-weight: bold; margin: 8px 0; }
.fp-turno-wrap { margin-bottom: 6px; }
.fp-turno { background: #1976d2; color: #fff; padding: 2px 8px; border-radius: 6px; font-weight: bold; font-size: 12px; }
.fp-almacen-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.fp-almacen-header h1 { font-size: 16px; font-weight: bold; margin: 0; }
.fp-header-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px; }
.fp-header-table td { vertical-align: top; padding: 4px 8px; width: 50%; }
.fp-items-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.fp-items-table th, .fp-items-table td { border: 1px solid #999; padding: 3px 5px; }
.fp-items-table th { background: #f0f0f0; font-weight: bold; }
.fp-center { text-align: center; }
.fp-total-row td { font-weight: bold; border-top: 2px solid #555; }
.fp-rect { width: 60px; height: 20px; border: 1px solid #555; margin: 0 auto; }
</style>
