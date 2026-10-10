import { describe, expect, it } from 'vitest'
import { match, player, rankingRow } from '../test-utils'
import { matchMessage, rankingMessage } from './whatsapp'

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

  it('sin resultados omite esa sección', () => {
    const text = rankingMessage({ ...base, matches: [] })

    expect(text).not.toContain('Resultados desde')
    expect(text.endsWith('Ver todo: https://gei.example/')).toBe(true)
  })
})
