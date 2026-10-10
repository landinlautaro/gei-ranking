import { useSyncExternalStore } from 'react'

const QUERY = '(min-width: 40rem)' // Tailwind `sm`

function subscribe(listener: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}

/** True from the `sm` breakpoint up. Without matchMedia (tests, old browsers) it assumes a wide screen. */
export function useIsWide(): boolean {
  return useSyncExternalStore(
    typeof window.matchMedia === 'function' ? subscribe : () => () => {},
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : true),
    () => true,
  )
}
