import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'
import { mockApi, player, rankingRow, renderApp } from '../test-utils'

function Bomb(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('muestra un mensaje en vez de una página en blanco', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al ranking' })).toHaveAttribute('href', '/')
  })

  it('no interfiere cuando todo anda bien', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <p>contenido</p>
        </ErrorBoundary>
      </MemoryRouter>,
    )

    expect(screen.getByText('contenido')).toBeInTheDocument()
  })
})

describe('Estructura y accesibilidad base', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('el primer elemento enfocable es el enlace para saltar al contenido', async () => {
    mockApi({ '/api/ranking': [rankingRow(1, player(1, 'Ana Gómez'))] })
    renderApp('/')
    await screen.findByText('Ana Gómez')

    await userEvent.tab()

    const skip = screen.getByRole('link', { name: 'Saltar al contenido' })
    expect(skip).toHaveFocus()
    expect(skip).toHaveAttribute('href', '#contenido')
    expect(document.getElementById('contenido')).toBe(screen.getByRole('main'))
  })

  it('al navegar a otra página el foco pasa al contenido principal', async () => {
    mockApi({ '/api/ranking': [rankingRow(1, player(1, 'Ana Gómez'))], '/api/matches': { items: [], total: 0, page: 1, pageSize: 20 }, '/api/players': [] })
    renderApp('/')
    await screen.findByText('Ana Gómez')
    expect(screen.getByRole('main')).not.toHaveFocus()

    await userEvent.click(screen.getByRole('link', { name: 'Partidos' }))

    expect(await screen.findByRole('heading', { name: 'Partidos' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('el menú marca la página actual', async () => {
    mockApi({ '/api/ranking': [], '/api/matches': { items: [], total: 0, page: 1, pageSize: 20 }, '/api/players': [] })
    renderApp('/matches')

    const current = await screen.findByRole('link', { name: 'Partidos' })

    expect(current).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Ranking' })).not.toHaveAttribute('aria-current')
  })
})
