import { describe, expect, it } from 'vitest'
import { challenge, match, player, rankingRow } from '../test-utils'
import { challengeMessage, matchMessage, rankingMessage } from './whatsapp'

const ana = player(1, 'Ana Gómez')
const beto = player(2, 'Beto Pérez')

describe('matchMessage', () => {
  it('dice quién le ganó a quién, con el score y el movimiento', () => {
    const m = match(1, beto, ana, beto, { movementText: 'Beto pasa del #5 al #3' })

    expect(matchMessage(m)).toBe('🎾 *Resultado*\nBeto Pérez le ganó a Ana Gómez 6-4 6-3\nBeto pasa del #5 al #3')
  })

  it('cuando gana el desafiado el ganador sigue primero', () => {
    const m = match(1, beto, ana, ana, { result: '4-6 6-3 7-10', movementText: null })

    expect(matchMessage(m)).toBe('🎾 *Resultado*\nAna Gómez le ganó a Beto Pérez 4-6 6-3 7-10')
  })

  it('un W.O. no muestra score', () => {
    const m = match(1, beto, ana, beto, { completion: 'Walkover', result: 'W.O.', movementText: null })

    expect(matchMessage(m)).toContain('Beto Pérez le ganó a Ana Gómez por W.O.')
  })
})

describe('challengeMessage', () => {
  it('dice quién desafía a quién, con los puestos y cuándo vence', () => {
    const c = challenge(1, beto, ana, { challengerPosition: 8, challengedPosition: 5, deadlineAt: '2026-10-26T02:59:59.999Z' })

    expect(challengeMessage(c)).toBe('🎾 *Desafío*\n#8 Beto Pérez vs #5 Ana Gómez\nVence el dom 25/10')
  })

  it('si ya está coordinado suma el día y la hora, antes del vencimiento', () => {
    const c = challenge(1, beto, ana, {
      challengerPosition: 8,
      challengedPosition: 5,
      status: 'Scheduled',
      scheduledAt: '2026-10-22T22:00:00Z',
      deadlineAt: '2026-10-26T02:59:59.999Z',
    })

    expect(challengeMessage(c)).toBe('🎾 *Desafío*\n#8 Beto Pérez vs #5 Ana Gómez\nCoordinado: jue 22/10 19:00\nVence el dom 25/10')
  })

  it('sin puesto (fuera del ranking) deja solo el nombre', () => {
    const c = challenge(1, beto, ana, { challengerPosition: null, deadlineAt: '2026-10-26T02:59:59.999Z' })

    expect(challengeMessage(c)).toContain('Beto Pérez vs #5 Ana Gómez')
  })
})

describe('rankingMessage', () => {
  const rows = [rankingRow(1, ana), rankingRow(2, beto)]
  const base = { rows, publishedAt: '2026-10-13T12:00:00Z', since: '2026-10-06T12:00:00Z', siteUrl: 'https://gei.example/' }

  it('lista el ranking, los resultados del más viejo al más nuevo y el link', () => {
    const newer = match(2, ana, beto, ana, { playedAt: '2026-10-12T12:00:00Z', movementText: null })
    const older = match(1, beto, ana, beto, { playedAt: '2026-10-08T12:00:00Z', movementText: 'Beto pasa del #5 al #3' })

    expect(rankingMessage({ ...base, matches: [newer, older] })).toBe(
      [
        '🎾 *Ranking GEI* — 13/10/2026',
        '',
        '1. Ana Gómez',
        '2. Beto Pérez',
        '',
        '*Resultados desde el 06/10/2026*',
        '• Beto Pérez le ganó a Ana Gómez 6-4 6-3 (Beto pasa del #5 al #3)',
        '• Ana Gómez le ganó a Beto Pérez 6-4 6-3',
        '',
        'Ver todo: https://gei.example/',
      ].join('\n'),
    )
  })

  it('suma los desafíos pendientes (con su coordinación) y los vencidos antes del link', () => {
    const challenges = {
      active: [
        challenge(1, beto, ana, { challengerPosition: 8, challengedPosition: 5, deadlineAt: '2026-10-19T02:59:59.999Z' }),
        challenge(2, ana, beto, { challengerPosition: 3, challengedPosition: 2, status: 'Scheduled', scheduledAt: '2026-10-15T22:00:00Z' }),
      ],
      expired: [challenge(3, beto, ana, { challengerPosition: 7, challengedPosition: 4, deadlineAt: '2026-10-12T02:59:59.999Z' })],
    }

    expect(rankingMessage({ ...base, matches: [], challenges })).toBe(
      [
        '🎾 *Ranking GEI* — 13/10/2026',
        '',
        '1. Ana Gómez',
        '2. Beto Pérez',
        '',
        '*Desafíos pendientes*',
        '• #8 Beto Pérez vs #5 Ana Gómez (vence el dom 18/10)',
        '• #3 Ana Gómez vs #2 Beto Pérez (coordinado: jue 15/10 19:00)',
        '',
        '*Desafíos vencidos*',
        '• #7 Beto Pérez vs #4 Ana Gómez (venció el dom 11/10)',
        '',
        'Ver todo: https://gei.example/',
      ].join('\n'),
    )
  })

  it('sin desafíos abiertos omite esas secciones', () => {
    const text = rankingMessage({ ...base, matches: [], challenges: { active: [], expired: [] } })

    expect(text).not.toContain('Desafíos')
  })

  it('sin resultados omite esa sección', () => {
    const text = rankingMessage({ ...base, matches: [] })

    expect(text).not.toContain('Resultados desde')
    expect(text.endsWith('Ver todo: https://gei.example/')).toBe(true)
  })
})
