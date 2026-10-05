import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, player, rankingRow, renderApp } from '../test-utils'

describe('RulesPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('muestra el reglamento y marca la página actual en el menú', () => {
    renderApp('/rules')

    expect(screen.getByRole('heading', { name: /Reglamento – Ranking interno de tenis/, level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Versión 1')).toBeInTheDocument()
    expect(screen.getByText(/hasta cinco \(5\) posiciones por encima/)).toBeInTheDocument()
    expect(screen.getByText(/Super Tie-Break a 10 puntos\./)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(13)
    expect(screen.getByRole('link', { name: 'Reglamento' })).toHaveAttribute('aria-current', 'page')
  })

  it('se llega desde el menú', async () => {
    mockApi({ '/api/ranking': [rankingRow(1, player(1, 'Ana Gómez'))] })
    renderApp('/')
    await screen.findByText('Ana Gómez')

    await userEvent.click(screen.getByRole('link', { name: 'Reglamento' }))

    expect(await screen.findByRole('heading', { name: /Reglamento – Ranking interno de tenis/, level: 1 })).toBeInTheDocument()
  })
})
