import { ref, computed, watch } from 'vue'
import Swal from 'sweetalert2'
import * as inventoryApi from '@/services/inventoryLookup'
import { toInt, siteLabel, rowKey, fmtDate } from '@/utils/inventoryLookupHelpers'

const PAGE_SIZE = 200

export function useInventoryLookup(user) {
  const isValidator = computed(() => {
    const agent = String(user.value?.agent || user.value?.username || '').toLowerCase()
    return agent === 'jdomingu'
  })
  const isDept001 = computed(() => String(user.value?.departmentId || '') === '001')
  const isDept002 = computed(() => String(user.value?.departmentId || '') === '002')
  const isAdminUser = computed(() => isValidator.value || isDept001.value || isDept002.value)

  const site = ref('3000')
  const brands = ref([])
  const brand = ref('')

  const loading = ref(false)
  const rows = ref([])
  const error = ref('')
  const sessionDate = ref(null)

  const selectedKey = ref('')
  const breakdownLoading = ref(false)
  const breakdown = ref(null)
  const breakdownError = ref('')

  const stockByPid = ref({})
  const committedByPid = ref({})
  const shippedByPid = ref({})
  const qadError = ref('')
  const sendingErp = ref(null)
  const sendingAll = ref(false)
  const selected = ref(new Map())
  const loadingAllQad = ref(false)
  const loadAllQadProgress = ref(null)

  const page = ref(1)

  const view = ref('conteo')
  const histDate = ref(new Date().toISOString().slice(0, 10))
  const histRows = ref([])
  const histLoading = ref(false)
  const histError = ref('')

  const sessionInfo = ref(null)
  const validating = ref(false)
  const qadSnapshotAt = ref(null)

  const pendingRecounts = ref([])
  const pendingLoading = ref(false)
  const expandedValId = ref(null)
  const deletingRow = ref(null)
  const requestingRow = ref(null)
  const doneValidations = ref(new Set())

  function resetResults() {
    rows.value = []
    error.value = ''
    selectedKey.value = ''
    breakdown.value = null
    breakdownError.value = ''
    breakdownLoading.value = false
    stockByPid.value = {}
    committedByPid.value = {}
    shippedByPid.value = {}
    qadError.value = ''
    page.value = 1
    sessionDate.value = null
    selected.value = new Map()
    doneValidations.value = new Set()
  }

  async function loadCommittedQty() {
    try {
      const resp = await inventoryApi.getCommittedQty()
      if (resp.data?.ok) committedByPid.value = resp.data.data || {}
    } catch { /* silent */ }
  }

  async function loadDoneValidations() {
    try {
      const resp = await inventoryApi.getDoneValidations(site.value)
      const data = Array.isArray(resp.data?.data) ? resp.data.data : []
      const keys = new Set(data.map((r) =>
        `${(r.product_id || '').toUpperCase()}|${(r.color_label || '').toUpperCase()}|${(r.size_label || '').toUpperCase()}`
      ))
      doneValidations.value = keys
    } catch { /* silent */ }
  }

  async function loadPendingRecounts(siteVal) {
    pendingLoading.value = true
    try {
      const resp = await inventoryApi.getPendingRecounts(siteVal || site.value, user.value)
      pendingRecounts.value = Array.isArray(resp.data?.data) ? resp.data.data : []
    } catch { /* silent */ }
    finally { pendingLoading.value = false }
  }

  async function handleDeleteCount(r) {
    const pid = String(r.product_id || '').trim()
    const ok = await Swal.fire({
      icon: 'warning',
      title: '¿Borrar conteo?',
      html: `<b>${pid}</b> · ${r.color_label || '-'} · ${r.size_label || '-'}<br/>
             <span style="color:#ef4444;font-size:13px">Se eliminan todos los registros de conteo de este artículo.</span>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    })
    if (!ok.isConfirmed) return

    deletingRow.value = pid
    try {
      await inventoryApi.deleteCountsProduct({
        site: site.value, product_id: pid,
        color_label: r.color_label || '', size_label: r.size_label || '',
      }, user.value)
      Swal.fire('Borrado', 'El conteo fue eliminado.', 'success')
      handleSearch()
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.message || e?.message || 'No se pudo borrar.', 'error')
    } finally {
      deletingRow.value = null
    }
  }

  async function handleRequestRecount(r) {
    const pid = String(r.product_id || '').trim()
    const ok = await Swal.fire({
      icon: 'question',
      title: '¿Solicitar reconteo?',
      html: `<div style="text-align:left;font-size:13px;line-height:1.8">
               <b>${pid}</b> · ${r.article || '-'}<br/>
               Color: <b>${r.color_label || '-'}</b> · Talla: <b>${r.size_label || '-'}</b><br/>
               Contado actualmente: <b>${toInt(r.counted_qty)} pzas</b>
             </div>
             <div style="margin-top:10px;font-size:12px;color:#64748b">
               Se le notificará a jdomingu para que vuelva a contar este artículo.
             </div>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, solicitar reconteo',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
    })
    if (!ok.isConfirmed) return

    requestingRow.value = pid
    try {
      await inventoryApi.postCountValidation({
        site: site.value,
        product_id: pid,
        article: r.article || '',
        color_label: r.color_label || '',
        size_label: r.size_label || '',
        brand_name: r.brand_name || '',
      }, user.value)

      Swal.fire('Enviado', 'jdomingu verá la solicitud en su panel para recontar este artículo.', 'success')
      rows.value = rows.value.filter((row) =>
        !(String(row.product_id || '').trim() === pid &&
          (row.color_label || '') === (r.color_label || '') &&
          (row.size_label || '') === (r.size_label || ''))
      )
      if (isValidator.value) loadPendingRecounts()
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.message || e?.message || 'No se pudo enviar.', 'error')
    } finally {
      requestingRow.value = null
    }
  }

  async function handleMarkDone(v) {
    const bkRows = v.breakdown || []

    const tableRows = bkRows.map((b, i) => `
      <tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:6px 8px;font-size:13px">${b.location || '—'}</td>
        <td style="padding:6px 4px;text-align:center">
          <input id="recount-qty-${i}" type="number" min="0" value="${Number(b.qty) || 0}"
            style="width:72px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;text-align:center;font-size:14px;font-weight:700"/>
        </td>
        <td style="padding:6px 8px;font-size:12px;color:#64748b">${b.counted_by_name || '—'}</td>
      </tr>`).join('')

    const { value: formData, isConfirmed } = await Swal.fire({
      title: 'Editar conteo y confirmar reconteo',
      html: `
        <div style="text-align:left;font-size:13px;margin-bottom:12px;color:#475569">
          <b style="color:#1e293b">${v.product_id}</b>${v.article ? ` · ${v.article}` : ''}
          &nbsp;·&nbsp;<span>${v.color_label || '—'} · ${v.size_label || '—'}</span>
        </div>
        ${bkRows.length === 0
          ? '<p style="color:#94a3b8;font-size:13px">Sin registros de conteo actuales.</p>'
          : `<table style="width:100%;border-collapse:collapse">
               <thead><tr style="background:#f1f5f9">
                 <th style="padding:6px 8px;text-align:left;font-size:12px">Ubicación</th>
                 <th style="padding:6px 8px;text-align:center;font-size:12px">Qty nuevo</th>
                 <th style="padding:6px 8px;text-align:left;font-size:12px">Contó antes</th>
               </tr></thead>
               <tbody>${tableRows}</tbody>
             </table>`}`,
      showCancelButton: true,
      confirmButtonText: '✓ Guardar y confirmar reconteo',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      width: 540,
      focusConfirm: false,
      preConfirm: () => bkRows.map((b, i) => {
        const el = document.getElementById(`recount-qty-${i}`)
        return {
          location: b.location,
          qty: el ? Math.max(0, parseInt(el.value, 10) || 0) : (Number(b.qty) || 0),
          originalQty: Number(b.qty) || 0,
        }
      }),
    })

    if (!isConfirmed || !formData) return

    try {
      const changed = formData.filter((r) => r.qty !== r.originalQty)
      for (const row of changed) {
        await inventoryApi.putLocationCount({
          site: site.value,
          product_id: v.product_id,
          color_label: v.color_label || '',
          size_label: v.size_label || '',
          location: row.location,
          qty: row.qty,
        }, user.value)
      }

      await inventoryApi.putCountValidationDone(v.id, user.value)

      pendingRecounts.value = pendingRecounts.value.filter((x) => x.id !== v.id)
      if (expandedValId.value === v.id) expandedValId.value = null

      const msg = changed.length > 0
        ? `${changed.length} ubicación(es) actualizadas. Reconteo confirmado.`
        : 'Reconteo confirmado (sin cambios en cantidades).'
      Swal.fire({ icon: 'success', title: 'Listo', text: msg, timer: 2500, showConfirmButton: false })
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.message || e?.message || 'No se pudo guardar.', 'error')
    }
  }

  async function loadSessionValidation(siteVal) {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const resp = await inventoryApi.getSessionToday({ site: siteVal || site.value, date: today })
      sessionInfo.value = resp.data?.session || null
    } catch {
      sessionInfo.value = null
    }
  }

  async function handleValidateSession() {
    const confirm = await Swal.fire({
      icon: 'question',
      title: '¿Validar conteos del día?',
      html: `Al validar, los usuarios podrán enviar los conteos a QAD.<br/>
             <span style="font-size:12px;color:#6b7280">Sucursal: ${site.value} · Fecha: ${new Date().toLocaleDateString('es-MX')}</span>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, validar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
    })
    if (!confirm.isConfirmed) return
    validating.value = true
    try {
      const today = new Date().toISOString().slice(0, 10)
      const resp = await inventoryApi.postValidateSessionToday({ user: user.value, site: site.value, date: today })
      if (resp.data?.ok) {
        sessionInfo.value = resp.data.session
        Swal.fire('Sesión validada', 'Los usuarios ya pueden enviar conteos a QAD.', 'success')
      }
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.message || e?.message || 'No se pudo validar.', 'error')
    } finally {
      validating.value = false
    }
  }

  async function loadBrands(siteValue) {
    try {
      error.value = ''
      brands.value = []
      brand.value = ''
      resetResults()
      const resp = await inventoryApi.getBrands(siteValue)
      const payload = resp?.data || {}
      const list = Array.isArray(payload?.brands)
        ? payload.brands
        : Array.isArray(payload?.data) ? payload.data : []
      brands.value = list.map((x) => (typeof x === 'string' ? x : x?.brand_name))
        .map((s) => String(s || '').trim())
        .filter(Boolean)
    } catch (e) {
      error.value = e?.response?.data?.message || e?.message || 'Error cargando marcas.'
    }
  }

  async function fetchSystemStock(productId) {
    const pid = String(productId || '').trim()
    if (!pid) return null
    if (Object.prototype.hasOwnProperty.call(stockByPid.value, pid)) return stockByPid.value[pid]
    const resp = await inventoryApi.getSystemStock({ site: site.value, product_id: pid })
    const st = resp?.data?.stock
    if (typeof st === 'number' && Number.isFinite(st)) return Math.trunc(st)
    if (typeof st === 'string' && st.trim() !== '' && Number.isFinite(Number(st))) return Math.trunc(Number(st))
    return null
  }

  async function handleLoadAllQad() {
    const pids = [...new Set(rows.value.map((r) => String(r.product_id || '').trim()).filter(Boolean))]
    const missing = pids.filter((pid) => !Object.prototype.hasOwnProperty.call(stockByPid.value, pid))
    if (!missing.length) return

    loadingAllQad.value = true
    loadAllQadProgress.value = { done: 0, total: missing.length }

    const BATCH = 5
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH)
      await Promise.all(batch.map(async (pid) => {
        try {
          const st = await fetchSystemStock(pid)
          if (!Object.prototype.hasOwnProperty.call(stockByPid.value, pid)) {
            stockByPid.value = { ...stockByPid.value, [pid]: st }
          }
        } catch {
          if (!Object.prototype.hasOwnProperty.call(stockByPid.value, pid)) {
            stockByPid.value = { ...stockByPid.value, [pid]: null }
          }
        }
      }))
      loadAllQadProgress.value = { done: Math.min(i + BATCH, missing.length), total: missing.length }
    }

    loadingAllQad.value = false
    loadAllQadProgress.value = null
  }

  async function ensureStockCached(productId) {
    const pid = String(productId || '').trim()
    if (!pid || Object.prototype.hasOwnProperty.call(stockByPid.value, pid)) return
    try {
      const st = await fetchSystemStock(pid)
      if (!Object.prototype.hasOwnProperty.call(stockByPid.value, pid)) {
        stockByPid.value = { ...stockByPid.value, [pid]: st }
      }
    } catch {
      if (!Object.prototype.hasOwnProperty.call(stockByPid.value, pid)) {
        stockByPid.value = { ...stockByPid.value, [pid]: null }
      }
    }
  }

  async function handleSearch() {
    const b = String(brand.value || '').trim()
    if (!b) { error.value = 'Selecciona una marca.'; rows.value = []; return }
    loading.value = true
    error.value = ''
    rows.value = []
    selectedKey.value = ''
    breakdown.value = null
    breakdownError.value = ''
    stockByPid.value = {}
    qadError.value = ''
    page.value = 1
    sessionDate.value = null
    try {
      const resp = await inventoryApi.getBrandSummary({ site: site.value, brand_name: b })
      const payload = resp?.data || {}
      if (!payload?.ok) {
        error.value = payload?.message || 'No se pudo consultar el resumen por marca.'
      } else {
        let fetchedRows = Array.isArray(payload?.data) ? payload.data : []

        if (isAdminUser.value) {
          try {
            const pendingResp = await inventoryApi.getPendingRecounts(site.value, user.value)
            const pendingData = Array.isArray(pendingResp.data?.data) ? pendingResp.data.data : []
            if (isValidator.value) pendingRecounts.value = pendingData
            if (pendingData.length) {
              const pendingKeys = new Set(pendingData.map((v) =>
                `${(v.product_id || '').toUpperCase()}|${(v.color_label || '').toUpperCase()}|${(v.size_label || '').toUpperCase()}`
              ))
              fetchedRows = fetchedRows.filter((r) =>
                !pendingKeys.has(`${(r.product_id || '').toUpperCase()}|${(r.color_label || '').toUpperCase()}|${(r.size_label || '').toUpperCase()}`)
              )
            }
          } catch { /* silent */ }
        }

        rows.value = fetchedRows
        sessionDate.value = payload?.session_date || null

        if (payload?.qad_snapshot_at) {
          qadSnapshotAt.value = payload.qad_snapshot_at
          const snapQad = {}, snapCommitted = {}, snapShipped = {}
          for (const r of fetchedRows) {
            const pid = r.product_id ? String(r.product_id).trim() : null
            if (!pid) continue
            if (r.qad_snapshot_qty !== null && r.qad_snapshot_qty !== undefined) snapQad[pid] = r.qad_snapshot_qty
            if (r.committed_snapshot_qty !== null && r.committed_snapshot_qty !== undefined) snapCommitted[pid] = r.committed_snapshot_qty
            if (r.shipped_snapshot_qty !== null && r.shipped_snapshot_qty !== undefined) snapShipped[pid] = r.shipped_snapshot_qty
          }
          if (Object.keys(snapQad).length) stockByPid.value = snapQad
          if (Object.keys(snapCommitted).length) committedByPid.value = snapCommitted
          if (Object.keys(snapShipped).length) shippedByPid.value = snapShipped
        } else {
          qadSnapshotAt.value = null
        }

        if (payload?.session_date) {
          sessionInfo.value = payload.session_validated_at ? {
            validated_at: payload.session_validated_at,
            validated_by_name: payload.session_validated_by,
            validated_by: payload.session_validated_by,
          } : null
        } else {
          loadSessionValidation(site.value)
        }

        if (isAdminUser.value) loadCommittedQty()
        loadDoneValidations()
      }
    } catch (e) {
      error.value = e?.response?.data?.message || e?.message || 'Error consultando.'
    } finally {
      loading.value = false
    }
  }

  async function openBreakdown(r, idx) {
    const k = rowKey(r, idx)
    if (selectedKey.value === k) {
      selectedKey.value = ''
      breakdown.value = null
      breakdownError.value = ''
      return
    }
    selectedKey.value = k
    breakdown.value = null
    breakdownError.value = ''
    breakdownLoading.value = true
    if (r?.product_id) ensureStockCached(r.product_id)
    try {
      const resp = await inventoryApi.getArticleBreakdown({
        site: site.value, id: r.product_id, color_label: r.color_label, size_label: r.size_label,
      })
      const payload = resp?.data || {}
      if (!payload?.ok) breakdownError.value = payload?.message || 'No se pudo generar el desglose.'
      else breakdown.value = payload
    } catch (e) {
      breakdownError.value = e?.response?.data?.message || e?.message || 'Error generando desglose.'
    } finally {
      breakdownLoading.value = false
    }
  }

  async function sendSingleCount(r) {
    const pid = String(r.product_id || '').trim()
    const counted = toInt(r.counted_qty)
    const hasQad = pid && Object.prototype.hasOwnProperty.call(stockByPid.value, pid)
    const qadQty = hasQad ? toInt(stockByPid.value[pid]) : null

    if (!pid) throw new Error('El producto no tiene ID (product_id)')
    if (!hasQad) throw new Error('No se ha cargado el stock QAD para este producto')

    try {
      const resp = await inventoryApi.postCycleCount({
        user: user.value,
        items: [{
          productId: pid,
          siteId: site.value,
          qty: counted,
          qad_qty: qadQty,
          article: r.article || '',
          brand_name: r.brand_name || '',
          color_label: r.color_label || '',
          size_label: r.size_label || '',
        }],
      })

      if (!resp.data?.ok) {
        throw new Error(resp.data?.message || 'Error desconocido en la respuesta del servidor')
      }
      return { pid, success: true }
    } catch (err) {
      if (err.response?.data?.message) throw new Error(err.response.data.message)
      if (err.response?.data?.error) throw new Error(err.response.data.error)
      if (err.message) throw err
      throw new Error('Error de conexión o servidor no responde')
    }
  }

  async function handleSendToErp(r) {
    const pid = String(r.product_id || '').trim()
    const counted = toInt(r.counted_qty)
    const hasQad = pid && Object.prototype.hasOwnProperty.call(stockByPid.value, pid)
    const qadQty = hasQad ? toInt(stockByPid.value[pid]) : null
    const diff = hasQad ? counted - qadQty : null

    if (!pid) { Swal.fire('Sin product_id', 'Esta fila no tiene product_id.', 'warning'); return }

    const diffText = diff === null
      ? 'QAD no cargado — carga QAD primero.'
      : diff === 0 ? '✅ Sin diferencia.'
      : diff > 0 ? `📈 Contado tiene <b>+${diff}</b> pzas más que QAD.`
      : `📉 Contado tiene <b>${diff}</b> pzas menos que QAD.`

    const confirm = await Swal.fire({
      icon: 'question',
      title: '¿Enviar conteo cíclico a QAD?',
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.8">
          <b>Producto:</b> ${pid}<br/>
          <b>Artículo:</b> ${r.article || '-'}<br/>
          <b>Color:</b> ${r.color_label || '-'} &nbsp;·&nbsp; <b>Talla:</b> ${r.size_label || '-'}<br/>
          <b>Site:</b> ${siteLabel(site.value)} (${site.value})<br/>
          <hr style="margin:8px 0"/>
          <b>Contado:</b> ${counted} pzas<br/>
          ${hasQad ? `<b>QAD actual:</b> ${qadQty} pzas<br/>` : ''}
          <b>Diferencia:</b> ${diffText}
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, actualizar QAD',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
    })

    if (!confirm.isConfirmed) return
    sendingErp.value = pid
    try {
      await sendSingleCount(r)
      const next = { ...stockByPid.value }
      delete next[pid]
      stockByPid.value = next
      await Swal.fire({ icon: 'success', title: 'Conteo cíclico enviado', html: `<b>${pid}</b> — ${counted} pzas.` })
      handleSearch()
    } catch (e) {
      Swal.fire('Error al enviar conteo', e.message || 'No se pudo enviar el conteo cíclico.', 'error')
    } finally {
      sendingErp.value = null
    }
  }

  function toggleSelect(r, idx) {
    const k = rowKey(r, idx)
    const next = new Map(selected.value)
    if (next.has(k)) next.delete(k)
    else next.set(k, r)
    selected.value = next
  }

  function toggleSelectAll() {
    if (allVisibleSelected.value) {
      selected.value = new Map()
    } else {
      const next = new Map()
      visibleRows.value.forEach((r, idx) => next.set(rowKey(r, idx), r))
      selected.value = next
    }
  }

  async function handleSendSelected() {
    if (!selected.value.size) return
    const selRows = Array.from(selected.value.values())
    const totalQty = selRows.reduce((a, r) => a + toInt(r.counted_qty), 0)

    const confirm = await Swal.fire({
      icon: 'question',
      title: `¿Enviar ${selected.value.size} artículos a QAD?`,
      html: `<b>${selected.value.size}</b> artículos · <b>${totalQty}</b> pzas totales<br/>
             <span style="font-size:12px;color:#6b7280">Site: ${siteLabel(site.value)} (${site.value})</span>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar todos',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
    })

    if (!confirm.isConfirmed) return
    sendingErp.value = '__bulk__'
    try {
      const items = selRows.map((r) => {
        const pid = String(r.product_id || '').trim()
        const hasQ = pid && Object.prototype.hasOwnProperty.call(stockByPid.value, pid)
        return {
          productId: pid, siteId: site.value, qty: toInt(r.counted_qty),
          qad_qty: hasQ ? toInt(stockByPid.value[pid]) : null,
          article: r.article || '', brand_name: r.brand_name || '',
          color_label: r.color_label || '', size_label: r.size_label || '',
        }
      })

      const resp = await inventoryApi.postCycleCount({ user: user.value, items }, 90000)

      const next = { ...stockByPid.value }
      selRows.forEach((r) => delete next[String(r.product_id || '').trim()])
      stockByPid.value = next
      selected.value = new Map()

      const apiDesc = resp?.data?.description || 'CONTEO APLICADO CORRECTAMENTE'
      await Swal.fire({
        icon: 'success',
        title: 'Conteos enviados',
        html: `<b>${items.length}</b> artículos · <b>${totalQty}</b> pzas enviadas.<br/>
               <span style="color:#16a34a;font-size:13px">${apiDesc}</span>`,
      })
      handleSearch()
    } catch (e) {
      Swal.fire('Error al enviar', e?.response?.data?.message || e?.message || 'No se pudo enviar.', 'error')
    } finally {
      sendingErp.value = null
    }
  }

  async function handleSendAll() {
    const eligibleRows = rows.value.filter((r) => {
      const pid = String(r.product_id || '').trim()
      const hasQad = pid && Object.prototype.hasOwnProperty.call(stockByPid.value, pid)
      return hasQad && canSendQad.value
    })

    if (!eligibleRows.length) {
      Swal.fire('Sin artículos elegibles', 'No hay artículos con datos QAD disponibles para enviar.', 'info')
      return
    }

    const totalQty = eligibleRows.reduce((a, r) => a + toInt(r.counted_qty), 0)
    const confirm = await Swal.fire({
      icon: 'question',
      title: `¿Enviar ${eligibleRows.length} artículos a QAD?`,
      html: `<b>${eligibleRows.length}</b> artículos · <b>${totalQty}</b> pzas totales<br/>
             <span style="font-size:12px;color:#6b7280">Site: ${siteLabel(site.value)} (${site.value})</span><br/>
             <span style="font-size:12px;">Se enviarán uno por uno para control de errores.</span>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar todos',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
    })
    if (!confirm.isConfirmed) return

    sendingAll.value = true
    const successes = []
    let failures = []

    Swal.fire({
      title: 'Enviando conteos...',
      html: `Progreso: 0 / ${eligibleRows.length}`,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    })

    for (let i = 0; i < eligibleRows.length; i++) {
      const row = eligibleRows[i]
      const pid = String(row.product_id || '').trim()
      try {
        await sendSingleCount(row)
        successes.push(pid)
        const next = { ...stockByPid.value }
        delete next[pid]
        stockByPid.value = next
      } catch (err) {
        failures.push({ pid, error: err.message })
      }
      Swal.getHtmlContainer().innerHTML = `Progreso: ${i + 1} / ${eligibleRows.length}`
    }

    Swal.close()

    if (failures.length === 0) {
      await Swal.fire({ icon: 'success', title: '¡Éxito!', html: `<b>${successes.length}</b> artículos enviados correctamente.` })
      handleSearch()
    } else {
      const failedList = failures.map((f) => `<li><b>${f.pid}</b>: ${f.error}</li>`).join('')
      const result = await Swal.fire({
        icon: 'warning',
        title: 'Envío parcial',
        html: `
          <div style="text-align:left">
            <b>Exitosos:</b> ${successes.length}<br/>
            <b>Fallidos:</b> ${failures.length}<br/>
            <b>Detalle de fallos:</b>
            <ul style="max-height:200px; overflow:auto;">${failedList}</ul>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Continuar (excluir fallidos)',
        cancelButtonText: 'Reintentar fallidos',
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#d33',
      })

      if (result.isConfirmed) {
        handleSearch()
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        sendingAll.value = true
        const retryFailures = [...failures]
        const retrySuccesses = []
        const retryErrors = []

        Swal.fire({
          title: 'Reintentando fallidos...',
          html: `Progreso: 0 / ${retryFailures.length}`,
          allowOutsideClick: false,
          showConfirmButton: false,
          didOpen: () => Swal.showLoading(),
        })

        for (let i = 0; i < retryFailures.length; i++) {
          const fail = retryFailures[i]
          const originalRow = eligibleRows.find((r) => String(r.product_id).trim() === fail.pid)
          if (!originalRow) continue
          try {
            await sendSingleCount(originalRow)
            retrySuccesses.push(fail.pid)
            const next = { ...stockByPid.value }
            delete next[fail.pid]
            stockByPid.value = next
          } catch (err) {
            retryErrors.push({ pid: fail.pid, error: err.message })
          }
          Swal.getHtmlContainer().innerHTML = `Progreso: ${i + 1} / ${retryFailures.length}`
        }
        Swal.close()

        if (retryErrors.length === 0) {
          await Swal.fire({ icon: 'success', title: 'Reintento exitoso', html: `Se enviaron ${retrySuccesses.length} artículos pendientes.` })
        } else {
          const retryFailedList = retryErrors.map((f) => `<li><b>${f.pid}</b>: ${f.error}</li>`).join('')
          await Swal.fire({
            icon: 'error',
            title: 'Algunos fallaron nuevamente',
            html: `
              <div style="text-align:left">
                <b>Fallidos persistentes:</b>
                <ul style="max-height:200px; overflow:auto;">${retryFailedList}</ul>
              </div>
            `,
          })
        }
        handleSearch()
      }
    }

    sendingAll.value = false
  }

  function exportHistoryCsv() {
    if (!histRows.value.length) return
    const cols = ['Hora', 'product_id', 'Artículo', 'Marca', 'Color', 'Talla', 'Contado', 'QAD antes', 'Diferencia', 'QAD final', 'Usuario', 'Estado']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      cols.map(esc).join(','),
      ...histRows.value.map((h) => [
        fmtDate(h.sent_at), h.product_id, h.article || '', h.brand_name || '',
        h.color_label || '', h.size_label || '', toInt(h.counted_qty),
        h.qad_qty != null ? toInt(h.qad_qty) : '',
        h.difference != null ? toInt(h.difference) : '',
        String(h.api_status || '').toUpperCase() === 'OK' ? toInt(h.counted_qty) : '',
        h.user_name || h.user_id || '', h.api_status || '',
      ].map(esc).join(',')),
    ]
    const bom = '﻿'
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `historial-qad-${histDate.value}-${site.value}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function loadHistory(dateVal, siteVal) {
    histLoading.value = true
    histError.value = ''
    try {
      const resp = await inventoryApi.getCycleCountReport({ site: siteVal || site.value, date: dateVal || histDate.value })
      histRows.value = Array.isArray(resp.data?.data) ? resp.data.data : []
    } catch (e) {
      histError.value = e?.response?.data?.message || e?.message || 'Error cargando historial.'
    } finally {
      histLoading.value = false
    }
  }

  const visibleRows = computed(() => rows.value.slice(0, page.value * PAGE_SIZE))

  const totals = computed(() => {
    const totalCounted = visibleRows.value.reduce((a, r) => a + toInt(r.counted_qty), 0)
    const uniquePids = Array.from(new Set(visibleRows.value.map((r) => String(r.product_id || '').trim()).filter(Boolean)))
    const hasAllStock = uniquePids.length > 0 && uniquePids.every((pid) => Object.prototype.hasOwnProperty.call(stockByPid.value, pid))
    if (!hasAllStock) return { totalCounted, totalQad: null, diff: null, hasAllStock: false }
    const totalQad = visibleRows.value.reduce((a, r) => {
      const pid = String(r.product_id || '').trim()
      return a + toInt(pid ? stockByPid.value[pid] : null)
    }, 0)
    return { totalCounted, totalQad, diff: totalCounted - totalQad, hasAllStock: true }
  })

  const allVisibleSelected = computed(() =>
    visibleRows.value.length > 0 && visibleRows.value.every((r, idx) => selected.value.has(rowKey(r, idx)))
  )

  const sessionValidated = computed(() => !!sessionInfo.value?.validated_at)
  const canSeeResults = computed(() => isValidator.value || sessionValidated.value)
  const canSendQad = computed(() => isValidator.value || ((isDept001.value || isDept002.value) && sessionValidated.value))

  const eligibleCount = computed(() => rows.value.filter((r) => {
    const pid = String(r.product_id || '').trim()
    return pid && Object.prototype.hasOwnProperty.call(stockByPid.value, pid) && canSendQad.value
  }).length)

  const panelOpen = computed(() => !!(selectedKey.value && (breakdown.value || breakdownLoading.value || breakdownError.value)))

  function initLoad() {
    loadBrands(site.value)
    loadSessionValidation(site.value)
    if (isValidator.value) loadPendingRecounts(site.value)
  }

  watch(site, () => { initLoad() })

  return {
    isValidator, isDept001, isDept002, isAdminUser,
    site, brands, brand, loading, rows, error, sessionDate,
    selectedKey, breakdownLoading, breakdown, breakdownError,
    stockByPid, committedByPid, shippedByPid, qadError,
    sendingErp, sendingAll, selected, loadingAllQad, loadAllQadProgress,
    page, view, histDate, histRows, histLoading, histError,
    sessionInfo, validating, qadSnapshotAt,
    pendingRecounts, pendingLoading, expandedValId, deletingRow, requestingRow, doneValidations,
    visibleRows, totals, allVisibleSelected, sessionValidated, canSeeResults, canSendQad, eligibleCount, panelOpen,
    initLoad, handleSearch, openBreakdown, handleSendToErp, toggleSelect, toggleSelectAll,
    handleSendSelected, handleSendAll, handleLoadAllQad, handleValidateSession,
    handleDeleteCount, handleRequestRecount, handleMarkDone, loadPendingRecounts,
    exportHistoryCsv, loadHistory,
  }
}
