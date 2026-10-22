import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearMe, getMe, setMe } from '../lib/meStore'
import { challenge, mockApi, player, profile, rankingRow, renderApp } from '../test-utils'

const juan = player(5, 'Juan Perez', 'Juancho')
const rows = [rankingRow(3, player(3, 'Rival Tres')), rankingRow(5, juan)]
const listing = [
  { ...player(3, 'Rival Tres'), isActive: true, position: 3 },
  { ...juan, isActive: true, position: 5 },
]

describe('MeCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearMe()
  })

  it('al elegir el nombre recuerda al jugador y muestra su puesto y a quién desafiar', async () => {
    mockApi({
      '/api/ranking': rows,
      '/api/players': listing,
      '/api/players/5': profile(juan, { canChallenge: [rankingRow(3, player(3, 'Rival Tres'))] }),
    })
    renderApp('/')

    await userEvent.selectOptions(await screen.findByLabelText('Tu nombre'), 'Juan Perez')

    expect(await screen.findByRole('heading', { name: 'Hola, Juancho' })).toBeInTheDocument()
    expect(screen.getByText('Tu puesto:')).toBeInTheDocument()
    expect(screen.getByText('Hoy podés desafiar a:')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Rival Tres/ }).length).toBeGreaterThan(0)
    expect(getMe()).toBe(5)
  })

  it('en "Hoy podés desafiar a" deja en gris a quien ya tiene un desafío abierto', async () => {
    setMe(5)
    const dos = player(2, 'Rival Dos')
    const tres = player(3, 'Rival Tres')
    mockApi({
      '/api/ranking': rows,
      '/api/players': listing,
      '/api/players/5': profile(juan, { canChallenge: [rankingRow(2, dos), rankingRow(3, tres)] }),
      '/api/challenges': {
        active: [],
        expired: [challenge(1, dos, player(9, 'Otro'), { isExpired: true })],
        recentlyPlayed: [challenge(2, tres, player(9, 'Otro'), { status: 'Played', matchId: 1 })],
      },
    })
    renderApp('/')

    const section = (await screen.findByRole('heading', { name: 'Hola, Juancho' })).closest('section')!
    const [busy, free] = await waitFor(() => {
      const links = within(section).getAllByRole('link', { name: /Rival/ })
      expect(links[0]).toHaveTextContent('Ya tiene un desafío')
      return links
    })
    expect(busy).toHaveClass('bg-slate-100')
    expect(free).not.toHaveTextContent('Ya tiene un desafío')
    expect(free).not.toHaveClass('bg-slate-100')
  })

  it('si no se puede traer el tablero de desafíos, todos figuran disponibles', async () => {
    setMe(5)
    mockApi({
      '/api/ranking': rows,
      '/api/players': listing,
      '/api/players/5': profile(juan, { canChallenge: [rankingRow(3, player(3, 'Rival Tres'))] }),
      '/api/challenges': 500,
    })
    renderApp('/')

    const section = (await screen.findByRole('heading', { name: 'Hola, Juancho' })).closest('section')!
    expect(within(section).getByRole('link', { name: /Rival Tres/ })).not.toHaveTextContent('Ya tiene un desafío')
  })

  it('con el jugador ya elegido va directo a su puesto, y "No soy" vuelve al selector', async () => {
    setMe(5)
    mockApi({ '/api/ranking': rows, '/api/players': listing, '/api/players/5': profile(juan) })
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: 'No soy Juancho' }))

    expect(await screen.findByLabelText('Tu nombre')).toBeInTheDocument()
    expect(getMe()).toBeNull()
  })

  it('"Ver mi lugar en la tabla" limpia la búsqueda y deja el foco en mi fila', async () => {
    setMe(5)
    mockApi({ '/api/ranking': rows, '/api/players': listing, '/api/players/5': profile(juan) })
    renderApp('/')

    const search = await screen.findByLabelText('Buscar jugador')
    await userEvent.type(search, 'Rival')
    expect(document.getElementById('jugador-5')).toBeNull()

    await userEvent.click(await screen.findByRole('button', { name: 'Ver mi lugar en la tabla' }))

    expect(search).toHaveValue('')
    await waitFor(() => expect(document.getElementById('jugador-5')).toHaveFocus())
  })

  it('si el jugador guardado ya no existe, olvida la elección', async () => {
    setMe(5)
    mockApi({ '/api/ranking': rows, '/api/players': listing, '/api/players/5': 404 })
    renderApp('/')

    expect(await screen.findByLabelText('Tu nombre')).toBeInTheDocument()
    expect(getMe()).toBeNull()
  })
})
