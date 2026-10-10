import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loginAsAdmin, match, mockApi, player, rankingRow, renderApp } from '../../test-utils'
import { previousMonday } from './SharePage'

const ana = player(1, 'Ana Gómez')
const beto = player(2, 'Beto Pérez')

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

  it('el menú de administración incluye "Publicar"', async () => {
    mockApi({ '/api/ranking': [], '/api/matches': { items: [], total: 0, page: 1, pageSize: 100 } })
    renderApp('/admin/share')

    expect(await screen.findByRole('link', { name: 'Publicar' })).toHaveAttribute('href', '/admin/share')
  })
})
