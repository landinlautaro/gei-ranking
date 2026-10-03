import { describe, expect, it } from 'vitest'
import { emptyState, needsSuperTieBreak, stateFromMatch, toInput, type FormState } from './matchFormModel'
import { adminMatch, player } from '../../test-utils'

const base = (changes: Partial<FormState> = {}): FormState => ({
  ...emptyState(),
  challengerId: '8',
  challengedId: '5',
  date: '2026-03-10',
  ...changes,
})

const sets = { set1: { c: '6', d: '4', tbC: '', tbD: '' }, set2: { c: '6', d: '3', tbC: '', tbD: '' } }

describe('toInput', () => {
  it('no evalúa hasta tener jugadores y fecha', () => {
    expect(toInput(base({ challengerId: '' }))).toBeNull()
    expect(toInput(base({ challengedId: '' }))).toBeNull()
    expect(toInput(base({ date: '', ...sets }))).toBeNull()
  })

  it('un partido normal necesita los dos sets completos', () => {
    expect(toInput(base())).toBeNull()
    expect(toInput(base({ set1: sets.set1 }))).toBeNull()

    const input = toInput(base(sets))!
    expect(input.score).toEqual({
      sets: [
        { challengerGames: 6, challengedGames: 4, tieBreak: null },
        { challengerGames: 6, challengedGames: 3, tieBreak: null },
      ],
      superTieBreak: null,
    })
    expect(input.winner).toBeNull()
  })

  it('la fecha se guarda al mediodía de la hora del club', () => {
    expect(toInput(base(sets))!.playedAt).toBe('2026-03-10T12:00:00-03:00')
  })

  it('con un set para cada uno exige el super tie-break', () => {
    const split = { set1: { c: '6', d: '4', tbC: '', tbD: '' }, set2: { c: '3', d: '6', tbC: '', tbD: '' } }
    expect(needsSuperTieBreak(base(split))).toBe(true)
    expect(toInput(base(split))).toBeNull()

    const input = toInput(base({ ...split, stbC: '10', stbD: '7' }))!
    expect(input.score?.superTieBreak).toEqual({ challenger: 10, challenged: 7 })
  })

  it('ignora el super tie-break cargado si ya no corresponde', () => {
    const input = toInput(base({ ...sets, stbC: '10', stbD: '7' }))!
    expect(input.score?.superTieBreak).toBeNull()
  })

  it('el tie-break solo viaja en un 7-6', () => {
    const input = toInput(
      base({ set1: { c: '7', d: '6', tbC: '7', tbD: '4' }, set2: { c: '6', d: '3', tbC: '9', tbD: '9' } }),
    )!
    expect(input.score?.sets[0].tieBreak).toEqual({ challenger: 7, challenged: 4 })
    expect(input.score?.sets[1].tieBreak).toBeNull()
  })

  it('un W.O. no lleva score pero sí ganador', () => {
    expect(toInput(base({ completion: 'Walkover' }))).toBeNull()

    const input = toInput(base({ completion: 'Walkover', winner: 'Challenged' }))!
    expect(input.score).toBeNull()
    expect(input.winner).toBe('Challenged')
  })

  it('un abandono acepta score parcial y exige ganador', () => {
    const partial = { completion: 'Retirement' as const, set1: { c: '6', d: '2', tbC: '', tbD: '' } }
    expect(toInput(base(partial))).toBeNull()

    const input = toInput(base({ ...partial, winner: 'Challenger' }))!
    expect(input.score?.sets).toHaveLength(1)
    expect(input.winner).toBe('Challenger')
  })

  it('al editar conserva la hora original si no se tocó la fecha', () => {
    const original = '2026-03-10T18:45:00Z'

    expect(toInput(base(sets), original)!.playedAt).toBe(original)
    expect(toInput(base({ ...sets, date: '2026-03-12' }), original)!.playedAt).toBe('2026-03-12T12:00:00-03:00')
  })

  it('las observaciones vacías se mandan como null', () => {
    expect(toInput(base({ ...sets, notes: '   ' }))!.notes).toBeNull()
    expect(toInput(base({ ...sets, notes: ' lluvia ' }))!.notes).toBe('lluvia')
  })
})

describe('stateFromMatch', () => {
  it('carga un partido existente en el formulario', () => {
    const a = player(1, 'Ana')
    const b = player(2, 'Beto')
    const match = adminMatch(7, b, a, b, {
      completion: 'Retirement',
      score: { sets: [{ challengerGames: 2, challengedGames: 6 }] },
      notes: 'Lesión',
    })

    const state = stateFromMatch(match)

    expect(state).toMatchObject({ challengerId: '2', challengedId: '1', completion: 'Retirement', winner: 'Challenger', notes: 'Lesión' })
    expect(state.set1).toMatchObject({ c: '2', d: '6' })
    expect(state.date).toBe('2026-03-11')
  })
})
