import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/config/axios'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') ?? null)
  const user = ref(null)

  const isAuthenticated = computed(() => !!token.value)

  async function login(username, password) {
    const { data } = await api.post('/auth', { user: username, password })
    token.value = data.token
    user.value = data.user
    localStorage.setItem('token', data.token)
  }

  async function fetchUser() {
    const { data } = await api.get('/auth/me')
    user.value = data.user
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // token ya inválido en el servidor, continuamos igual
    } finally {
      token.value = null
      user.value = null
      localStorage.removeItem('token')
      sessionStorage.removeItem('foraneos_module_chosen')
    }
  }

  return { token, user, isAuthenticated, login, fetchUser, logout }
})
