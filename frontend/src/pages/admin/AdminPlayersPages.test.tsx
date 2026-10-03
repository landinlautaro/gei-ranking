import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPlayer, loginAsAdmin, mockApi, problem, renderApp } from '../../test-utils'

const ana = adminPlayer(1, 'Ana Gómez', 3, { nickname: 'Anita' })
const beto = adminPlayer(2, 'Beto Ruiz', 1)
const eva = adminPlayer(5, 'Eva Baja', null)

describe('Jugadores: listado', () => {
  beforeEach(() => loginAsAdmin())
  afterEach(() => vi.unstubAllGlobals())

  it('lista a todos ordenados por posición, con los dados de baja al final', async () => {
    mockApi({ '/api/admin/players': [eva, ana, beto] })
    renderApp('/admin/players')

    const items = await screen.findAllByRole('listitem')

    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Beto Ruiz'),
      expect.stringContaining('Ana Gómez'),
      expect.stringContaining('Eva Baja'),
    ])
    expect(within(items[2]).getByText('Inactivo')).toBeInTheDocument()
    expect(within(items[1]).getByText('“Anita”')).toBeInTheDocument()
    expect(within(items[0]).getByRole('link')).toHaveAttribute('href', '/admin/players/2')
  })

  it('busca por nombre o apodo sin distinguir tildes', async () => {
    mockApi({ '/api/admin/players': [eva, ana, beto] })
    renderApp('/admin/players')
    await screen.findAllByRole('listitem')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar jugador' }), 'gomez')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText(/Ningún jugador coincide con “zzz”/)).toBeInTheDocument()
  })
})

