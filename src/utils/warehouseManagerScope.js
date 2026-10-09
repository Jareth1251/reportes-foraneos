// auth.user.agent es el login con el que se autenticó contra QAD (PosUser::agent
// en el backend, no existe un campo "username" en ese modelo). Solo estos logins
// administran agentes de almacén, cada uno acotado a su site — igual que en el
// backend (WarehouseAgentController::MANAGER_SCOPES).
const WAREHOUSE_MANAGER_SCOPES = {
  jdomingu: { login: 'jdomingu', site: '3000', siteLabel: '3000 (MTY)' },
  esanchez: { login: 'esanchez', site: '3000', siteLabel: '3000 (MTY)' },
  jarethc:  { login: 'jarethc',  site: '3000', siteLabel: '3000 (MTY)' },
  omartine: { login: 'omartine', site: '3100', siteLabel: '3100 (CDMX)' },
}

export function getWarehouseManagerScope(user) {
  const login = String(user?.agent ?? '').trim().toLowerCase()
  return WAREHOUSE_MANAGER_SCOPES[login] ?? null
}
