import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminChallenge, adminPlayer, challengePreview, loginAsAdmin, mockApi, player, preview, renderApp } from '../../test-utils'

const ana = player(1, 'Ana Gómez')
const beto = player(2, 'Beto Ruiz')
const caro = player(3, 'Caro Paz')
const players = [adminPlayer(1, 'Ana Gómez', 3), adminPlayer(2, 'Beto Ruiz', 5), adminPlayer(3, 'Caro Paz', 4)]

const EXPIRED = { deadlineAt: '2026-01-12T02:59:59.999Z', isExpired: true }
const page = (items: ReturnType<typeof adminChallenge>[]) => ({ items, total: items.length, page: 1, pageSize: 20 })

describe('Desafíos · administración', () => {
  beforeEach(() => loginAsAdmin())
  afterEach(() => vi.unstubAllGlobals())

  describe('lista', () => {
    it('muestra plazo, coordinación, vencimiento y estado de cada desafío', async () => {
      mockApi({
        '/api/admin/players': players,
        '/api/admin/challenges': page([
          adminChallenge(1, beto, ana, { status: 'Scheduled', scheduledAt: '2099-01-08T22:00:00Z', notes: 'Cancha 3' }),
          adminChallenge(2, caro, ana, EXPIRED),
          adminChallenge(3, beto, caro, { status: 'Played', matchId: 9 }),
          adminChallenge(4, ana, caro, { status: 'Cancelled' }),
        ]),
      })
      renderApp('/admin/challenges')

      const [scheduled, expired, played, cancelled] = await screen.findAllByRole('listitem')
      expect(scheduled).toHaveTextContent(/Vence el dom 11\/01 · quedan \d+ días/)
      expect(scheduled).toHaveTextContent('Coordinado: jue 08/01 19:00')
      expect(scheduled).toHaveTextContent('#8 Beto Ruiz')
      expect(scheduled).toHaveTextContent('Cancha 3')
      expect(expired).toHaveTextContent('Venció el dom 11/01')
      expect(expired).toHaveTextContent('Pasó el plazo')
      expect(played).toHaveTextContent('Jugado')
      expect(cancelled).toHaveTextContent('Cancelado')
      expect(within(played).queryByRole('link', { name: /Cargar resultado/ })).not.toBeInTheDocument()
      expect(within(cancelled).queryByRole('button', { name: 'Cancelar desafío' })).not.toBeInTheDocument()
    })

    it('"Cargar resultado" lleva al formulario con el desafío', async () => {
      mockApi({ '/api/admin/players': players, '/api/admin/challenges': page([adminChallenge(7, beto, ana)]) })
      renderApp('/admin/challenges')

      const link = await screen.findByRole('link', { name: 'Cargar resultado de Beto Ruiz y Ana Gómez' })

      expect(link).toHaveAttribute('href', '/admin/results/new?challengeId=7')
    })

    it('por defecto pide los abiertos y el filtro cambia el estado pedido', async () => {
      const { requests } = mockApi({ '/api/admin/players': players, '/api/admin/challenges': page([adminChallenge(1, beto, ana)]) })
      renderApp('/admin/challenges')
      await screen.findByRole('listitem')

      expect(requests.find((r) => r.path === '/api/admin/challenges')!.query.get('status')).toBe('Active')

      await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Expired')
      await waitFor(() => expect(requests.filter((r) => r.path === '/api/admin/challenges').at(-1)!.query.get('status')).toBe('Expired'))

      await userEvent.selectOptions(screen.getByLabelText('Estado'), 'All')
      await waitFor(() => expect(requests.filter((r) => r.path === '/api/admin/challenges').at(-1)!.query.get('status')).toBeNull())
    })

    it('avisa cuando no hay desafíos', async () => {
      mockApi({ '/api/admin/players': players, '/api/admin/challenges': page([]) })
      renderApp('/admin/challenges')

      expect(await screen.findByText('No hay desafíos con esos filtros.')).toBeInTheDocument()
    })

    it('cancela pidiendo confirmación', async () => {
      const { requests } = mockApi({
        '/api/admin/players': players,
        '/api/admin/challenges': page([adminChallenge(1, beto, ana)]),
        'POST /api/admin/challenges/1/cancel': adminChallenge(1, beto, ana, { status: 'Cancelled' }),
      })
      renderApp('/admin/challenges')

      await userEvent.click(await screen.findByRole('button', { name: 'Cancelar desafío' }))
      expect(requests.some((r) => r.method === 'POST')).toBe(false)

      await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }))

      expect(await screen.findByText('Desafío cancelado.')).toBeInTheDocument()
      expect(requests.some((r) => r.method === 'POST' && r.path === '/api/admin/challenges/1/cancel')).toBe(true)
    })

    it('coordina día y hora, y deja el plazo como estaba', async () => {
      const original = adminChallenge(1, beto, ana)
      const { requests } = mockApi({
        '/api/admin/players': players,
        '/api/admin/challenges': page([original]),
        'PUT /api/admin/challenges/1': adminChallenge(1, beto, ana, { status: 'Scheduled' }),
      })
      renderApp('/admin/challenges')

      await userEvent.click(await screen.findByRole('button', { name: 'Coordinar o editar' }))
      fireEvent.change(screen.getByLabelText('Día y hora acordados'), { target: { value: '2099-01-08T19:00' } })
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(requests.some((r) => r.method === 'PUT')).toBe(true))
      expect(requests.find((r) => r.method === 'PUT')!.body).toEqual({
        issuedAt: original.issuedAt,
        deadlineAt: original.deadlineAt,
        scheduledAt: '2099-01-08T19:00:00-03:00',
        notes: null,
      })
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument())
    })

    it('extiende el plazo al final del día elegido', async () => {
      const { requests } = mockApi({
        '/api/admin/players': players,
        '/api/admin/challenges': page([adminChallenge(1, beto, ana, EXPIRED)]),
        'PUT /api/admin/challenges/1': adminChallenge(1, beto, ana),
      })
      renderApp('/admin/challenges')

      await userEvent.click(await screen.findByRole('button', { name: 'Coordinar o editar' }))
      fireEvent.change(screen.getByLabelText('Vence el'), { target: { value: '2026-01-18' } })
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(requests.some((r) => r.method === 'PUT')).toBe(true))
      expect(requests.find((r) => r.method === 'PUT')!.body).toMatchObject({ deadlineAt: '2026-01-18T23:59:59.999-03:00', scheduledAt: null })
    })
  })

  describe('registrar desafío', () => {
    const routes = (extra: Record<string, unknown> = {}) =>
      ({
        '/api/admin/players': players,
        'POST /api/admin/challenges/preview': challengePreview(),
        'POST /api/admin/challenges': adminChallenge(11, beto, ana, { challengerPosition: 5, challengedPosition: 3, deadlineAt: '2026-03-16T02:59:59.999Z' }),
        ...extra,
      }) as Parameters<typeof mockApi>[0]

    async function fill() {
      await userEvent.selectOptions(await screen.findByLabelText('Desafiante'), '2')
      await userEvent.selectOptions(screen.getByLabelText('Desafiado'), '1')
      fireEvent.change(screen.getByLabelText('Fecha del desafío'), { target: { value: '2026-03-09' } })
    }

    it('muestra el plazo y las posiciones, y guarda', async () => {
      const { requests } = mockApi(routes())
      renderApp('/admin/challenges/new')

      await fill()

      expect(await screen.findByText('Vence el dom 15/03')).toBeInTheDocument()
      expect(screen.getByText('Desafiante: #5 · Desafiado: #3')).toBeInTheDocument()

      const save = screen.getByRole('button', { name: 'Registrar desafío' })
      await waitFor(() => expect(save).toBeEnabled())
      await userEvent.click(save)

      expect(await screen.findByText('Desafío registrado.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Copiar para WhatsApp' })).toBeInTheDocument()
      expect(requests.find((r) => r.method === 'POST' && r.path === '/api/admin/challenges')!.body).toEqual({
        challengerId: 2,
        challengedId: 1,
        issuedAt: '2026-03-09T12:00:00-03:00',
        scheduledAt: null,
        notes: null,
        confirmWarnings: false,
      })
    })

    it('con advertencias no deja guardar hasta confirmarlas', async () => {
      const { requests } = mockApi(
        routes({ 'POST /api/admin/challenges/preview': challengePreview({ warnings: ['AlreadyChallengedThisWeek', 'OutsideChallengeWindow'] }) }),
      )
      renderApp('/admin/challenges/new')

      await fill()

      expect(await screen.findByText(/Alguno de los dos ya tiene un desafío esta semana/)).toBeInTheDocument()
      expect(screen.getByText(/Se desafía de lunes a miércoles/)).toBeInTheDocument()
      const save = screen.getByRole('button', { name: 'Registrar desafío' })
      expect(save).toBeDisabled()

      await userEvent.click(screen.getByRole('checkbox', { name: /Entiendo las advertencias/ }))
      await waitFor(() => expect(save).toBeEnabled())
      await userEvent.click(save)

      await screen.findByText('Desafío registrado.')
      expect(requests.find((r) => r.method === 'POST' && r.path === '/api/admin/challenges')!.body).toMatchObject({ confirmWarnings: true })
    })

    it('no deja guardar si la vista previa tiene errores', async () => {
      mockApi(routes({ 'POST /api/admin/challenges/preview': challengePreview({ isValid: false, errors: { challengedId: ['PlayerNotRanked'] }, deadlineAt: null }) }))
      renderApp('/admin/challenges/new')

      await fill()

      expect(await screen.findByText(/Desafiado: Uno de los jugadores no está en el ranking/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Registrar desafío' })).toBeDisabled()
    })

    it('si cambia un dato, hay que volver a confirmar las advertencias', async () => {
      mockApi(routes({ 'POST /api/admin/challenges/preview': challengePreview({ warnings: ['OutOfRange'] }) }))
      renderApp('/admin/challenges/new')
      await fill()
      const confirm = await screen.findByRole('checkbox', { name: /Entiendo las advertencias/ })
      await userEvent.click(confirm)
      expect(confirm).toBeChecked()

      fireEvent.change(screen.getByLabelText('Fecha del desafío'), { target: { value: '2026-03-10' } })

      expect(screen.getByRole('checkbox', { name: /Entiendo las advertencias/ })).not.toBeChecked()
    })
  })

  describe('cargar el resultado de un desafío', () => {
    const open = adminChallenge(7, beto, ana)
    const routes = (challenge = open) =>
      ({
        '/api/admin/players': players,
        '/api/admin/challenges/7': challenge,
        'POST /api/admin/matches/preview': preview(),
        'POST /api/admin/matches': { match: { ...preview(), id: 10 }, newlyWarnedMatchIds: [] },
      }) as Parameters<typeof mockApi>[0]

    it('precarga a los dos jugadores, no deja cambiarlos y manda el desafío', async () => {
      const { requests } = mockApi(routes())
      renderApp('/admin/results/new?challengeId=7')

      expect(await screen.findByText(/Este resultado cierra el desafío de Beto Ruiz a Ana Gómez/)).toBeInTheDocument()
      expect(screen.getByLabelText('Desafiante')).toHaveValue('2')
      expect(screen.getByLabelText('Desafiante')).toBeDisabled()
      expect(screen.getByLabelText('Desafiado')).toHaveValue('1')
      expect(screen.getByLabelText('Desafiado')).toBeDisabled()

      fireEvent.change(screen.getByLabelText('Fecha del partido'), { target: { value: '2026-03-10' } })
      for (const [label, value] of [
        ['Set 1: games del desafiante', '6'],
        ['Set 1: games del desafiado', '4'],
        ['Set 2: games del desafiante', '6'],
        ['Set 2: games del desafiado', '3'],
      ]) {
        await userEvent.type(screen.getByLabelText(label), value)
      }

      expect(await screen.findByText('Gana Beto Ruiz')).toBeInTheDocument()
      expect(requests.filter((r) => r.path === '/api/admin/matches/preview').at(-1)!.body).toMatchObject({ challengeId: 7 })
    })

    it('un desafío que ya no está abierto no admite resultado', async () => {
      mockApi(routes(adminChallenge(7, beto, ana, { status: 'Played', matchId: 3 })))
      renderApp('/admin/results/new?challengeId=7')

      expect(await screen.findByRole('alert')).toHaveTextContent('Este desafío ya no está abierto')
      expect(screen.queryByLabelText('Desafiante')).not.toBeInTheDocument()
    })

    it('sin desafío en la URL el formulario es el de siempre', async () => {
      mockApi(routes())
      renderApp('/admin/results/new')

      expect(await screen.findByLabelText('Desafiante')).toBeEnabled()
      expect(screen.queryByText(/Este resultado cierra el desafío/)).not.toBeInTheDocument()
    })
  })

  it('está en el menú de administración', async () => {
    mockApi({ '/api/admin/players': players, '/api/admin/challenges': page([]) })
    renderApp('/admin/challenges')

    expect(await screen.findByRole('link', { name: 'Desafíos' })).toHaveAttribute('href', '/admin/challenges')
  })
})
