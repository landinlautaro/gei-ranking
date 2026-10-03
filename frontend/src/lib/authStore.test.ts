import { describe, expect, it } from 'vitest'
import { clearSession, getLogoutReason, getSession, saveSession } from './authStore'

const future = () => new Date(Date.now() + 3_600_000).toISOString()

describe('authStore', () => {
  it('guarda y recupera la sesión', () => {
    saveSession({ token: 't', username: 'admin', expiresAt: future() })

    expect(getSession()?.username).toBe('admin')
    expect(JSON.parse(window.localStorage.getItem('gei.admin.session')!).token).toBe('t')
  })

  it('una sesión vencida cuenta como cerrada y se borra', () => {
    saveSession({ token: 't', username: 'admin', expiresAt: new Date(Date.now() - 1000).toISOString() })

    expect(getSession()).toBeNull()
    expect(window.localStorage.getItem('gei.admin.session')).toBeNull()
  })

  it('cerrar sesión borra todo y recuerda el motivo', () => {
    saveSession({ token: 't', username: 'admin', expiresAt: future() })

    clearSession('expired')

    expect(getSession()).toBeNull()
    expect(getLogoutReason()).toBe('expired')
    saveSession({ token: 't', username: 'admin', expiresAt: future() })
    expect(getLogoutReason()).toBeNull()
  })
})
