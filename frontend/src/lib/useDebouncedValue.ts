import { useEffect, useState } from 'react'

/** The value, but only after it stopped changing for <paramref name="delayMs"/>. Compared by JSON so new-but-equal objects do not restart it. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const key = JSON.stringify(value)
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(JSON.parse(key) as T), delayMs)
    return () => window.clearTimeout(timer)
  }, [key, delayMs])

  return debounced
}
