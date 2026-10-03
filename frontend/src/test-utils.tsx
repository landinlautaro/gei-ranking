import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import App from './App'
import type { Match, PlayerProfile, PlayerRef, RankingRow } from './api/types'

export function player(id: number, fullName = `Jugador ${id}`, nickname: string | null = null): PlayerRef {
  return { id, fullName, nickname, photoPath: null }
}

export function rankingRow(position: number, p: PlayerRef, overrides: Partial<RankingRow> = {}): RankingRow {
  return {
    position,
    player: p,
    played: 0,
    wins: 0,
    losses: 0,
    challengesWon: 0,
    challengesLost: 0,
    previousPosition: null,
    movement: 0,
    ...overrides,
  }
}

export function match(id: number, challenger: PlayerRef, challenged: PlayerRef, winner: PlayerRef, overrides: Partial<Match> = {}): Match {
  return {
    id,
    playedAt: '2026-03-11T12:00:00Z',
    challenger,
    challenged,
    winner,
    result: '6-4 6-3',
    completion: 'Normal',
    challengerPositionBefore: 5,
    challengerPositionAfter: 3,
    challengedPositionBefore: 3,
    challengedPositionAfter: 5,
    movementText: `${challenger.fullName} pasa del #5 al #3`,
    notes: null,
    ...overrides,
  }
}

export function profile(p: PlayerRef, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    ...p,
    hand: 'LeftHanded',
    backhand: 'TwoHanded',
    joinedAt: '2026-01-01T12:00:00Z',
    isActive: true,
    position: 5,
    previousPosition: 8,
    movement: 3,
    bestPosition: 4,
    stats: {
      played: 4,
      wins: 3,
      losses: 1,
      challengesWon: 2,
      challengesLost: 1,
      defensesWon: 1,
      defensesLost: 0,
      winPercentage: 75,
      currentStreak: 2,
    },
    canChallenge: [],
    positionHistory: [
      { at: '2026-01-01T12:00:00Z', position: 8 },
      { at: '2026-02-01T12:00:00Z', position: 5 },
    ],
    ...overrides,
  }
}

type Responder = unknown | ((query: URLSearchParams) => unknown)

/** Stubs fetch: routes by path (query string ignored); a number is returned as an HTTP error status. */
export function mockApi(routes: Record<string, Responder | number>) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (input: string) => {
    calls.push(input)
    const [path, query = ''] = input.split('?')
    if (!(path in routes)) return { ok: false, status: 404, json: async () => ({}) }
    const route = routes[path]
    if (typeof route === 'number') return { ok: false, status: route, json: async () => ({}) }
    const body = typeof route === 'function' ? route(new URLSearchParams(query)) : route
    return { ok: true, status: 200, json: async () => body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export function renderApp(route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
