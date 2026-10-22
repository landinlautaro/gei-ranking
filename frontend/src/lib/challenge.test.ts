import { describe, expect, it } from 'vitest'
import { challengeDeadline, challengeRelation } from './challenge'

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

describe('challengeDeadline', () => {
  // The deadline is the end of Sunday 25/10/2026, club time (UTC-3).
  const deadline = '2026-10-26T02:59:59.999Z'
  const at = (iso: string) => challengeDeadline(deadline, new Date(iso))

  it('cuenta los días de calendario del club hasta el domingo', () => {
    expect(at('2026-10-19T13:00:00Z')).toEqual({ state: 'upcoming', daysLeft: 6, label: 'Vence el dom 25/10 · quedan 6 días' })
    expect(at('2026-10-22T20:00:00Z').label).toBe('Vence el dom 25/10 · quedan 3 días')
  })

  it('el sábado queda un día, en singular', () => {
    expect(at('2026-10-24T15:00:00Z')).toMatchObject({ state: 'upcoming', daysLeft: 1, label: 'Vence el dom 25/10 · queda 1 día' })
  })

  it('el domingo vence hoy, incluso de noche aunque en UTC ya sea lunes', () => {
    expect(at('2026-10-25T12:00:00Z')).toEqual({ state: 'today', daysLeft: 0, label: 'Vence hoy' })
    expect(at('2026-10-26T02:30:00Z').state).toBe('today') // 23:30 del domingo en el club
  })

  it('pasada la medianoche del lunes ya está vencido', () => {
    expect(at('2026-10-26T03:00:00Z')).toEqual({ state: 'expired', daysLeft: 0, label: 'Venció el dom 25/10' })
    expect(at('2026-11-10T12:00:00Z').state).toBe('expired')
  })
})
