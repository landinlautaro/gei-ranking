export interface HealthResponse {
  status: string
  database: string
  serverTimeUtc: string
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health')
  // The API answers 503 with a valid body when the database is down; surface that as an error.
  if (!response.ok) {
    throw new Error(`El servidor respondió ${response.status}`)
  }
  return response.json()
}
