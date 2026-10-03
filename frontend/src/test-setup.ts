import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { clearSession } from './lib/authStore'

// Each test starts logged out.
afterEach(() => {
  clearSession()
  window.localStorage.clear()
})
