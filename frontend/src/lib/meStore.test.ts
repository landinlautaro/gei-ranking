import { describe, expect, it } from 'vitest'
import { clearMe, getMe, setMe } from './meStore'

describe('meStore', () => {
  it('recuerda el jugador elegido en el navegador', () => {
    setMe(7)

    expect(getMe()).toBe(7)
    expect(JSON.parse(window.localStorage.getItem('gei.me')!)).toEqual({ playerId: 7 })
  })

  it('"No soy yo" borra la elección', () => {
    setMe(7)

    clearMe()

    expect(getMe()).toBeNull()
    expect(window.localStorage.getItem('gei.me')).toBeNull()
  })
})
