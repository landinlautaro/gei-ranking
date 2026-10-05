import { apiUrl } from '../lib/apiUrl'
import { getSession } from '../lib/authStore'

export class ApiError extends Error {
  readonly status: number | null
  /** Stable machine readable identifier sent by the API (problem+json "code"). */
  readonly code: string | null
  /** Field errors: field name -> list of codes. */
  readonly errors: Record<string, string[]>

  constructor(message: string, status: number | null, code: string | null = null, errors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.errors = errors
  }
}

type Params = Record<string, string | number | boolean | null | undefined>

interface RequestOptions {
  params?: Params
  body?: unknown
  form?: FormData
  signal?: AbortSignal
  /** Sends the admin token. */
  auth?: boolean
}

let onUnauthorized: (() => void) | null = null

/** Called when the API rejects a token we sent (expired or invalid): the app logs out. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

async function toApiError(response: Response, hadToken: boolean): Promise<ApiError> {
  let body: { code?: unknown; errors?: unknown } = {}
  try {
    body = await response.json()
  } catch {
    // No body (or not JSON): the status alone has to do.
  }
  const code = typeof body.code === 'string' ? body.code : null
  const errors = body.errors && typeof body.errors === 'object' ? (body.errors as Record<string, string[]>) : {}

  if (response.status === 401 && hadToken) onUnauthorized?.()

  const message =
    response.status === 404 ? 'No encontramos lo que buscás.' : `El servidor respondió con un error (${response.status}).`
  return new ApiError(message, response.status, code, errors)
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const url = query.size > 0 ? `${path}?${query}` : path

  const headers: Record<string, string> = {}
  const token = options.auth ? getSession()?.token : null
  if (token) headers.Authorization = `Bearer ${token}`

  let body: BodyInit | undefined
  if (options.form) {
    body = options.form
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(apiUrl(url), { method, headers, body, signal: options.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('No se pudo conectar con el servidor.', null)
  }

  if (!response.ok) throw await toApiError(response, Boolean(token))
  if (response.status === 204) return undefined as T
  // A misconfigured build (no VITE_API_BASE_URL) gets the SPA's index.html back with a 200.
  if (!/json/i.test(response.headers.get('Content-Type') ?? '')) {
    throw new ApiError(
      'El servidor no respondió como se esperaba. Revisá la configuración de la dirección de la API.',
      response.status,
      'unexpected_response',
    )
  }
  return response.json() as Promise<T>
}

export function getJson<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', path, { params, signal })
}