describe('Jugadores: alta', () => {
  beforeEach(() => loginAsAdmin())
  afterEach(() => vi.unstubAllGlobals())

  it('crea un jugador al final y pasa a su ficha', async () => {
    const created = adminPlayer(9, 'Nuevo Jugador', 70, { nickname: 'Nuevo', hand: 'LeftHanded', backhand: 'TwoHanded' })
    const { requests } = mockApi({
      '/api/admin/players': [ana],
      'POST /api/admin/players': created,
      '/api/admin/players/9': created,
    })
    renderApp('/admin/players/new')
    const submit = await screen.findByRole('button', { name: 'Crear jugador' })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Nombre completo'), '  Nuevo Jugador ')
    await userEvent.type(screen.getByLabelText('Apodo (opcional)'), 'Nuevo')
    await userEvent.selectOptions(screen.getByLabelText('Mano hábil (opcional)'), 'LeftHanded')
    await userEvent.selectOptions(screen.getByLabelText('Revés (opcional)'), 'TwoHanded')
    fireEvent.change(screen.getByLabelText('Fecha de ingreso'), { target: { value: '2026-03-10' } })
    await userEvent.click(submit)

    expect(await screen.findByRole('heading', { name: 'Nuevo Jugador' })).toBeInTheDocument()
    expect(requests.find((r) => r.method === 'POST')!.body).toEqual({
      fullName: 'Nuevo Jugador',
      nickname: 'Nuevo',
      hand: 'LeftHanded',
      backhand: 'TwoHanded',
      joinedAt: '2026-03-10T12:00:00-03:00',
      position: null,
    })
  })

  it('permite elegir la posición inicial', async () => {
    const created = adminPlayer(9, 'Nuevo', 2)
    const { requests } = mockApi({ '/api/admin/players': [], 'POST /api/admin/players': created, '/api/admin/players/9': created })
    renderApp('/admin/players/new')

    await userEvent.type(await screen.findByLabelText('Nombre completo'), 'Nuevo')
    await userEvent.type(screen.getByLabelText('Posición inicial (opcional)'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Crear jugador' }))

    await screen.findByRole('heading', { name: 'Nuevo' })
    expect(requests.find((r) => r.method === 'POST')!.body).toMatchObject({ position: 2 })
  })

  it('muestra los errores del servidor junto a cada campo', async () => {
    mockApi({
      '/api/admin/players': [],
      'POST /api/admin/players': problem(422, 'ValidationFailed', { nickname: ['TooLong'], position: ['MustBePositive'] }),
    })
    renderApp('/admin/players/new')

    await userEvent.type(await screen.findByLabelText('Nombre completo'), 'Alguien')
    await userEvent.click(screen.getByRole('button', { name: 'Crear jugador' }))

    expect(await screen.findByText('Es demasiado largo.')).toBeInTheDocument()
    expect(screen.getByText('Tiene que ser 1 o más.')).toBeInTheDocument()
    expect(screen.getByLabelText('Apodo (opcional)')).toBeInvalid()
  })
})

describe('Jugadores: ficha', () => {
  beforeEach(() => loginAsAdmin())
  afterEach(() => vi.unstubAllGlobals())

  it('edita los datos y conserva la fecha de ingreso si no se toca', async () => {
    const { requests } = mockApi({
      '/api/admin/players/1': ana,
      'PUT /api/admin/players/1': { ...ana, fullName: 'Ana María Gómez' },
    })
    renderApp('/admin/players/1')

    const name = await screen.findByLabelText('Nombre completo')
    expect(name).toHaveValue('Ana Gómez')
    expect(screen.getByText(/Puesto #3 · En el club desde 01\/01\/2026/)).toBeInTheDocument()

    await userEvent.clear(name)
    await userEvent.type(name, 'Ana María Gómez')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }))

    expect(await screen.findByText('Datos guardados.')).toBeInTheDocument()
    expect(requests.find((r) => r.method === 'PUT')!.body).toMatchObject({
      fullName: 'Ana María Gómez',
      nickname: 'Anita',
      joinedAt: '2026-01-01T12:00:00Z',
    })
  })

  it('sube una foto como archivo', async () => {
    const withPhoto = { ...ana, photoPath: '/photos/player-1-abc.jpg' }
    const { requests } = mockApi({ '/api/admin/players/1': ana, 'PUT /api/admin/players/1/photo': withPhoto })
    renderApp('/admin/players/1')
    await screen.findByLabelText('Nombre completo')
    const file = new File(['binary'], 'foto.png', { type: 'image/png' })

    await userEvent.upload(screen.getByLabelText('Subir foto'), file)

    await vi.waitFor(() => expect(requests.some((r) => r.method === 'PUT' && r.path === '/api/admin/players/1/photo')).toBe(true))
    const upload = requests.find((r) => r.path === '/api/admin/players/1/photo')!
    expect(upload.body).toBeInstanceOf(FormData)
    expect((upload.body as FormData).get('file')).toBeInstanceOf(File)
    // The browser sets the multipart boundary itself: no manual content type.
    expect(upload.headers['Content-Type']).toBeUndefined()
  })

  it('traduce los errores de la foto', async () => {
    mockApi({
      '/api/admin/players/1': ana,
      'PUT /api/admin/players/1/photo': problem(422, 'ValidationFailed', { photo: ['TooLarge'] }),
    })
    renderApp('/admin/players/1')
    await screen.findByLabelText('Nombre completo')

    await userEvent.upload(screen.getByLabelText('Subir foto'), new File(['x'], 'foto.png', { type: 'image/png' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La foto pesa más de 5 MB.')
  })

  it('quita la foto con confirmación', async () => {
    const withPhoto = { ...ana, photoPath: '/photos/player-1-abc.jpg' }
    const { requests } = mockApi({ '/api/admin/players/1': withPhoto, 'DELETE /api/admin/players/1/photo': ana })
    renderApp('/admin/players/1')

    await userEvent.click(await screen.findByRole('button', { name: 'Quitar foto' }))
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Sí, quitar' }))

    await vi.waitFor(() => expect(requests.some((r) => r.method === 'DELETE' && r.path === '/api/admin/players/1/photo')).toBe(true))
  })

  it('da de baja con confirmación', async () => {
    let player = ana
    const { requests } = mockApi({
      '/api/admin/players/1': () => player,
      'POST /api/admin/players/1/deactivate': () => {
        player = { ...ana, isActive: false, position: null }
        return player
      },
    })
    renderApp('/admin/players/1')

    await userEvent.click(await screen.findByRole('button', { name: 'Dar de baja' }))
    expect(screen.getByText('¿Dar de baja a Ana Gómez?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sí, dar de baja' }))

    expect(await screen.findByText('Reingresar al ranking', { selector: 'button' })).toBeInTheDocument()
    expect(screen.getByText('Fuera del ranking', { exact: false })).toBeInTheDocument()
    expect(requests.some((r) => r.method === 'POST' && r.path === '/api/admin/players/1/deactivate')).toBe(true)
  })

  it('reingresa a un jugador dado de baja en una posición', async () => {
    const { requests } = mockApi({
      '/api/admin/players/5': eva,
      'POST /api/admin/players/5/reactivate': { ...eva, isActive: true, position: 4 },
    })
    renderApp('/admin/players/5')

    expect(await screen.findByText('Inactivo')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Posición (opcional)'), '4')
    await userEvent.click(screen.getByRole('button', { name: 'Reingresar al ranking' }))

    await vi.waitFor(() => expect(requests.some((r) => r.method === 'POST' && r.path === '/api/admin/players/5/reactivate')).toBe(true))
    expect(requests.find((r) => r.path === '/api/admin/players/5/reactivate')!.body).toEqual({ position: 4 })
  })

  it('muestra el error si el jugador no existe', async () => {
    mockApi({ '/api/admin/players/99': 404 })
    renderApp('/admin/players/99')

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos lo que buscás.')
  })
})
