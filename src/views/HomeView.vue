<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const initials = computed(() => {
  const name = auth.user?.name ?? ''
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
})

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-base-200 flex flex-col">

    <!-- Navbar -->
    <div class="navbar bg-base-100 shadow-sm px-6">
      <div class="flex-1">
        <span class="text-xl font-bold tracking-tight">Template</span>
      </div>
      <div class="flex-none gap-3">
        <div class="dropdown dropdown-end">
          <div tabindex="0" role="button" class="avatar placeholder cursor-pointer">
            <div class="bg-primary text-primary-content rounded-full w-10">
              <span class="text-sm font-semibold">{{ initials }}</span>
            </div>
          </div>
          <ul tabindex="0" class="menu menu-sm dropdown-content bg-base-100 rounded-box z-10 mt-3 w-52 p-2 shadow-lg border border-base-300">
            <li class="menu-title text-xs px-4 pt-2">
              <span>{{ auth.user?.name }}</span>
            </li>
            <li><a @click="handleLogout" class="text-error">Cerrar sesión</a></li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Contenido -->
    <main class="flex-1 flex items-center justify-center p-6">
      <div class="max-w-lg w-full flex flex-col gap-6">

        <!-- Tarjeta de bienvenida -->
        <div class="card bg-base-100 shadow-md">
          <div class="card-body items-center text-center gap-4">
            <div class="avatar placeholder">
              <div class="bg-primary text-primary-content rounded-full w-20">
                <span class="text-3xl font-bold">{{ initials }}</span>
              </div>
            </div>
            <div>
              <h1 class="text-2xl font-bold">¡Bienvenido, {{ auth.user?.name ?? 'usuario' }}!</h1>
              <p class="text-base-content/60 text-sm mt-1">Has iniciado sesión correctamente.</p>
            </div>
            <div class="divider my-0"></div>
            <div class="grid grid-cols-2 gap-4 w-full text-left">
              <div class="bg-base-200 rounded-box p-4">
                <p class="text-xs text-base-content/50 uppercase tracking-wide">Usuario</p>
                <p class="font-semibold mt-1">{{ auth.user?.name ?? '—' }}</p>
              </div>
              <div class="bg-base-200 rounded-box p-4">
                <p class="text-xs text-base-content/50 uppercase tracking-wide">Email</p>
                <p class="font-semibold mt-1 truncate">{{ auth.user?.email ?? '—' }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Acciones rápidas -->
        <div class="grid grid-cols-2 gap-3">
          <button class="btn btn-outline btn-sm h-auto py-3 flex-col gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span class="text-xs">Mi perfil</span>
          </button>
          <button class="btn btn-outline btn-sm h-auto py-3 flex-col gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span class="text-xs">Configuración</span>
          </button>
        </div>

        <button class="btn btn-ghost btn-sm text-error self-center" @click="handleLogout">
          Cerrar sesión
        </button>

      </div>
    </main>
  </div>
</template>
