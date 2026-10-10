import { useSyncExternalStore } from 'react'

/** "Soy yo": which player this device belongs to. Lives only in this browser (no login, no server). */
const STORAGE_KEY = 'gei.me'

function load(): number | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    const id = (parsed as { playerId?: unknown } | null)?.playerId
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

function persist(value: number | null) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId: value }))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be blocked (private mode): the choice then lives only until the page is closed.
  }
}

let me: number | null = load()
const listeners = new Set<() => void>()

function set(next: number | null) {
  if (next === me) return
  me = next
  persist(next)
  listeners.forEach((listener) => listener())
}

export const setMe = (playerId: number) => set(playerId)
export const clearMe = () => set(null)
export const getMe = () => me

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMe(): number | null {
  return useSyncExternalStore(subscribe, getMe, getMe)
}
