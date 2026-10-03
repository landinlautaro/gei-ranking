import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSession } from '../../lib/authStore'
import { adminPlayer, loginAsAdmin, mockApi, player, problem, rankingRow, renderApp } from '../../test-utils'

const farFuture = () => new Date(Date.now() + 8 * 3_600_000).toISOString()

async function fillAndSubmit(username: string, password: string) {
  await userEvent.type(screen.getByLabelText('Usuario'), username)
  await userEvent.type(screen.getByLabelText('Contraseña'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
}

describe('Login y acceso a la administración', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sin sesión, las pantallas de admin mandan al login', async () => {
    mockApi({})
    renderApp('/admin/matches')

    expect(await screen.findByRole('heading', { name: 'Administración' })).toBeInTheDocument()
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument()
  })

  it('ingresa con credenciales válidas, guarda la sesión y vuelve a donde iba', async () => {
    const { requests } = mockApi({
      'POST /api/auth/login': { token: 'jwt-123', expiresAt: farFuture(), username: 'admin' },
      '/api/admin/players': [adminPlayer(1, 'Ana Gómez', 1)],
      '/api/admin/matches': { items: [], total: 0, page: 1, pageSize: 20 },
    })
    renderApp('/admin/matches')

    await fillAndSubmit('admin', 'una-clave-larga')

    expect(await screen.findByRole('heading', { name: 'Partidos' })).toBeInTheDocument()
    expect(requests.find((r) => r.path === '/api/auth/login')?.body).toEqual({ username: 'admin', password: 'una-clave-larga' })
    expect(getSession()?.token).toBe('jwt-123')
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('manda el token en los pedidos de admin y no en los públicos', async () => {
    loginAsAdmin()
    const { requests } = mockApi({
      '/api/admin/players': [adminPlayer(1, 'Ana Gómez', 1)],
      '/api/admin/matches': { items: [], total: 0, page: 1, pageSize: 20 },
      '/api/ranking': [rankingRow(1, player(1, 'Ana Gómez'))],
    })

    renderApp('/admin/matches')
    await screen.findByText('Todavía no se cargaron partidos.')
    expect(requests.find((r) => r.path === '/api/admin/matches')?.headers.Authorization).toBe('Bearer test-token')
  })

  it('muestra el error con credenciales incorrectas y no ingresa', async () => {
    mockApi({ 'POST /api/auth/login': problem(401, 'InvalidCredentials') })
    renderApp('/admin/login')

    await fillAndSubmit('admin', 'mala')

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.')
    expect(getSession()).toBeNull()
  })

  it('avisa cuando hay demasiados intentos', async () => {
    mockApi({ 'POST /api/auth/login': 429 })
    renderApp('/admin/login')

    await fillAndSubmit('admin', 'mala')

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos')
  })

  it('el botón queda deshabilitado hasta completar usuario y contraseña', () => {
    mockApi({})
    renderApp('/admin/login')

    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDisabled()
  })

  it('con sesión iniciada, el login redirige a la administración', async () => {
    loginAsAdmin()
    mockApi({ '/api/admin/players': [] })
    renderApp('/admin/login')

    expect(await screen.findByRole('heading', { name: 'Cargar resultado' })).toBeInTheDocument()
  })

  it('Salir cierra la sesión y vuelve al login', async () => {
    loginAsAdmin()
    mockApi({ '/api/admin/players': [] })
    renderApp('/admin/results/new')
    await screen.findByRole('heading', { name: 'Cargar resultado' })

    await userEvent.click(screen.getByRole('button', { name: 'Salir' }))

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    expect(getSession()).toBeNull()
    expect(screen.queryByText(/sesión venció/)).not.toBeInTheDocument()
  })

  it('si la API rechaza el token, cierra la sesión y lo explica', async () => {
    loginAsAdmin()
    mockApi({ '/api/admin/players': 401 })
    renderApp('/admin/results/new')

    expect(await screen.findByText('Tu sesión venció. Volvé a ingresar.')).toBeInTheDocument()
    expect(getSession()).toBeNull()
  })

  it('el sitio público no pide login ni muestra la administración', async () => {
    mockApi({ '/api/ranking': [rankingRow(1, player(1, 'Ana Gómez'))] })
    renderApp('/')

    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument()
    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Administración' })).toHaveAttribute('href', '/admin')
  })
})
