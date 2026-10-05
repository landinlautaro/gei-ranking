import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getJson } from './client'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

describe('request', () => {
  it('parses a JSON response', async () => {
    stubFetch(new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } }))
    await expect(getJson('/api/x')).resolves.toEqual({ ok: true })
  })

  it('rejects an HTML 200 (the SPA fallback) with a readable error', async () => {
    stubFetch(new Response('<!doctype html><html></html>', { headers: { 'Content-Type': 'text/html' } }))
    const error = await getJson('/api/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('unexpected_response')
  })
})
