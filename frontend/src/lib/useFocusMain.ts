import { useEffect, useRef, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * A single page app does not reload on navigation, so keyboard and screen reader users would stay where they were.
 * After each navigation (not the first load) focus moves to the main content, which also makes the new page title announced.
 */
export function useFocusMainOnNavigation(ref: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    ref.current?.focus({ preventScroll: false })
  }, [pathname, ref])
}
