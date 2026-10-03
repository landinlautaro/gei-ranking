import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import App from './App'
import type { AdminMatch, AdminPlayer, MatchPreview } from './api/adminTypes'
import type { Match, PlayerProfile, PlayerRef, RankingRow } from './api/types'
import { saveSession } from './lib/authStore'

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

type Responder = unknown | ((query: URLSearchParams, body: unknown) => unknown)

export interface RecordedRequest {
  method: string
  url: string
  path: string
  query: URLSearchParams
  body: unknown
  headers: Record<string, string>
}

/**
 * Stubs fetch. Routes are keyed by path ("/api/ranking") or by method and path ("POST /api/admin/matches"; the
 * method-specific key wins). A number is returned as an HTTP error status; a function gets (query, parsed body).
 */
export function mockApi(routes: Record<string, Responder | number>) {
  const calls: string[] = []
  const requests: RecordedRequest[] = []
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const [path, queryString = ''] = input.split('?')
    const query = new URLSearchParams(queryString)
    const rawBody = init?.body
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
    calls.push(input)
    requests.push({ method, url: input, path, query, body, headers: (init?.headers ?? {}) as Record<string, string> })

    const key = `${method} ${path}` in routes ? `${method} ${path}` : path
    if (!(key in routes)) return { ok: false, status: 404, json: async () => ({}) }
    const route = routes[key]
    if (typeof route === 'number') return { ok: false, status: route, json: async () => ({}) }
    const result = typeof route === 'function' ? route(query, body) : route
    if (result instanceof ProblemResponse) return { ok: false, status: result.status, json: async () => result.body }
    return { ok: true, status: 200, json: async () => result }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, requests, fetchMock }
}

export class ProblemResponse {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    this.status = status
    this.body = body
  }
}

/** A route value that answers with an HTTP error and a problem+json body (code and field errors). */
export function problem(status: number, code: string, errors: Record<string, string[]> = {}) {
  return new ProblemResponse(status, { code, errors })
}

/** Starts an admin session so protected routes render. Call clearSession() (see setup) between tests. */
export function loginAsAdmin() {
  saveSession({ token: 'test-token', username: 'admin', expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
}

export function adminPlayer(id: number, fullName: string, position: number | null, overrides: Partial<AdminPlayer> = {}): AdminPlayer {
  return {
    id,
    fullName,
    nickname: null,
    photoPath: null,
    hand: null,
    backhand: null,
    joinedAt: '2026-01-01T12:00:00Z',
    isActive: position !== null,
    position,
    ...overrides,
  }
}

export function adminMatch(id: number, challenger: PlayerRef, challenged: PlayerRef, winner: PlayerRef, overrides: Partial<AdminMatch> = {}): AdminMatch {
  return {
    id,
    playedAt: '2026-03-11T15:00:00Z',
    challenger,
    challenged,
    winner,
    result: '6-4 6-3',
    score: { sets: [{ challengerGames: 6, challengedGames: 4 }, { challengerGames: 6, challengedGames: 3 }] },
    completion: 'Normal',
    status: 'Valid',
    challengerPositionBefore: 5,
    challengerPositionAfter: 3,
    challengedPositionBefore: 3,
    challengedPositionAfter: 5,
    movementText: `${challenger.fullName} pasa del #5 al #3`,
    warning: null,
    notes: null,
    createdAt: '2026-03-11T15:00:00Z',
    updatedAt: '2026-03-11T15:00:00Z',
    ...overrides,
  }
}

export function preview(overrides: Partial<MatchPreview> = {}): MatchPreview {
  return {
    isValid: true,
    errors: {},
    winnerSide: 'Challenger',
    winnerId: 2,
    movement: 'ChallengerSwapped',
    movementText: 'Beto pasa del #5 al #3; Ana baja del #3 al #5',
    challengerPositionBefore: 5,
    challengerPositionAfter: 3,
    challengedPositionBefore: 3,
    challengedPositionAfter: 5,
    warning: null,
    requiresOutOfRangeConfirmation: false,
    newlyWarnedMatchIds: [],
    ...overrides,
  }
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
