export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type Params = Record<string, string | number | boolean | null | undefined>

export async function getJson<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const url = query.size > 0 ? `${path}?${query}` : path

  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('No se pudo conectar con el servidor.', null)
  }

  if (response.status === 404) throw new ApiError('No encontramos lo que buscás.', 404)
  if (!response.ok) throw new ApiError(`El servidor respondió con un error (${response.status}).`, response.status)
  return response.json() as Promise<T>
}
