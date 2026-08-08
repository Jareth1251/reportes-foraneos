<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  open:           { type: Boolean, default: false },
  ids:            { type: Array,   default: () => [] },
  defaultChecked: { type: Array,   default: () => [] },
})

const emit = defineEmits(['close', 'confirm'])

const checkedMap = ref({})

watch(() => [props.open, props.ids], () => {
  if (!props.open) return
  const defaults = new Set(props.defaultChecked.length ? props.defaultChecked : props.ids)
  checkedMap.value = Object.fromEntries(props.ids.map(id => [id, defaults.has(id)]))
}, { immediate: true })

function toggleAll(checked) {
  checkedMap.value = Object.fromEntries(props.ids.map(id => [id, checked]))
}

function confirm() {
  const selected = props.ids.filter(id => checkedMap.value[id])
  if (!selected.length) return
  emit('confirm', selected)
}
</script>

<template>
  <dialog :open="open" class="modal modal-bottom sm:modal-middle">
    <div v-if="open" class="modal-box p-0 overflow-hidden" style="max-width:460px;border-radius:16px;">
      <div style="background:linear-gradient(135deg,#455A64,#263238);padding:24px 24px 20px;text-align:center;">
        <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:26px;">🖨️</div>
        <h3 style="color:#fff;font-size:1.1rem;font-weight:700;margin:0;">Pedidos consolidados</h3>
        <p style="color:rgba(255,255,255,0.75);font-size:0.8rem;margin:4px 0 0;">Selecciona pedidos a imprimir</p>
      </div>
      <div style="padding:20px 24px;">
        <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #E0E0E0;cursor:pointer;">
          <span style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:0.9rem;">
            <input
              type="checkbox"
              :checked="ids.length > 0 && ids.every(id => checkedMap[id])"
              @change="toggleAll($event.target.checked)"
            />
            Seleccionar todos
          </span>
          <span style="font-size:0.8rem;color:#666;">
            Seleccionados: <b>{{ ids.filter(id => checkedMap[id]).length }}</b>/{{ ids.length }}
          </span>
        </label>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;">
          <label
            v-for="id in ids"
            :key="id"
            style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #E0E0E0;border-radius:8px;cursor:pointer;font-size:0.88rem;"
          >
            <input type="checkbox" v-model="checkedMap[id]" />
            🧾 {{ id }}
          </label>
        </div>
      </div>
      <div style="padding:0 24px 20px;display:flex;gap:10px;">
        <button @click="$emit('close')"
                style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:0.88rem;color:#555;font-weight:600;">
          Cancelar
        </button>
        <button :disabled="!ids.some(id => checkedMap[id])" @click="confirm"
                style="flex:1;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,#455A64,#263238);color:#fff;cursor:pointer;font-size:0.88rem;font-weight:700;">
          Imprimir seleccionados
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button @click="$emit('close')">cerrar</button></form>
  </dialog>
</template>
