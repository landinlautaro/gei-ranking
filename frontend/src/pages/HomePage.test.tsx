import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HomePage />
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('muestra el estado cuando el backend responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', database: 'ok', serverTimeUtc: '2026-10-02T12:00:00Z' }),
    }))

    renderPage()

    expect(await screen.findByText(/Backend OK · Base de datos OK/)).toBeInTheDocument()
  })

  it('muestra un error cuando el backend no responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    renderPage()

    expect(await screen.findByText(/No se pudo conectar/)).toBeInTheDocument()
  })
})
