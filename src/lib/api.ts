// Función del proyecto Prebills (PrebillsForAptusFinancials): prebill_services.
// Desarrollo usa el proxy de Vite (mismo origen); VITE_API_BASE_URL la reemplaza si se define.
const FALLBACK_API = 'https://prebillsforaptusfinancials-730085095.development.catalystserverless.com/server/prebill_services'
export const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || FALLBACK_API).replace(/\/$/, '')

// Las dos pantallas del proyecto se abren entre sí con ?organization_id= (y ?prebill_id= en el detalle).
export const LIST_URL = import.meta.env.VITE_LIST_URL || 'https://universal-aptus-prebills.onslate.com/'
export const DETAIL_URL = import.meta.env.VITE_DETAIL_URL || 'https://universal-aptus-prebilldetail.onslate.com/'
export function screenUrl(base: string, params: Record<string, string>) {
  const target = new URL(base, window.location.href)
  for (const [k, v] of Object.entries(params)) if (v) target.searchParams.set(k, v)
  return target.toString()
}
