import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const DEPT_ROUTES = {
  '004': 'selector',
  '007': 'selector',
  '001': 'selector',
  '002': 'selector',
  '003': 'selector',
  '005': 'selector',
  '006': 'selector',
}

const SESSION_KEY = 'foraneos_module_chosen'

function defaultRouteForUser(user) {
  const deptId = String(user?.departmentId ?? user?.department_id ?? '').trim()
  return DEPT_ROUTES[deptId] ?? 'selector'
}

function moduleRouteForDept(deptId) {
  if (deptId === '004') return 'cajas'
  if (deptId === '007') return 'almacen'
  return 'foraneos'
}

function guardModuleRoute(routeName) {
  return () => {
    if (!sessionStorage.getItem(SESSION_KEY)) return { name: 'selector' }

    const auth   = useAuthStore()
    const deptId = String(auth.user?.departmentId ?? auth.user?.department_id ?? '').trim()
    if (moduleRouteForDept(deptId) !== routeName) return { name: 'selector' }
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'home',
      component: { render: () => null },
      meta: { requiresAuth: true },
    },
    {
      path: '/cajas',
      name: 'cajas',
      component: () => import('@/views/CajasView.vue'),
      meta: { requiresAuth: true },
      beforeEnter: guardModuleRoute('cajas'),
    },
    {
      path: '/selector',
      name: 'selector',
      component: () => import('@/views/ModuleSelectorView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/almacen',
      name: 'almacen',
      component: () => import('@/views/AlmacenView.vue'),
      meta: { requiresAuth: true },
      beforeEnter: guardModuleRoute('almacen'),
    },
    {
      path: '/foraneos',
      name: 'foraneos',
      component: () => import('@/views/ForaneosView.vue'),
      meta: { requiresAuth: true },
      beforeEnter: guardModuleRoute('foraneos'),
    },
    {
      path: '/foraneos-reporte',
      name: 'foraneos-reporte',
      component: () => import('@/views/ForaneosRepView.vue'),
      meta: { requiresAuth: true },
      beforeEnter: () => {
        if (!sessionStorage.getItem(SESSION_KEY)) return { name: 'selector' }
      },
    },
    {
      path: '/checkin-reporte',
      name: 'checkin-reporte',
      component: () => import('@/views/CheckinRepView.vue'),
      meta: { requiresAuth: true },
      beforeEnter: () => {
        if (!sessionStorage.getItem(SESSION_KEY)) return { name: 'selector' }
      },
    },
    {
      path: '/pedidos-pagina-reporte',
      name: 'pedidos-pagina-reporte',
      component: () => import('@/views/PedidosPaginaRepView.vue'),
      meta: { requiresAuth: true },
      beforeEnter: () => {
        if (!sessionStorage.getItem(SESSION_KEY)) return { name: 'selector' }
      },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (auth.isAuthenticated && !auth.user) {
    try {
      await auth.fetchUser()
    } catch {
      auth.logout()
      return { name: 'login' }
    }
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: defaultRouteForUser(auth.user) }
  }

  if (to.name === 'home' && auth.user) {
    return { name: defaultRouteForUser(auth.user) }
  }
})

export { SESSION_KEY }
export default router
