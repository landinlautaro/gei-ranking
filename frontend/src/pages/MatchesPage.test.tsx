import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { match, mockApi, player, renderApp } from '../test-utils'

const ana = player(1, 'Ana Gómez')
const beto = player(2, 'Beto Ruiz')
const players = [
  { ...ana, isActive: true, position: 1 },
  { ...beto, isActive: true, position: 2 },
]

function page(items = [match(1, beto, ana, beto, { notes: 'Se jugó con lluvia' })], total = items.length) {
  return { items, total, page: 1, pageSize: 20 }
}

describe('MatchesPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lista los partidos con fecha, resultado, movimiento y observaciones', async () => {
    mockApi({ '/api/matches': page(), '/api/players': players })
    renderApp('/matches')

    const item = await screen.findByRole('listitem')
    expect(item).toHaveTextContent('11/03/2026')
    expect(item).toHaveTextContent('6-4 6-3')
    expect(item).toHaveTextContent('Beto Ruiz')
    expect(item).toHaveTextContent('Ana Gómez')
    expect(item).toHaveTextContent('Beto Ruiz pasa del #5 al #3')
    expect(item).toHaveTextContent('Se jugó con lluvia')
    expect(screen.getByRole('link', { name: /Beto Ruiz\s*\(ganador\)/ })).toBeInTheDocument()
  })

  it('lee los filtros de la URL y los manda a la API', async () => {
    const { calls } = mockApi({ '/api/matches': page(), '/api/players': players })
    renderApp('/matches?playerId=2&from=2026-03-01&to=2026-03-31')

    await screen.findByRole('listitem')

    const matchesCall = calls.find((c) => c.startsWith('/api/matches'))!
    const query = new URLSearchParams(matchesCall.split('?')[1])
    expect(query.get('playerId')).toBe('2')
    expect(query.get('from')).toBe('2026-03-01')
    expect(query.get('to')).toBe('2026-03-31')
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-03-01')
  })

  it('filtra por jugador y vuelve a la primera página', async () => {
    const { calls } = mockApi({ '/api/matches': page(), '/api/players': players })
    renderApp('/matches?page=2')
    await screen.findByRole('listitem')
    await screen.findByRole('option', { name: 'Ana Gómez' })

    await userEvent.selectOptions(screen.getByLabelText('Jugador'), '1')

    await vi.waitFor(() => {
      const last = new URLSearchParams(calls.filter((c) => c.startsWith('/api/matches')).at(-1)!.split('?')[1])
      expect(last.get('playerId')).toBe('1')
      expect(last.get('page')).toBe('1')
    })
  })

  it('avisa si el rango de fechas es inválido y no consulta', async () => {
    const { calls } = mockApi({ '/api/matches': page(), '/api/players': players })
    renderApp('/matches?from=2026-03-20&to=2026-03-10')

    expect(await screen.findByRole('alert')).toHaveTextContent('no puede ser posterior')
    expect(calls.some((c) => c.startsWith('/api/matches'))).toBe(false)
  })

  it('limpia los filtros', async () => {
    mockApi({ '/api/matches': page(), '/api/players': players })
    renderApp('/matches?from=2026-03-01')
    await screen.findByRole('listitem')

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(screen.getByLabelText('Desde')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('muestra un estado vacío distinto con y sin filtros', async () => {
    mockApi({ '/api/matches': page([]), '/api/players': players })
    renderApp('/matches?playerId=1')

    expect(await screen.findByText('No hay partidos con esos filtros.')).toBeInTheDocument()
  })

  it('pagina', async () => {
    const items = Array.from({ length: 20 }, (_, i) => match(i + 1, beto, ana, beto))
    const { calls } = mockApi({ '/api/matches': page(items, 45), '/api/players': players })
    renderApp('/matches')

    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /Siguiente/ }))

    await vi.waitFor(() => {
      const last = new URLSearchParams(calls.filter((c) => c.startsWith('/api/matches')).at(-1)!.split('?')[1])
      expect(last.get('page')).toBe('2')
    })
  })

  it('muestra el error de la API', async () => {
    mockApi({ '/api/matches': 500, '/api/players': players })
    renderApp('/matches')

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor respondió con un error (500)')
  })
})
