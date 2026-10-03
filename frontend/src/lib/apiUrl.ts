/**
 * Joins the API origin (when the frontend is hosted apart from the API) with a path starting with "/".
 * Empty base = same origin, which is how dev (Vite proxy) and the nginx image work.
 */
export function joinUrl(base: string | undefined, path: string): string {
  const root = (base ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\//i.test(path) ? path : `${root}${path}`
}

const API_BASE: string | undefined = import.meta.env.VITE_API_BASE_URL

/** URL of an API endpoint, e.g. "/api/ranking". Set VITE_API_BASE_URL at build time to point at a separate API host. */
export const apiUrl = (path: string) => joinUrl(API_BASE, path)

/** URL of a file served by the API (player photos come back as "/photos/..."). */
export const assetUrl = (path: string) => joinUrl(API_BASE, path)
