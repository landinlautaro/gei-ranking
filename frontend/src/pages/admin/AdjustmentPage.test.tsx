import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPlayer, loginAsAdmin, mockApi, problem, renderApp } from '../../test-utils'

const players = [adminPlayer(1, 'Ana Gómez', 1), adminPlayer(2, 'Beto Ruiz', 2), adminPlayer(3, 'Carla Díaz', 3), adminPlayer(5, 'Eva Baja', null)]

async function fill(playerId: string, position: string, reason: string) {
  await userEvent.selectOptions(await screen.findByLabelText('Jugador'), playerId)
  await userEvent.type(screen.getByLabelText('Nueva posición'), position)
  if (reason) await userEvent.type(screen.getByLabelText('Motivo (obligatorio)'), reason)
}

describe('Ajuste manual de posición', () => {
  beforeEach(() => loginAsAdmin())
  afterEach(() => vi.unstubAllGlobals())

  it('solo ofrece a los jugadores que están en el ranking y muestra el rango válido', async () => {
    mockApi({ '/api/admin/players': players })
    renderApp('/admin/adjustments')

    await userEvent.selectOptions(await screen.findByLabelText('Jugador'), '2')

    expect(screen.queryByRole('option', { name: /Eva Baja/ })).not.toBeInTheDocument()
    expect(screen.getByText('Hoy está en el #2. Posiciones válidas: 1 a 3.')).toBeInTheDocument()
  })

  it('el motivo es obligatorio: sin él no se puede aplicar', async () => {
    mockApi({ '/api/admin/players': players })
    renderApp('/admin/adjustments')

    await fill('3', '1', '')

    expect(screen.getByRole('button', { name: 'Aplicar ajuste' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Motivo (obligatorio)'), '   ')
    expect(screen.getByRole('button', { name: 'Aplicar ajuste' })).toBeDisabled()
  })

  it('aplica el ajuste, lo confirma y limpia el formulario', async () => {
    const { requests } = mockApi({
      '/api/admin/players': players,
      'POST /api/admin/ranking/adjustments': { playerId: 3, fromPosition: 3, toPosition: 1 },
    })
    renderApp('/admin/adjustments')

    await fill('3', '1', ' Resultado mal cargado en 2025 ')
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByText(/Carla Díaz pasó del #3 al #1/)).toBeInTheDocument()
    expect(requests.find((r) => r.method === 'POST')!.body).toEqual({ playerId: 3, newPosition: 1, reason: 'Resultado mal cargado en 2025' })
    expect(screen.getByLabelText('Jugador')).toHaveValue('')
    expect(screen.getByLabelText('Motivo (obligatorio)')).toHaveValue('')
  })

  it('traduce los errores del servidor junto al campo', async () => {
    mockApi({
      '/api/admin/players': players,
      'POST /api/admin/ranking/adjustments': problem(422, 'ValidationFailed', { newPosition: ['SamePosition'] }),
    })
    renderApp('/admin/adjustments')

    await fill('2', '2', 'Prueba')
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByText('El jugador ya está en esa posición.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva posición')).toBeInvalid()
  })

  it('muestra el error general cuando no hay detalle por campo', async () => {
    mockApi({ '/api/admin/players': players, 'POST /api/admin/ranking/adjustments': problem(409, 'PlayerNotInRanking') })
    renderApp('/admin/adjustments')

    await fill('2', '1', 'Prueba')
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El jugador no está en el ranking.')
  })
})
