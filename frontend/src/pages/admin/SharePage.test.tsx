import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { challenge, loginAsAdmin, match, mockApi, player, rankingRow, renderApp } from '../../test-utils'
import { previousMonday } from './SharePage'

const ana = player(1, 'Ana Gómez')
const beto = player(2, 'Beto Pérez')
const noChallenges = { active: [], expired: [], recentlyPlayed: [] }

describe('previousMonday', () => {
  it('es el lunes de la semana anterior, en hora del club', () => {
    // Tuesday 13/10/2026 -> Monday 05/10. Monday 12/10 -> Monday 05/10 as well.
    expect(previousMonday(new Date('2026-10-13T15:00:00Z'))).toBe('2026-10-05')
    expect(previousMonday(new Date('2026-10-12T15:00:00Z'))).toBe('2026-10-05')
    // Sunday 11/10 at 01:00 UTC is still Saturday 10/10 in Buenos Aires.
    expect(previousMonday(new Date('2026-10-11T01:00:00Z'))).toBe('2026-09-28')
  })
})

describe('Publicar en WhatsApp', () => {
  beforeEach(() => loginAsAdmin())
  afterEach(() => vi.unstubAllGlobals())

  it('arma el mensaje con el ranking y los resultados desde la fecha elegida, y lo copia', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { requests } = mockApi({
      '/api/ranking': [rankingRow(1, ana), rankingRow(2, beto)],
      '/api/matches': { items: [match(1, beto, ana, beto, { movementText: null })], total: 1, page: 1, pageSize: 100 },
      '/api/challenges': noChallenges,
    })
    renderApp('/admin/share')

    const preview = await screen.findByLabelText('Vista previa del mensaje')
    expect(preview).toHaveTextContent('1. Ana Gómez')
    expect(preview).toHaveTextContent('2. Beto Pérez')
    expect(preview).toHaveTextContent('• Beto Pérez le ganó a Ana Gómez 6-4 6-3')
    expect(requests.find((r) => r.path === '/api/matches')!.query.get('from')).toBe(previousMonday())

    await userEvent.click(screen.getByRole('button', { name: 'Copiar mensaje' }))

    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0]).toEqual([expect.stringContaining('*Ranking GEI*')])
    expect(await screen.findByText('¡Copiado!')).toBeInTheDocument()
  })

  it('suma los desafíos pendientes y vencidos al mensaje', async () => {
    mockApi({
      '/api/ranking': [rankingRow(1, ana), rankingRow(2, beto)],
      '/api/matches': { items: [], total: 0, page: 1, pageSize: 100 },
      '/api/challenges': {
        active: [challenge(1, beto, ana, { status: 'Scheduled', scheduledAt: '2099-01-08T22:00:00Z' })],
        expired: [challenge(2, ana, beto, { challengerPosition: 3, challengedPosition: 2, deadlineAt: '2026-01-12T02:59:59.999Z', isExpired: true })],
        recentlyPlayed: [],
      },
    })
    renderApp('/admin/share')

    const preview = await screen.findByLabelText('Vista previa del mensaje')
    expect(preview).toHaveTextContent('*Desafíos pendientes*')
    expect(preview).toHaveTextContent('• #8 Beto Pérez vs #5 Ana Gómez (coordinado: jue 08/01 19:00)')
    expect(preview).toHaveTextContent('*Desafíos vencidos*')
    expect(preview).toHaveTextContent('• #3 Ana Gómez vs #2 Beto Pérez (venció el dom 11/01)')
  })

  it('no arma el mensaje si no se pudieron traer los desafíos', async () => {
    mockApi({ '/api/ranking': [], '/api/matches': { items: [], total: 0, page: 1, pageSize: 100 }, '/api/challenges': 500 })
    renderApp('/admin/share')

    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor respondió con un error (500)')
    expect(screen.queryByLabelText('Vista previa del mensaje')).not.toBeInTheDocument()
  })

  it('el menú de administración incluye "Publicar"', async () => {
    mockApi({ '/api/ranking': [], '/api/matches': { items: [], total: 0, page: 1, pageSize: 100 }, '/api/challenges': noChallenges })
    renderApp('/admin/share')

    expect(await screen.findByRole('link', { name: 'Publicar' })).toHaveAttribute('href', '/admin/share')
  })
})
