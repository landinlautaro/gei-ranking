import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { match, mockApi, player, profile, rankingRow, renderApp } from '../test-utils'

const juan = player(5, 'Juan Perez', 'Juancho')
const rival = player(3, 'Rival Tres')
const other = player(9, 'Otro Nueve')

describe('PlayerPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('muestra datos, estadísticas y a quiénes puede desafiar', async () => {
    mockApi({
      '/api/players/5': profile(juan, {
        canChallenge: [rankingRow(3, rival), rankingRow(4, player(4, 'Rival Cuatro'))],
      }),
      '/api/matches': { items: [], total: 0, page: 1, pageSize: 10 },
    })
    renderApp('/players/5')

    expect(await screen.findByRole('heading', { name: 'Juan Perez' })).toBeInTheDocument()
    expect(screen.getByText('“Juancho”')).toBeInTheDocument()
    expect(screen.getByText('Puesto #5')).toBeInTheDocument()
    expect(screen.getByText('Subió 3 puestos')).toBeInTheDocument()
    expect(screen.getByText(/Zurdo · Revés a dos manos · En el club desde 01\/01\/2026/)).toBeInTheDocument()

    const stat = (label: string) => screen.getByText(label).closest('div')!
    expect(within(stat('% de victorias')).getByText('75%')).toBeInTheDocument()
    expect(within(stat('Racha actual')).getByText('2 victorias seguidas')).toBeInTheDocument()
    expect(within(stat('Mejor posición')).getByText('#4')).toBeInTheDocument()
    expect(within(stat('Defensas ganadas')).getByText('1')).toBeInTheDocument()

    const challenge = screen.getByRole('heading', { name: 'A quiénes puede desafiar hoy' }).closest('section')!
    expect(within(challenge).getByRole('link', { name: /Rival Tres/ })).toHaveAttribute('href', '/players/3')
    expect(within(challenge).getAllByRole('listitem')).toHaveLength(2)
  })

  it('cuenta los partidos desde el punto de vista del jugador', async () => {
    mockApi({
      '/api/players/5': profile(juan),
      '/api/matches': {
        items: [
          match(1, juan, rival, juan, { challengerPositionBefore: 5, challengerPositionAfter: 3 }),
          match(2, other, juan, other, { result: '4-6 6-3 7-10', challengedPositionBefore: 3, challengedPositionAfter: 3 }),
        ],
        total: 2,
        page: 1,
        pageSize: 10,
      },
    })
    renderApp('/players/5')

    const items = await screen.findAllByRole('listitem')
    const first = items.find((li) => within(li).queryByText('Ganó'))!
    expect(first).toHaveTextContent('Desafiante · vs')
    expect(first).toHaveTextContent('Rival Tres')
    expect(first).toHaveTextContent('#5 → #3')

    const second = items.find((li) => within(li).queryByText('Perdió'))!
    expect(second).toHaveTextContent('Desafiado · vs')
    expect(second).toHaveTextContent('sigue #3')
  })

  it('ofrece ver todos los partidos cuando hay más de los recientes', async () => {
    mockApi({
      '/api/players/5': profile(juan),
      '/api/matches': { items: [match(1, juan, rival, juan)], total: 25, page: 1, pageSize: 10 },
    })
    renderApp('/players/5')

    const link = await screen.findByRole('link', { name: 'Ver los 25 partidos' })
    expect(link).toHaveAttribute('href', '/matches?playerId=5')
  })

  it('al número uno le explica que no hay a quién desafiar', async () => {
    mockApi({
      '/api/players/5': profile(juan, { position: 1, movement: 0, previousPosition: null }),
      '/api/matches': { items: [], total: 0, page: 1, pageSize: 10 },
    })
    renderApp('/players/5')

    expect(await screen.findByText(/Es el número uno/)).toBeInTheDocument()
    expect(screen.getByText('Todavía no jugó partidos.')).toBeInTheDocument()
  })

  it('un jugador dado de baja figura fuera del ranking', async () => {
    mockApi({
      '/api/players/5': profile(juan, { position: null, isActive: false, previousPosition: null, movement: 0 }),
      '/api/matches': { items: [], total: 0, page: 1, pageSize: 10 },
    })
    renderApp('/players/5')

    expect(await screen.findByText('Fuera del ranking')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    expect(screen.getByText(/No está en el ranking/)).toBeInTheDocument()
  })

  it('muestra un mensaje cuando el jugador no existe', async () => {
    mockApi({ '/api/players/99': 404, '/api/matches': { items: [], total: 0, page: 1, pageSize: 10 } })
    renderApp('/players/99')

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos lo que buscás.')
    expect(screen.getByRole('link', { name: 'Volver al ranking' })).toBeInTheDocument()
  })

  it('un id inválido no consulta a la API', async () => {
    const { fetchMock } = mockApi({})
    renderApp('/players/abc')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
