<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.message ?? 'Credenciales incorrectas'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <div class="card w-full max-w-sm bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title justify-center text-2xl mb-2">Iniciar sesión</h2>

        <div v-if="error" role="alert" class="alert alert-error text-sm">
          <span>{{ error }}</span>
        </div>

        <form @submit.prevent="handleLogin" class="flex flex-col gap-4">
          <label class="form-control w-full">
            <div class="label"><span class="label-text">Usuario</span></div>
            <input
              v-model="username"
              type="text"
              placeholder="usuario"
              class="input input-bordered w-full"
              required
              autocomplete="username"
            />
          </label>

          <label class="form-control w-full">
            <div class="label"><span class="label-text">Contraseña</span></div>
            <input
              v-model="password"
              type="password"
              placeholder="••••••••"
              class="input input-bordered w-full"
              required
              autocomplete="current-password"
            />
          </label>

          <button type="submit" class="btn btn-primary w-full" :disabled="loading">
            <span v-if="loading" class="loading loading-spinner loading-sm"></span>
            {{ loading ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
