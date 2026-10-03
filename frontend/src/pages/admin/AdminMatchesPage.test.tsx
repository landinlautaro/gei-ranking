import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminMatch, adminPlayer, loginAsAdmin, mockApi, player, problem, renderApp } from '../../test-utils'

const ana = player(1, 'Ana Gómez')
const beto = player(2, 'Beto Ruiz')
const players = [adminPlayer(1, 'Ana Gómez', 3), adminPlayer(2, 'Beto Ruiz', 5)]

const page = (items = [adminMatch(1, beto, ana, beto)], total = items.length) => ({ items, total, page: 1, pageSize: 20 })

describe('Gestión de partidos', () => {
  beforeEach(() => loginAsAdmin())
  afterEach(() => vi.unstubAllGlobals())

  it('lista los partidos con su estado y advertencias', async () => {
    mockApi({
      '/api/admin/players': players,
      '/api/admin/matches': page([
        adminMatch(1, beto, ana, beto),
        adminMatch(2, ana, beto, ana, { status: 'Voided', movementText: null }),
        adminMatch(3, beto, ana, ana, { warning: 'OutOfRange', notes: 'Se jugó con lluvia' }),
      ]),
    })
    renderApp('/admin/matches')

    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText('11/03/2026')).toBeInTheDocument()
    expect(within(items[0]).getByText('6-4 6-3')).toBeInTheDocument()
    expect(within(items[1]).getByText('Anulado')).toBeInTheDocument()
    expect(within(items[1]).queryByRole('link', { name: /Editar/ })).not.toBeInTheDocument()
    expect(within(items[2]).getByText('Advertencia: fuera de rango')).toBeInTheDocument()
    expect(within(items[2]).getByText(/más de 5 puestos o hacia abajo/)).toBeInTheDocument()
    expect(within(items[2]).getByText('Se jugó con lluvia')).toBeInTheDocument()
  })

  it('cada partido válido enlaza a su edición', async () => {
    mockApi({ '/api/admin/players': players, '/api/admin/matches': page([adminMatch(7, beto, ana, beto)]) })
    renderApp('/admin/matches')

    const link = await screen.findByRole('link', { name: /Editar partido del 11\/03\/2026 entre Beto Ruiz y Ana Gómez/ })

    expect(link).toHaveAttribute('href', '/admin/matches/7/edit')
  })

  it('anula pidiendo confirmación y avisa de los partidos que quedaron fuera de rango', async () => {
    const { requests } = mockApi({
      '/api/admin/players': players,
      '/api/admin/matches': page(),
      'POST /api/admin/matches/1/void': { match: adminMatch(1, beto, ana, beto, { status: 'Voided' }), newlyWarnedMatchIds: [5, 6] },
    })
    renderApp('/admin/matches')

    await userEvent.click(await screen.findByRole('button', { name: 'Anular' }))
    expect(requests.some((r) => r.method === 'POST')).toBe(false)
    expect(screen.getByText('¿Anular este partido? El ranking se recalcula.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sí, anular' }))

    expect(await screen.findByText(/Partido anulado y ranking recalculado/)).toBeInTheDocument()
    expect(screen.getByText(/2 partidos posteriores quedaron fuera de rango/)).toBeInTheDocument()
    expect(requests.some((r) => r.method === 'POST' && r.path === '/api/admin/matches/1/void')).toBe(true)
  })

  it('cancelar la confirmación no anula nada', async () => {
    const { requests } = mockApi({ '/api/admin/players': players, '/api/admin/matches': page() })
    renderApp('/admin/matches')

    await userEvent.click(await screen.findByRole('button', { name: 'Anular' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Anular' })).toBeInTheDocument()
    expect(requests.some((r) => r.method === 'POST')).toBe(false)
  })

  it('muestra el error si no se pudo anular', async () => {
    mockApi({ '/api/admin/players': players, '/api/admin/matches': page(), 'POST /api/admin/matches/1/void': problem(404, 'NotFound') })
    renderApp('/admin/matches')

    await userEvent.click(await screen.findByRole('button', { name: 'Anular' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sí, anular' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos lo que buscás.')
  })

  it('manda los filtros de la URL a la API', async () => {
    const { requests } = mockApi({ '/api/admin/players': players, '/api/admin/matches': page() })
    renderApp('/admin/matches?playerId=2&status=Voided&withWarnings=true&from=2026-03-01&to=2026-03-31&page=2')

    await screen.findByRole('listitem')

    const query = requests.find((r) => r.path === '/api/admin/matches')!.query
    expect(Object.fromEntries(query)).toEqual({
      playerId: '2',
      status: 'Voided',
      withWarnings: 'true',
      from: '2026-03-01',
      to: '2026-03-31',
      page: '2',
      pageSize: '20',
    })
    expect(screen.getByLabelText('Solo partidos con advertencias')).toBeChecked()
    expect(screen.getByLabelText('Estado')).toHaveValue('Voided')
  })

  it('filtrar por estado vuelve a la primera página', async () => {
    const { requests } = mockApi({ '/api/admin/players': players, '/api/admin/matches': page() })
    renderApp('/admin/matches?page=3')
    await screen.findByRole('listitem')

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Valid')

    await vi.waitFor(() => {
      const last = requests.filter((r) => r.path === '/api/admin/matches').at(-1)!.query
      expect(last.get('status')).toBe('Valid')
      expect(last.get('page')).toBe('1')
    })
  })

  it('con un rango de fechas inválido avisa y no consulta', async () => {
    const { requests } = mockApi({ '/api/admin/players': players, '/api/admin/matches': page() })
    renderApp('/admin/matches?from=2026-03-20&to=2026-03-10')

    expect(await screen.findByText(/no puede ser posterior/)).toBeInTheDocument()
    expect(requests.some((r) => r.path === '/api/admin/matches')).toBe(false)
  })

  it('muestra estados vacío y de error, y pagina', async () => {
    mockApi({ '/api/admin/players': players, '/api/admin/matches': page([], 0) })
    const { unmount } = renderApp('/admin/matches?status=Voided')
    expect(await screen.findByText('No hay partidos con esos filtros.')).toBeInTheDocument()
    unmount()

    mockApi({ '/api/admin/players': players, '/api/admin/matches': 500 })
    const second = renderApp('/admin/matches')
    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor respondió con un error (500)')
    second.unmount()

    const items = Array.from({ length: 20 }, (_, i) => adminMatch(i + 1, beto, ana, beto))
    mockApi({ '/api/admin/players': players, '/api/admin/matches': page(items, 45) })
    renderApp('/admin/matches')
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled()
  })
})
