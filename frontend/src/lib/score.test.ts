import { describe, expect, it } from 'vitest'
import { isSevenSix, isSplit, isValidSet, isValidSuperTieBreak, isValidTieBreak, parseCount } from './score'

describe('isValidSet', () => {
  it.each([[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6]])('acepta %i-%i en cualquier orden', (a, b) => {
    expect(isValidSet(a, b)).toBe(true)
    expect(isValidSet(b, a)).toBe(true)
  })

  it.each([[6, 5], [5, 5], [6, 6], [7, 4], [7, 7], [8, 6], [5, 3], [0, 0], [-1, 6], [6.5, 2]])('rechaza %f-%f', (a, b) => {
    expect(isValidSet(a, b)).toBe(false)
  })
})

describe('tie-break y super tie-break', () => {
  it('el tie-break es a 7 con diferencia de 2', () => {
    expect(isValidTieBreak(7, 5)).toBe(true)
    expect(isValidTieBreak(9, 7)).toBe(true)
    expect(isValidTieBreak(7, 6)).toBe(false)
    expect(isValidTieBreak(6, 4)).toBe(false)
    expect(isValidTieBreak(10, 7)).toBe(false)
  })

  it('el super tie-break es a 10 con diferencia de 2', () => {
    expect(isValidSuperTieBreak(10, 8)).toBe(true)
    expect(isValidSuperTieBreak(8, 10)).toBe(true)
    expect(isValidSuperTieBreak(12, 10)).toBe(true)
    expect(isValidSuperTieBreak(10, 9)).toBe(false)
    expect(isValidSuperTieBreak(11, 8)).toBe(false)
    expect(isValidSuperTieBreak(9, 7)).toBe(false)
  })

  it('solo un 7-6 lleva tie-break', () => {
    expect(isSevenSix(7, 6)).toBe(true)
    expect(isSevenSix(6, 7)).toBe(true)
    expect(isSevenSix(7, 5)).toBe(false)
  })
})

describe('parseCount', () => {
  it('lee enteros no negativos y devuelve null para el resto', () => {
    expect(parseCount('6')).toBe(6)
    expect(parseCount('0')).toBe(0)
    expect(parseCount('')).toBeNull()
    expect(parseCount('  ')).toBeNull()
    expect(parseCount('-1')).toBeNull()
    expect(parseCount('2.5')).toBeNull()
    expect(parseCount('abc')).toBeNull()
  })
})

describe('isSplit', () => {
  it('es true cuando cada jugador ganó un set', () => {
    expect(isSplit([6, 4], [3, 6])).toBe(true)
    expect(isSplit([4, 6], [6, 3])).toBe(true)
  })

  it('es false con dos sets para el mismo jugador o sets incompletos', () => {
    expect(isSplit([6, 4], [6, 3])).toBe(false)
    expect(isSplit([4, 6], [3, 6])).toBe(false)
    expect(isSplit([6, 4], null)).toBe(false)
  })
})
