import { useSyncExternalStore } from 'react'

export interface Session {
  token: string
  username: string
  expiresAt: string
}

const STORAGE_KEY = 'gei.admin.session'

function isValid(value: unknown): value is Session {
  const s = value as Session | null
  return !!s && typeof s.token === 'string' && typeof s.username === 'string' && !Number.isNaN(Date.parse(s.expiresAt))
}

function load(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

function persist(value: Session | null) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be blocked (private mode): the session then lives only in memory.
  }
}

let session: Session | null = load()
let logoutReason: 'expired' | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

/** The current session, or null when logged out or the token already expired. */
export function getSession(): Session | null {
  if (session && Date.parse(session.expiresAt) <= Date.now()) {
    session = null
    persist(null)
  }
  return session
}

export function saveSession(next: Session) {
  logoutReason = null
  session = next
  persist(next)
  emit()
}

/** Why the last session ended (read once by the login page). */
export function getLogoutReason(): 'expired' | null {
  return logoutReason
}

export function clearSession(reason: 'expired' | null = null) {
  if (!session) return
  logoutReason = reason
  session = null
  persist(null)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession)
}
