import { describe, expect, it } from 'vitest'
import { challengeRelation } from './challenge'

describe('challengeRelation', () => {
  it('puede desafiar hasta 5 puestos arriba', () => {
    expect(challengeRelation(20, 19)).toBe('canChallenge')
    expect(challengeRelation(20, 15)).toBe('canChallenge')
  })

  it('el de arriba puede ser desafiado por quien está hasta 5 puestos abajo', () => {
    expect(challengeRelation(15, 20)).toBe('canBeChallenged')
  })

  it('más de 5 puestos de diferencia, o el mismo puesto, está fuera de rango', () => {
    expect(challengeRelation(20, 14)).toBe('outOfRange')
    expect(challengeRelation(14, 20)).toBe('outOfRange')
    expect(challengeRelation(7, 7)).toBe('outOfRange')
  })
})
