import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, player, rankingRow, renderApp } from '../test-utils'

const rows = [
  rankingRow(1, player(1, 'Fran Vazquez'), { played: 1, wins: 1 }),
  rankingRow(2, player(2, 'Gastón Quintana', 'Gasti'), { played: 2, wins: 0, losses: 2, challengesLost: 1, previousPosition: 3, movement: -1 }),
  rankingRow(3, player(3, 'Fede Soda'), { played: 2, wins: 2, challengesWon: 2, previousPosition: 5, movement: 2 }),
]

describe('RankingPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('muestra el ranking con estadísticas y movimiento', async () => {
    mockApi({ '/api/ranking': rows })
    renderApp('/')

    const table = await screen.findByRole('table', { name: 'Ranking de jugadores' })
    const body = within(table).getAllByRole('row').slice(1)
    expect(body).toHaveLength(3)

    const gaston = within(body[1])
    expect(gaston.getByText('Gastón Quintana')).toBeInTheDocument()
    expect(gaston.getByText('“Gasti”')).toBeInTheDocument()
    expect(gaston.getByText('Bajó 1 puesto')).toBeInTheDocument()
    expect(within(body[2]).getByText('Subió 2 puestos')).toBeInTheDocument()
    expect(within(body[0]).getByText('Sin cambios de posición')).toBeInTheDocument()
  })

  it('enlaza cada jugador con su perfil', async () => {
    mockApi({ '/api/ranking': rows })
    renderApp('/')

    const link = await screen.findByRole('link', { name: /Fede Soda/ })
    expect(link).toHaveAttribute('href', '/players/3')
  })

  it('busca por nombre o apodo ignorando tildes', async () => {
    mockApi({ '/api/ranking': rows })
    renderApp('/')
    await screen.findByText('Fran Vazquez')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar jugador' }), 'gaston')
    expect(screen.queryByText('Fran Vazquez')).not.toBeInTheDocument()
    expect(screen.getByText('Gastón Quintana')).toBeInTheDocument()

    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'gasti')
    expect(screen.getByText('Gastón Quintana')).toBeInTheDocument()
  })

  it('avisa cuando la búsqueda no encuentra a nadie', async () => {
    mockApi({ '/api/ranking': rows })
    renderApp('/')
    await screen.findByText('Fran Vazquez')

    await userEvent.type(screen.getByRole('searchbox'), 'zzz')

    expect(screen.getByText(/Ningún jugador coincide con “zzz”/)).toBeInTheDocument()
  })

  it('muestra un estado vacío', async () => {
    mockApi({ '/api/ranking': [] })
    renderApp('/')

    expect(await screen.findByText('Todavía no hay jugadores en el ranking.')).toBeInTheDocument()
  })

  it('muestra el error y permite reintentar', async () => {
    const { fetchMock } = mockApi({ '/api/ranking': 500 })
    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor respondió con un error (500)')

    mockApi({ '/api/ranking': rows })
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Fran Vazquez')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalled()
  })

  it('muestra un mensaje claro si no hay conexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
  })

  it('muestra un indicador de carga', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderApp('/')

    expect(screen.getByRole('status')).toHaveTextContent('Cargando ranking…')
  })
})
