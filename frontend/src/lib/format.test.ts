import { describe, expect, it } from 'vitest'
import { avatarUri } from './avatar'
import { formatDate, movementDescription, normalizeText, ownMovementDescription, percentage, streakDescription } from './format'

describe('formatDate', () => {
  it('muestra dd/mm/aaaa en la zona horaria del club', () => {
    // 01:30 UTC del 11/03 todavía es 10/03 a las 22:30 en Buenos Aires.
    expect(formatDate('2026-03-11T01:30:00Z')).toBe('10/03/2026')
    expect(formatDate('2026-03-11T12:00:00Z')).toBe('11/03/2026')
  })
})

describe('normalizeText', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizeText('Gastón Quintana')).toBe('gaston quintana')
    expect(normalizeText('ÓSCAR González')).toBe('oscar gonzalez')
  })
})

describe('descripciones', () => {
  it('describe el movimiento', () => {
    expect(movementDescription(3)).toBe('Subió 3 puestos')
    expect(movementDescription(1)).toBe('Subió 1 puesto')
    expect(movementDescription(-2)).toBe('Bajó 2 puestos')
    expect(movementDescription(0)).toBe('Sin cambios de posición')
    expect(ownMovementDescription(3)).toBe('Subiste 3 puestos en tu último cambio')
    expect(ownMovementDescription(-1)).toBe('Bajaste 1 puesto en tu último cambio')
    expect(ownMovementDescription(0)).toBe('Tu puesto no cambió')
  })

  it('describe la racha', () => {
    expect(streakDescription(3)).toBe('3 victorias seguidas')
    expect(streakDescription(-1)).toBe('1 derrota seguidas')
    expect(streakDescription(0)).toBe('—')
  })

  it('formatea el porcentaje', () => {
    expect(percentage(66.7)).toBe('66,7%')
    expect(percentage(100)).toBe('100%')
    expect(percentage(null)).toBe('—')
  })
})

describe('avatarUri', () => {
  it('es determinístico por id', () => {
    expect(avatarUri(7)).toBe(avatarUri(7))
    expect(avatarUri(7)).toMatch(/^data:image\/svg\+xml/)
  })

  it('hay varios avatares distintos', () => {
    const uris = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(avatarUri))
    expect(uris.size).toBeGreaterThan(1)
  })
})
