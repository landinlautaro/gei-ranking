import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminMatch, adminPlayer, loginAsAdmin, mockApi, player, preview, problem, renderApp } from '../../test-utils'

const players = [
  adminPlayer(1, 'Ana Gómez', 3),
  adminPlayer(2, 'Beto Ruiz', 5),
  adminPlayer(3, 'Carla Díaz', 4),
  adminPlayer(4, 'Dani Paz', 12),
  adminPlayer(5, 'Eva Baja', null),
]

const created = {
  match: adminMatch(10, player(2, 'Beto Ruiz'), player(1, 'Ana Gómez'), player(2, 'Beto Ruiz'), {
    movementText: 'Beto Ruiz pasa del #5 al #3; Ana Gómez baja del #3 al #5',
  }),
  newlyWarnedMatchIds: [],
}

function routes(extra: Record<string, unknown> = {}) {
  return {
    '/api/admin/players': players,
    'POST /api/admin/matches/preview': preview(),
    'POST /api/admin/matches': created,
    ...extra,
  } as Parameters<typeof mockApi>[0]
}

async function type(label: string, value: string) {
  await userEvent.type(screen.getByLabelText(label), value)
}

async function fillNormalMatch() {
  await userEvent.selectOptions(await screen.findByLabelText('Desafiante'), '2')
  await userEvent.selectOptions(screen.getByLabelText('Desafiado'), '1')
  fireEvent.change(screen.getByLabelText('Fecha del partido'), { target: { value: '2026-03-10' } })
  await type('Set 1: games del desafiante', '6')
  await type('Set 1: games del desafiado', '4')
  await type('Set 2: games del desafiante', '6')
  await type('Set 2: games del desafiado', '3')
}

