import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearMe, getMe, setMe } from '../lib/meStore'
import { mockApi, player, profile, rankingRow, renderApp } from '../test-utils'

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

  it('con el jugador ya elegido va directo a su puesto, y "No soy" vuelve al selector', async () => {
    setMe(5)
    mockApi({ '/api/ranking': rows, '/api/players': listing, '/api/players/5': profile(juan) })
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: 'No soy Juancho' }))

    expect(await screen.findByLabelText('Tu nombre')).toBeInTheDocument()
    expect(getMe()).toBeNull()
  })

  it('si el jugador guardado ya no existe, olvida la elección', async () => {
    setMe(5)
    mockApi({ '/api/ranking': rows, '/api/players': listing, '/api/players/5': 404 })
    renderApp('/')

    expect(await screen.findByLabelText('Tu nombre')).toBeInTheDocument()
    expect(getMe()).toBeNull()
  })
})
