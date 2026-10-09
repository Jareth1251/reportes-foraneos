import * as XLSX from 'xlsx'

export function exportToExcel(rows, mapping, filename) {
  const data = rows.map((r) => {
    const out = {}
    Object.entries(mapping).forEach(([field, label]) => {
      let v = r[field] ?? ''
      if (field === 'arrive_at' && v) v = String(v).slice(0, 10)
      out[label] = v
    })
    return out
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte')
  XLSX.writeFile(wb, filename)
}

export const REPORT_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
export const REPORT_HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } }

export function styleHeaderRow(ws) {
  const row = ws.getRow(1)
  row.eachCell((cell) => {
    cell.fill = REPORT_HEADER_FILL
    cell.font = REPORT_HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  row.height = 20
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }
}

export async function downloadWorkbook(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