describe('Cargar resultado', () => {
  beforeEach(() => loginAsAdmin())
  afterEach(() => vi.unstubAllGlobals())

  it('lista a los jugadores del ranking con su posición y no a los dados de baja', async () => {
    mockApi(routes())
    renderApp('/admin/results/new')

    const select = await screen.findByLabelText('Desafiante')
    const names = within(select).getAllByRole('option').map((o) => o.textContent)

    expect(names).toEqual(['Elegí un jugador…', '#3 · Ana Gómez', '#4 · Carla Díaz', '#5 · Beto Ruiz', '#12 · Dani Paz'])
  })

  it('al elegir desafiante muestra a quiénes puede desafiar y lo saca de la lista de desafiados', async () => {
    mockApi(routes())
    renderApp('/admin/results/new')

    expect(await screen.findByText('Elegí primero al desafiante.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Desafiante'), '4')

    expect(screen.getByText('Puede desafiar del #7 al #11.')).toBeInTheDocument()
    const challenged = within(screen.getByLabelText('Desafiado')).getAllByRole('option').map((o) => o.textContent)
    expect(challenged).not.toContain('#12 · Dani Paz')
  })

  it('muestra la vista previa del movimiento con el resultado cargado', async () => {
    const { requests } = mockApi(routes())
    renderApp('/admin/results/new')

    await fillNormalMatch()

    expect(await screen.findByText('Gana Beto Ruiz')).toBeInTheDocument()
    expect(screen.getByText('Beto pasa del #5 al #3; Ana baja del #3 al #5')).toBeInTheDocument()
    expect(screen.getByText(/Desafiante: #5 → #3 · Desafiado: #3 → #5/)).toBeInTheDocument()

    const request = requests.filter((r) => r.path === '/api/admin/matches/preview').at(-1)!
    expect(request.body).toMatchObject({
      challengerId: 2,
      challengedId: 1,
      playedAt: '2026-03-10T12:00:00-03:00',
      completion: 'Normal',
      winner: null,
      score: { sets: [{ challengerGames: 6, challengedGames: 4 }, { challengerGames: 6, challengedGames: 3 }], superTieBreak: null },
    })
    expect(request.query.get('editingMatchId')).toBeNull()
  })

  it('no pide la vista previa hasta que el resultado está completo', async () => {
    const { requests } = mockApi(routes())
    renderApp('/admin/results/new')
    await userEvent.selectOptions(await screen.findByLabelText('Desafiante'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Desafiado'), '1')
    await type('Set 1: games del desafiante', '6')

    expect(screen.getByText(/Completá jugadores, fecha y resultado/)).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(requests.some((r) => r.path === '/api/admin/matches/preview')).toBe(false)
  })

  it('marca un set inválido apenas se escribe', async () => {
    mockApi(routes())
    renderApp('/admin/results/new')
    await screen.findByLabelText('Desafiante')

    await type('Set 1: games del desafiante', '6')
    await type('Set 1: games del desafiado', '5')

    expect(screen.getByRole('alert')).toHaveTextContent('Set 1: 6-5 no es un resultado válido')
    expect(screen.getByLabelText('Set 1: games del desafiado')).toBeInvalid()
  })

  it('pide el tie-break solo en un 7-6 y el super tie-break solo con un set para cada uno', async () => {
    mockApi(routes())
    renderApp('/admin/results/new')
    await screen.findByLabelText('Desafiante')
    expect(screen.queryByLabelText('Super Tie-Break del desafiante')).not.toBeInTheDocument()

    await type('Set 1: games del desafiante', '7')
    await type('Set 1: games del desafiado', '6')
    expect(screen.getByLabelText('Set 1: tie-break del desafiante')).toBeInTheDocument()

    await type('Set 2: games del desafiante', '3')
    await type('Set 2: games del desafiado', '6')
    expect(screen.getByLabelText('Super Tie-Break del desafiante')).toBeInTheDocument()
    expect(screen.queryByLabelText('Set 2: tie-break del desafiante')).not.toBeInTheDocument()
  })

  it('manda el super tie-break cuando corresponde', async () => {
    const { requests } = mockApi(routes())
    renderApp('/admin/results/new')
    await userEvent.selectOptions(await screen.findByLabelText('Desafiante'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Desafiado'), '1')
    await type('Set 1: games del desafiante', '6')
    await type('Set 1: games del desafiado', '4')
    await type('Set 2: games del desafiante', '3')
    await type('Set 2: games del desafiado', '6')
    await type('Super Tie-Break del desafiante', '10')
    await type('Super Tie-Break del desafiado', '8')

    await screen.findByText('Gana Beto Ruiz')

    const body = requests.filter((r) => r.path === '/api/admin/matches/preview').at(-1)!.body as { score: { superTieBreak: unknown } }
    expect(body.score.superTieBreak).toEqual({ challenger: 10, challenged: 8 })
  })

  it('traduce los errores de la vista previa y no deja guardar', async () => {
    mockApi(routes({ 'POST /api/admin/matches/preview': preview({ isValid: false, movementText: null, errors: { score: ['InvalidSuperTieBreak'], challengedId: ['SamePlayer'] } }) }))
    renderApp('/admin/results/new')

    await fillNormalMatch()

    expect(await screen.findByText(/Resultado: El Super Tie-Break es a 10 puntos/)).toBeInTheDocument()
    expect(screen.getByText(/Desafiado: El desafiante y el desafiado no pueden ser la misma persona/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar resultado' })).toBeDisabled()
  })

  it('guarda, muestra el movimiento aplicado y permite cargar otro', async () => {
    const { requests } = mockApi(routes())
    renderApp('/admin/results/new')
    await fillNormalMatch()
    const save = screen.getByRole('button', { name: 'Guardar resultado' })
    await waitFor(() => expect(save).toBeEnabled())

    await userEvent.click(save)

    expect(await screen.findByText(/Resultado guardado\. El ranking ya está actualizado\./)).toBeInTheDocument()
    expect(screen.getByText(/Beto Ruiz pasa del #5 al #3; Ana Gómez baja del #3 al #5/)).toBeInTheDocument()
    const post = requests.find((r) => r.method === 'POST' && r.path === '/api/admin/matches')!
    expect(post.body).toMatchObject({ challengerId: 2, challengedId: 1, allowOutOfRange: false })

    await userEvent.click(screen.getByRole('button', { name: 'Cargar otro resultado' }))
    expect(await screen.findByLabelText('Desafiante')).toHaveValue('')
    expect(screen.getByLabelText('Fecha del partido')).toHaveValue('2026-03-10')
  })

  it('un desafío fuera de rango exige confirmar antes de guardar', async () => {
    const { requests } = mockApi(routes({
      'POST /api/admin/matches/preview': preview({ warning: 'OutOfRange', requiresOutOfRangeConfirmation: true }),
    }))
    renderApp('/admin/results/new')
    await fillNormalMatch()

    expect(await screen.findByText(/Fuera de rango\./)).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Guardar resultado' })
    expect(save).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox', { name: /fuera de rango y quiero guardarlo igual/ }))
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)

    await screen.findByText(/Resultado guardado/)
    expect(requests.find((r) => r.method === 'POST' && r.path === '/api/admin/matches')!.body).toMatchObject({ allowOutOfRange: true })
  })

  it('avisa de los partidos posteriores que quedarían fuera de rango', async () => {
    mockApi(routes({ 'POST /api/admin/matches/preview': preview({ newlyWarnedMatchIds: [4, 9] }) }))
    renderApp('/admin/results/new')

    await fillNormalMatch()

    expect(await screen.findByText(/2 partidos posteriores quedarían fuera de rango/)).toBeInTheDocument()
  })

  it('tras guardar, avisa de los partidos posteriores que quedaron marcados', async () => {
    mockApi(routes({ 'POST /api/admin/matches': { ...created, newlyWarnedMatchIds: [4] } }))
    renderApp('/admin/results/new')
    await fillNormalMatch()
    const save = screen.getByRole('button', { name: 'Guardar resultado' })
    await waitFor(() => expect(save).toBeEnabled())

    await userEvent.click(save)

    expect(await screen.findByText(/1 partido posterior quedó fuera de rango/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Partidos con advertencias' })).toHaveAttribute('href', '/admin/matches?withWarnings=true')
  })

  it('muestra el error del servidor al guardar y conserva lo cargado', async () => {
    mockApi(routes({ 'POST /api/admin/matches': problem(409, 'OutOfRangeConfirmationRequired') }))
    renderApp('/admin/results/new')
    await fillNormalMatch()
    const save = screen.getByRole('button', { name: 'Guardar resultado' })
    await waitFor(() => expect(save).toBeEnabled())

    await userEvent.click(save)

    expect(await screen.findByRole('alert')).toHaveTextContent('El desafío está fuera de rango')
    expect(screen.getByLabelText('Set 1: games del desafiante')).toHaveValue(6)
  })

  it('un W.O. no pide score y exige indicar quién ganó', async () => {
    const { requests } = mockApi(routes())
    renderApp('/admin/results/new')
    await userEvent.selectOptions(await screen.findByLabelText('Desafiante'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Desafiado'), '1')
    await userEvent.click(screen.getByRole('radio', { name: 'W.O.' }))

    expect(screen.queryByLabelText('Set 1: games del desafiante')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar resultado' })).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: 'Ana Gómez' }))

    await screen.findByText('Gana Beto Ruiz')
    expect(requests.filter((r) => r.path === '/api/admin/matches/preview').at(-1)!.body).toMatchObject({
      completion: 'Walkover',
      score: null,
      winner: 'Challenged',
    })
  })

  it('un abandono acepta el score parcial y el ganador', async () => {
    const { requests } = mockApi(routes())
    renderApp('/admin/results/new')
    await userEvent.selectOptions(await screen.findByLabelText('Desafiante'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Desafiado'), '1')
    await userEvent.click(screen.getByRole('radio', { name: 'Abandono' }))
    await type('Set 1: games del desafiante', '6')
    await type('Set 1: games del desafiado', '2')
    await userEvent.click(screen.getByRole('radio', { name: 'Beto Ruiz' }))

    await screen.findByText('Gana Beto Ruiz')

    expect(requests.filter((r) => r.path === '/api/admin/matches/preview').at(-1)!.body).toMatchObject({
      completion: 'Retirement',
      winner: 'Challenger',
      score: { sets: [{ challengerGames: 6, challengedGames: 2 }] },
    })
  })
})

describe('Editar partido', () => {
  beforeEach(() => loginAsAdmin())
  afterEach(() => vi.unstubAllGlobals())

  const ana = player(1, 'Ana Gómez')
  const beto = player(2, 'Beto Ruiz')

  it('carga el partido en el formulario, previsualiza contra el partido que se edita y guarda con PUT', async () => {
    const { requests } = mockApi(routes({
      '/api/admin/matches/7': adminMatch(7, beto, ana, beto, { notes: 'Cancha 2' }),
      'PUT /api/admin/matches/7': { match: adminMatch(7, beto, ana, ana), newlyWarnedMatchIds: [12] },
    }))
    renderApp('/admin/matches/7/edit')

    expect(await screen.findByLabelText('Desafiante')).toHaveValue('2')
    expect(screen.getByLabelText('Desafiado')).toHaveValue('1')
    expect(screen.getByLabelText('Fecha del partido')).toHaveValue('2026-03-11')
    expect(screen.getByLabelText('Set 2: games del desafiado')).toHaveValue(3)
    expect(screen.getByLabelText('Observaciones (opcional)')).toHaveValue('Cancha 2')

    const save = await screen.findByRole('button', { name: 'Guardar cambios' })
    await waitFor(() => expect(save).toBeEnabled())
    expect(requests.find((r) => r.path === '/api/admin/matches/preview')!.query.get('editingMatchId')).toBe('7')

    await userEvent.click(save)

    expect(await screen.findByText(/Cambios guardados/)).toBeInTheDocument()
    expect(screen.getByText(/1 partido posterior quedó fuera de rango/)).toBeInTheDocument()
    const put = requests.find((r) => r.method === 'PUT')!
    // The date was not touched, so the original instant (and its time of day) is kept.
    expect(put.body).toMatchObject({ challengerId: 2, challengedId: 1, playedAt: '2026-03-11T15:00:00Z' })
  })

  it('un partido anulado no se puede editar', async () => {
    mockApi(routes({ '/api/admin/matches/7': adminMatch(7, beto, ana, beto, { status: 'Voided' }) }))
    renderApp('/admin/matches/7/edit')

    expect(await screen.findByRole('alert')).toHaveTextContent('anulado y no se puede editar')
    expect(screen.queryByLabelText('Desafiante')).not.toBeInTheDocument()
  })

  it('un partido inexistente muestra el error', async () => {
    mockApi(routes({ '/api/admin/matches/99': 404 }))
    renderApp('/admin/matches/99/edit')

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos lo que buscás.')
  })
})
