import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { challenge, mockApi, player, profile, rankingRow, renderApp } from '../test-utils'

const ana = player(1, 'Ana Gómez')
const beto = player(2, 'Beto Ruiz')
const caro = player(3, 'Caro Paz')
const dani = player(4, 'Dani Soto')

const EXPIRED = { deadlineAt: '2026-01-12T02:59:59.999Z', isExpired: true }

describe('ChallengesPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('separa pendientes, vencidos y jugados, con posiciones y cuenta regresiva', async () => {
    mockApi({
      '/api/challenges': {
        active: [challenge(1, beto, ana, { challengerPosition: 8, challengedPosition: 5 })],
        expired: [challenge(2, caro, ana, EXPIRED)],
        recentlyPlayed: [challenge(3, dani, ana, { status: 'Played', matchId: 9 })],
      },
    })
    renderApp('/challenges')

    const pending = await screen.findByRole('region', { name: /Pendientes/ })
    const [open] = within(pending).getAllByRole('listitem')
    expect(open).toHaveTextContent('#8Beto Ruiz')
    expect(open).toHaveTextContent('#5Ana Gómez')
    expect(open).toHaveTextContent(/Vence el dom 11\/01 · quedan \d+ días/)

    const expired = screen.getByRole('region', { name: /Vencidos/ })
    expect(within(expired).getByRole('listitem')).toHaveTextContent('Venció el dom 11/01')
    expect(expired).toHaveTextContent('el coordinador decide')

    const played = screen.getByRole('region', { name: /Jugados en los últimos 7 días/ })
    expect(within(played).getByRole('listitem')).toHaveTextContent('Jugado')
  })

  it('marca como coordinado un desafío con fecha acordada', async () => {
    mockApi({
      '/api/challenges': {
        active: [challenge(1, beto, ana, { status: 'Scheduled', scheduledAt: '2099-01-08T22:00:00Z' })],
        expired: [],
        recentlyPlayed: [],
      },
    })
    renderApp('/challenges')

    expect(await screen.findByText('Coordinado: jue 08/01 19:00')).toBeInTheDocument()
  })

  it('no muestra secciones vacías de vencidos ni jugados', async () => {
    mockApi({ '/api/challenges': { active: [challenge(1, beto, ana)], expired: [], recentlyPlayed: [] } })
    renderApp('/challenges')

    await screen.findByRole('region', { name: /Pendientes/ })
    expect(screen.queryByRole('region', { name: /Vencidos/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Jugados/ })).not.toBeInTheDocument()
  })

  it('avisa cuando no hay desafíos', async () => {
    mockApi({ '/api/challenges': { active: [], expired: [], recentlyPlayed: [] } })
    renderApp('/challenges')

    expect(await screen.findByText('No hay desafíos por ahora.')).toBeInTheDocument()
  })

  it('muestra el error de la API', async () => {
    mockApi({ '/api/challenges': 500 })
    renderApp('/challenges')

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor respondió con un error (500)')
  })

  it('está en el menú principal', async () => {
    mockApi({ '/api/challenges': { active: [], expired: [], recentlyPlayed: [] } })
    renderApp('/challenges')

    expect(await screen.findByRole('link', { name: 'Desafíos' })).toHaveAttribute('href', '/challenges')
  })
})

describe('PlayerPage · desafíos abiertos', () => {
  afterEach(() => vi.unstubAllGlobals())

  const routes = (activeChallenges: ReturnType<typeof challenge>[]) => ({
    '/api/players/1': profile(ana, { activeChallenges }),
    '/api/matches': { items: [], total: 0, page: 1, pageSize: 10 },
  })

  it('cuenta el desafío desde el punto de vista del jugador', async () => {
    mockApi(routes([challenge(1, ana, beto, { challengerPosition: 5, challengedPosition: 3 }), challenge(2, caro, ana, EXPIRED)]))
    renderApp('/players/1')

    const section = await screen.findByRole('region', { name: 'Desafíos abiertos' })
    const [asChallenger, asChallenged] = within(section).getAllByRole('listitem')
    expect(asChallenger).toHaveTextContent('Desafía a')
    expect(asChallenger).toHaveTextContent('Beto Ruiz')
    expect(asChallenged).toHaveTextContent('Lo desafía')
    expect(asChallenged).toHaveTextContent('Caro Paz')
    expect(asChallenged).toHaveTextContent('Venció el dom 11/01')
  })

  it('en "a quiénes puede desafiar" deja en gris a quien ya tiene un desafío abierto', async () => {
    mockApi({
      ...routes([]),
      '/api/players/1': profile(ana, { canChallenge: [rankingRow(3, caro), rankingRow(4, dani), rankingRow(5, player(5, 'Eli Sosa'))] }),
      '/api/challenges': {
        active: [challenge(1, caro, beto)],
        expired: [challenge(2, player(9, 'Otro'), dani, EXPIRED)],
        recentlyPlayed: [challenge(3, player(5, 'Eli Sosa'), beto, { status: 'Played', matchId: 4 })],
      },
    })
    renderApp('/players/1')

    const section = (await screen.findByRole('heading', { name: 'A quiénes puede desafiar hoy' })).closest('section')!
    const [carolina, daniel, eli] = within(section).getAllByRole('link')
    await waitFor(() => expect(carolina).toHaveTextContent('Ya tiene un desafío'))
    expect(daniel).toHaveTextContent('Ya tiene un desafío') // vencido pero sin resolver: sigue ocupado
    expect(eli).not.toHaveTextContent('Ya tiene un desafío') // ya jugó el suyo
    expect(eli).not.toHaveClass('text-slate-600')
  })

  it('si no se puede traer el tablero, todos figuran disponibles', async () => {
    mockApi({
      ...routes([]),
      '/api/players/1': profile(ana, { canChallenge: [rankingRow(3, caro)] }),
      '/api/challenges': 500,
    })
    renderApp('/players/1')

    const section = (await screen.findByRole('heading', { name: 'A quiénes puede desafiar hoy' })).closest('section')!
    expect(within(section).getByRole('link')).not.toHaveTextContent('Ya tiene un desafío')
  })

  it('usa el singular con un solo desafío y no muestra nada si no hay', async () => {
    mockApi(routes([challenge(1, ana, beto)]))
    const { unmount } = renderApp('/players/1')
    expect(await screen.findByRole('region', { name: 'Desafío abierto' })).toBeInTheDocument()
    unmount()

    mockApi(routes([]))
    renderApp('/players/1')
    await screen.findByRole('heading', { name: 'Ana Gómez' })
    expect(screen.queryByRole('region', { name: /Desafíos? abiertos?/ })).not.toBeInTheDocument()
  })
})
